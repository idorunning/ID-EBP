import postgres from "npm:postgres@3.4.4";
import { extract, fetchPage, norm, titleMatch } from "../_shared/publisher-metadata.ts";
import { OPENALEX_ADVISORY_LOCK, retryAfterMs, retryDelayMs, searchAllowance } from "../_shared/openalex-policy.ts";
import { HostBreaker, NON_SCHOLARLY_KINDS, publisherFailure } from "../_shared/publisher-retry.ts";

const db = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 8 });
const batchLock = 68130920;
const batchLimit = 250;
const chunkLimit = 16;
const missingAuthor = (value: string) => !value.trim() ||
  /^(not stated|not specified|unknown|n\/a|responsible organisation:)/i.test(value.trim());
const cleanDoi = (value: string) => {
  const doi = String(value ?? "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();
  return /^10\.\d{4,9}\/[^\s]+$/.test(doi) ? doi : null;
};
const urlKey = (value: string) => {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() + url.pathname.replace(/\/$/, "") + url.search;
  } catch { return ""; }
};
const corroboratesAuthor = (known: string, candidates: string[]) => {
  const words = norm(known).split(" ");
  return candidates.some(name => {
    const surname = norm(name).split(" ").at(-1) || "";
    return surname.length >= 3 && words.includes(surname);
  });
};

type Outcome = {
  status: string;
  note: string;
  evidence?: string;
  metadata?: Record<string, unknown>;
  fill?: { authors?: string; year?: number; publication?: string; doi?: string | null; tags?: string[] };
  retry?: Date;
};

async function publisher(record: any): Promise<Outcome> {
  const page = await fetchPage(record.url, { strict: true });
  const evidence = page.url;
  if (page.outcome === "blocked" && page.httpStatus === 429 && record.publisher_attempts < 3) {
    return { status: "pending", note: page.note, evidence, retry: new Date(Date.now() +
      retryDelayMs(record.publisher_attempts + 1, retryAfterMs(page.retryAfter ?? null, Date.now()))) };
  }
  if (page.outcome !== "html") return { status: page.outcome, note: page.note, evidence };
  const metadata = { ...extract(page.html), source: "original publisher page", checked_at: new Date().toISOString() };
  const match = norm(record.title) && titleMatch(record.title, metadata.title);
  if (!metadata.title) return { status: "no_metadata", note: "Publisher supplied no usable title", evidence };
  if (!match ||
      (record.year && metadata.year && record.year !== metadata.year) ||
      (record.doi && metadata.doi && cleanDoi(record.doi) !== cleanDoi(metadata.doi)) ||
      (!missingAuthor(record.authors || "") && metadata.authors.length &&
        !corroboratesAuthor(record.authors, metadata.authors))) {
    return { status: "mismatch", note: "Publisher identity or existing citation fields need review", evidence, metadata };
  }
  const exact = norm(record.title) === norm(metadata.title);
  if (!exact) return { status: "mismatch", note: "Publisher title is similar and needs review", evidence, metadata };
  return { status: "verified", note: "Exact title on original publisher page", evidence, metadata,
    fill: { authors: metadata.authors.join("; ").slice(0, 1200), year: metadata.year ?? undefined,
      publication: metadata.publication, doi: cleanDoi(metadata.doi || ""), tags: metadata.keywords } };
}

async function search(record: any, key: string, window: { reset: number }): Promise<Outcome | null> {
  const title = record.title.trim();
  if (norm(title).length < 14) return { status: "not_found", note: "Title too short for academic matching" };
  const result = await db.begin(async tx => {
    const [{ locked }] = await tx`select pg_try_advisory_xact_lock(${OPENALEX_ADVISORY_LOCK}) locked`;
    if (!locked) return null;
    const [gate] = await tx`select retry_after > now() as blocked, consecutive_failures
      from private.enrichment_provider_state where provider='openalex'`;
    if (gate.blocked) return null;
    const params = new URLSearchParams({ "search.title": title.slice(0, 180), per_page: "10", api_key: key,
      select: "id,doi,title,publication_year,type,authorships,primary_location,primary_topic,language,open_access" });
    try {
      const response = await fetch("https://api.openalex.org/works?" + params,
        { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "ID-EBP Directory https://www.id-ebp.org" } });
      if (response.status === 429 || response.status >= 500 || [401, 403].includes(response.status)) {
        const reason = await response.json().then(value => String(value.reason || "")).catch(() => "");
        const budget = reason === "daily_budget" ||
          (response.status === 429 && Number(response.headers.get("X-RateLimit-Remaining") ?? Infinity) < 10);
        const now = Date.now();
        const resetDelay = budget ? Math.max(0, window.reset - now) : 0;
        const delay = retryDelayMs(gate.consecutive_failures + 1, Math.max(resetDelay,
          retryAfterMs(response.headers.get("Retry-After"), now), [401, 403].includes(response.status) ? 3600_000 : 0));
        const retry = new Date(now + delay);
        const note = "OpenAlex HTTP " + response.status + (budget ? " (daily budget)" : "");
        await tx`update private.enrichment_provider_state set retry_after=${retry},
          consecutive_failures=consecutive_failures+1,last_error=${note},updated_at=now() where provider='openalex'`;
        return { outcome: { status: "queued", note, retry }, stop: true };
      }
      if (!response.ok) {
        await response.body?.cancel();
        return { outcome: { status: "error", note: "OpenAlex HTTP " + response.status } };
      }
      const { results } = await response.json();
      if (!Array.isArray(results)) throw new Error("unexpected response");
      await tx`update private.enrichment_provider_state set consecutive_failures=0,last_error=null,
        retry_after=now(),updated_at=now() where provider='openalex'`;
      return { results };
    } catch {
      const retry = new Date(Date.now() + retryDelayMs(gate.consecutive_failures + 1, 0));
      await tx`update private.enrichment_provider_state set retry_after=${retry},
        consecutive_failures=consecutive_failures+1,last_error='OpenAlex transport or response error',
        updated_at=now() where provider='openalex'`;
      return { outcome: { status: "queued", note: "OpenAlex transport or response error", retry }, stop: true };
    }
  });
  if (!result) return null;
  if (result.outcome) return result.outcome;
  const exact = result.results.filter((work: any) => norm(work.title) === norm(title));
  if (!exact.length) return { status: "not_found", note: "No exact title in OpenAlex results" };
  const matches = exact.map((work: any) => {
    const authors = (work.authorships ?? []).map((a: any) => a.author?.display_name).filter(Boolean);
    const authorMatch = !missingAuthor(record.authors || "") && corroboratesAuthor(record.authors, authors);
    const urlMatch = !!urlKey(record.url) && [work.primary_location?.landing_page_url,
      work.primary_location?.pdf_url, work.doi].some(value => urlKey(value) === urlKey(record.url));
    const yearMatch = record.year != null && work.publication_year === record.year;
    const conflict = (record.year && work.publication_year && !yearMatch) ||
      (!missingAuthor(record.authors || "") && authors.length && !authorMatch) ||
      (record.doi && work.doi && cleanDoi(record.doi) !== cleanDoi(work.doi));
    return { work, authors, authorMatch, urlMatch, yearMatch, conflict };
  });
  const strong = matches.filter(({ conflict, urlMatch, authorMatch, yearMatch }) =>
    !conflict && (urlMatch || (authorMatch && yearMatch)));
  if (strong.length !== 1) return { status: "ambiguous", note: "Exact title needs independent corroboration",
    metadata: { candidates: exact.map((work: any) => ({ id: work.id, title: work.title,
      doi: cleanDoi(work.doi), year: work.publication_year })) } };
  const { work, authors, authorMatch, urlMatch, yearMatch } = strong[0];
  const year = Number.isInteger(work.publication_year) && work.publication_year > 1800 &&
    work.publication_year <= new Date().getUTCFullYear() + 1 ? work.publication_year : undefined;
  const publication = work.primary_location?.source?.display_name;
  const doi = cleanDoi(work.doi);
  return { status: "verified", note: "Exact title corroborated in OpenAlex", evidence: work.id,
    metadata: { source: "OpenAlex", title: work.title, authors, year, publication, doi, type: work.type,
      topic: work.primary_topic?.display_name, language: work.language, access: work.open_access?.oa_status,
      matched_on: { url: urlMatch, author: authorMatch, year: yearMatch }, checked_at: new Date().toISOString() },
    fill: { authors: authors.join("; ").slice(0, 1200), year, publication, doi } };
}

async function checkpoint(batch: string, record: any, method: "publisher" | "openalex", result: Outcome) {
  await db.begin(async tx => {
    await tx`select pg_advisory_xact_lock(${batchLock})`;
    const [lease] = await tx`select id from private.enrichment_hourly_batches
      where id=${batch} and status='running' and lease_until > now()`;
    if (!lease) throw new Error("Batch lease expired");
    const [queue] = await tx`select status, publisher_status from private.non_doi_enrichment_queue
      where record_id=${record.id} for update`;
    const [current] = await tx`select * from public.research_records where id=${record.id} for update`;
    if (!queue || !current || queue.status === "processing" || queue.publisher_status === "processing" ||
        queue.status === "verified" || queue.publisher_status === "verified" ||
        current.title !== record.title || current.url !== record.url ||
        current.authors !== record.authors || current.year !== record.year || current.doi !== record.doi) {
      await tx`update private.enrichment_hourly_batches set attempted=attempted+1,deferred=deferred+1 where id=${batch}`;
      return;
    }
    const updates: string[] = [];
    let { status, note, evidence, metadata, fill, retry } = result;
    if (fill?.doi) {
      const [duplicate] = await tx`select id from public.research_records
        where lower(doi)=${fill.doi} and id<>${record.id} limit 1`;
      if (duplicate) {
        status = method === "publisher" ? "mismatch" : "ambiguous";
        note = "Candidate DOI is already recorded; duplicate review needed";
        metadata = { ...metadata, other_record_id: duplicate.id };
        fill = undefined;
      }
    }
    if (fill) {
      const authors = !String(current.authors ?? "").trim() ? fill.authors : undefined;
      const year = current.year == null ? fill.year : undefined;
      const publication = !String(current.publication ?? "").trim() ? fill.publication : undefined;
      const doi = !String(current.doi ?? "").trim() ? fill.doi : undefined;
      const tags = !current.tags?.length && fill.tags?.length ? fill.tags : undefined;
      if (authors) updates.push("authors");
      if (year) updates.push("year");
      if (publication) updates.push("publication");
      if (doi) updates.push("doi");
      if (tags) updates.push("tags");
      if (updates.length) await tx`update public.research_records set
        authors=coalesce(${authors || null},authors),year=coalesce(${year || null},year),
        publication=coalesce(${publication || null},publication),doi=coalesce(${doi || null},doi),
        tags=coalesce(${tags || null}::text[],tags) where id=${record.id}`;
    }
    const metadataJson = metadata ? tx.json(metadata) : null;
    if (method === "publisher") {
      await tx`update private.non_doi_enrichment_queue set publisher_status=${status},
        publisher_attempts=publisher_attempts+1,publisher_attempted_at=now(),
        publisher_next_attempt_at=coalesce(${retry ?? null},now()),
        publisher_evidence_url=${evidence ?? null},publisher_note=${note},publisher_metadata=${metadataJson},
        publisher_updated_fields=${updates}::text[] where record_id=${record.id}`;
    } else {
      await tx`update private.non_doi_enrichment_queue set status=${status},attempts=attempts+1,
        claimed_at=null,processed_at=now(),next_attempt_at=coalesce(${retry ?? null},now()),
        evidence_url=${evidence ?? null},note=${note},metadata=${metadataJson},updated_fields=${updates}::text[]
        where record_id=${record.id}`;
    }
    await tx`insert into private.enrichment_hourly_results
      (batch_id,record_id,method,status,note,evidence_url,updated_fields)
      values (${batch},${record.id},${method},${status},${note},${evidence ?? null},${updates}::text[])`;
    await tx`update private.enrichment_hourly_batches set attempted=attempted+1,
      verified=verified+${Number(status === "verified")},updated=updated+${Number(updates.length > 0)},
      deferred=deferred+${Number(Boolean(retry))},failed=failed+${Number(status === "error")},
      exceptions=exceptions+${Number(status !== "verified" && status !== "error" && !retry)}
      where id=${batch}`;
  });
}

async function providerAllowance(key: string) {
  const [gate] = await db`select retry_after > now() as blocked from private.enrichment_provider_state where provider='openalex'`;
  if (!key) {
    await db`update private.enrichment_provider_state set retry_after=now()+interval '1 hour',
      last_error='OpenAlex API key is missing',updated_at=now() where provider='openalex'`;
    return { allowance: 0, reset: 0 };
  }
  if (gate.blocked) return { allowance: 0, reset: 0 };
  try {
    const response = await fetch("https://api.openalex.org/rate-limit?" + new URLSearchParams({ api_key: key }),
      { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Usage endpoint unavailable");
    }
    const { rate_limit: limit } = await response.json();
    const remaining = Number(limit.credits_remaining ?? Number(limit.daily_remaining_usd) * 10000);
    const reset = Date.parse(limit.resets_at);
    if (!Number.isFinite(reset) || !Number.isFinite(remaining)) throw new Error("Usage response incomplete");
    const allowance = searchAllowance(remaining);
    if (!allowance) await db`update private.enrichment_provider_state set retry_after=${new Date(reset)},
      last_error='OpenAlex daily budget reserved or exhausted',updated_at=now() where provider='openalex'`;
    return { allowance, reset };
  } catch {
    await db`update private.enrichment_provider_state set retry_after=now()+interval '15 minutes',
      last_error='Unable to check OpenAlex usage',updated_at=now() where provider='openalex'`;
    return { allowance: 0, reset: 0 };
  }
}

Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secrets = await db`select name,decrypted_secret from vault.decrypted_secrets
    where name in ('doi_enrichment_cron_token','openalex_api_key')`;
  const config = Object.fromEntries(secrets.map(item => [item.name, item.decrypted_secret]));
  if (!config.doi_enrichment_cron_token || req.headers.get("x-cron-token") !== config.doi_enrichment_cron_token) {
    return new Response("Forbidden", { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const requested = Number(body?.limit ?? batchLimit);
  const target = Number.isInteger(requested) ? Math.min(batchLimit, Math.max(1, requested)) : batchLimit;
  let batch = body?.batch;
  if (batch && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(batch)) {
    return new Response("Invalid batch ID", { status: 400 });
  }
  if (!batch) {
    const [run] = await db`select private.start_enrichment_hourly_batch(${target}) id`;
    batch = run.id;
  }
  if (!batch) return Response.json({ status: "busy_or_exhausted" });
  const [chunk] = await db`select private.claim_enrichment_chunk(${batch}) remaining`;
  if (chunk.remaining == null) return Response.json({ status: "busy_or_expired", batch });
  const limit = Math.min(chunkLimit, chunk.remaining);
  const end = Date.now() + 46_000;
  try {
    const [{ searched }] = await db`select count(*)::int searched from private.enrichment_hourly_results
      where batch_id=${batch} and method='openalex'`;
    const budget = searched < 35 ? await providerAllowance(config.openalex_api_key) : { allowance: 0, reset: 0 };
    const openAlex = budget.allowance ? await db`select r.*, q.publisher_attempts
      from private.non_doi_enrichment_queue q join public.research_records r on r.id=q.record_id
      where q.status='queued' and q.next_attempt_at<=now() and q.publisher_status not in ('verified','processing','pending')
        and not exists (select from private.doi_enrichment_queue d where d.record_id=r.id and d.status='verified')
        and not exists (select from private.enrichment_hourly_results e where e.batch_id=${batch} and e.record_id=r.id)
      order by (coalesce(r.kind_std,'') = any(${NON_SCHOLARLY_KINDS}::text[])),q.batch_no,q.record_id
      limit ${Math.min(4, limit, 35-searched, budget.allowance)}` : [];
    const published = await db`with candidates as (
        select r.*, q.publisher_attempts, q.batch_no,
          row_number() over (partition by lower(split_part(r.url,'/',3)) order by q.batch_no,q.record_id) domain_order
        from private.non_doi_enrichment_queue q join public.research_records r on r.id=q.record_id
        where q.publisher_status='pending' and q.publisher_next_attempt_at<=now()
          and q.status not in ('verified','processing')
          and not exists (select from private.doi_enrichment_queue d where d.record_id=r.id and d.status='verified')
          and not exists (select from private.enrichment_hourly_results e where e.batch_id=${batch} and e.record_id=r.id)
      ) select * from candidates order by domain_order,batch_no,id limit ${limit - openAlex.length}`;
    let cursor = 0;
    let attemptedThisChunk = 0;
    const breaker = new HostBreaker(2);
    const processPublishers = async () => {
      while (cursor < published.length && Date.now() < end) {
        const record = published[cursor++];
        // A host failing repeatedly in this chunk is left for a later run instead of burning the batch.
        if (breaker.isOpen(record.url)) continue;
        let result: Outcome;
        try {
          result = await publisher(record);
          breaker.succeed(record.url);
        } catch (error) {
          breaker.fail(record.url);
          result = publisherFailure(record.publisher_attempts, error, record.url);
        }
        await checkpoint(batch, record, "publisher", result);
        attemptedThisChunk++;
      }
    };
    const processSearches = async () => {
      for (const record of openAlex) {
        if (Date.now() >= end) break;
        const result = await search(record, config.openalex_api_key, budget);
        if (!result) break;
        await checkpoint(batch, record, "openalex", result);
        attemptedThisChunk++;
        if (result.retry) break;
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
    };
    const outcomes = await Promise.allSettled([processSearches(),
      ...Array.from({ length: 4 }, processPublishers)]);
    const failed = outcomes.some(outcome => outcome.status === "rejected");
    if (failed) console.error("Hourly enrichment task failed", outcomes.filter(outcome => outcome.status === "rejected"));
    const [result] = failed
      ? await db`select private.finish_enrichment_hourly_batch(${batch},'One or more worker tasks failed') result`
      : attemptedThisChunk === 0
      ? await db`select private.finish_enrichment_hourly_batch(${batch},null) result`
      : await db`select private.advance_enrichment_chunk(${batch}) result`;
    return Response.json(result.result, { status: failed ? 500 : 200 });
  } catch (error) {
    console.error("Hourly enrichment aborted", error instanceof Error ? error.message : "Unknown error");
    await db`select private.finish_enrichment_hourly_batch(${batch},'Hourly enrichment aborted')`;
    return Response.json({ batch, status: "failed" }, { status: 500 });
  }
});
