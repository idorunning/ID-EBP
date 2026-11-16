// ID-EBP OpenAlex harvester. Writes ONLY to staging.* tables.
// Settings (cron token, OpenAlex key, optional contact email) live in Supabase Vault.
// v3: runs without an API key on OpenAlex's small keyless allowance;
// add vault secret 'openalex_api_key' for the full free allowance.
// Scheduled by pg_cron job 'openalex-harvest-nightly' (every 10 minutes, 00:00-00:59 UTC).
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });

const KIND: Record<string, string> = {
  article: "journal-article", "book-chapter": "book-chapter", book: "book",
  report: "report", dissertation: "thesis", dataset: "dataset", review: "journal-article",
};

async function vault(): Promise<Record<string, string>> {
  const rows = await sql`select name, decrypted_secret from vault.decrypted_secrets where name in ('openalex_cron_token','openalex_api_key','openalex_contact_email')`;
  return Object.fromEntries(rows.map((r: any) => [r.name, r.decrypted_secret]));
}

function canonical(u: string): string {
  try {
    const x = new URL(u);
    x.hostname = x.hostname.toLowerCase();
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) x.searchParams.delete(k);
    x.hash = "";
    let s = x.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch { return u; }
}

async function timed(url: string, init: RequestInit = {}, ms = 8000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
}

async function crossrefAccess(doi: string, contact: string): Promise<string | null> {
  try {
    const q = contact ? `?mailto=${encodeURIComponent(contact)}` : "";
    const r = await timed(`https://api.crossref.org/works/${encodeURIComponent(doi)}${q}`);
    if (!r.ok) return null;
    const j = await r.json();
    const lic: string[] = (j.message?.license ?? []).map((l: any) => String(l.URL ?? "").toLowerCase());
    if (lic.some((u) => u.includes("creativecommons.org"))) return "open";
    return "paywalled";
  } catch { return null; }
}

async function linkAlive(url: string): Promise<boolean | undefined> {
  try {
    const r = await timed(url, { redirect: "follow", headers: { "User-Agent": "ID-EBP link checker" } });
    r.body?.cancel();
    if (r.status === 404 || r.status === 410) return false;
    if (r.ok) return true;
    return undefined;
  } catch { return undefined; }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

Deno.serve(async (req) => {
  const v = await vault();
  if (!v.openalex_cron_token || req.headers.get("x-cron-token") !== v.openalex_cron_token) return new Response("forbidden", { status: 403 });
  const OA_KEY = v.openalex_api_key ?? "";
  const CONTACT = v.openalex_contact_email ?? "";
  // Keyless: fewer works per call to stay inside OpenAlex's small daily allowance.
  const PER_PAGE = OA_KEY ? 50 : 25;

  const [{ s, r }] = await sql`select (select count(*) from public.sources)::int s, (select count(*) from public.research_records)::int r`;
  if (s < 134 || r < 17080) return new Response(`stopped: counts low (sources ${s}, records ${r})`, { status: 409 });

  const st = await sql`select term, cursor from staging.openalex_state where not done order by updated_at limit 1`;
  if (!st.length) return new Response("all terms done", { status: 200 });
  const { term, cursor } = st[0];

  const [{ id: runId }] = await sql`insert into staging.swarm_runs (run_kind, shard, status) values ('openalex', ${term}, 'running') returning id`;

  try {
    const params: Record<string, string> = {
      filter: `title_and_abstract.search:${term},from_publication_date:2000-01-01,type:article|report|book|book-chapter|dissertation|dataset|review`,
      per_page: String(PER_PAGE), cursor,
      select: "id,doi,title,publication_year,type,authorships,primary_location,open_access",
    };
    if (OA_KEY) params.api_key = OA_KEY;
    const qs = new URLSearchParams(params);
    const res = await timed(`https://api.openalex.org/works?${qs}`, { headers: { "User-Agent": "ID-EBP directory (https://id-ebp.org)" } }, 20000);
    if (res.status === 429 || res.status === 409) {
      const note = `OpenAlex allowance used up (${res.status})${OA_KEY ? "" : "; no api key set"}; will retry next run`;
      await sql`update staging.swarm_runs set finished_at = now(), status = 'skipped', notes = ${note} where id = ${runId}`;
      return new Response(note, { status: 200 });
    }
    if (!res.ok) throw new Error(`OpenAlex ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const works: any[] = data.results ?? [];

    const rows = await pool(works, 8, async (w) => {
      const title = (w.title ?? "").trim();
      if (!title) return null;
      const doi = w.doi ? String(w.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase() : null;
      const url = doi ? `https://doi.org/${doi}` : (w.primary_location?.landing_page_url ?? null);
      if (!url) return null;
      const alive = await linkAlive(url);
      if (alive === false) return null;
      let access = doi ? await crossrefAccess(doi, CONTACT) : null;
      if (!access) {
        const pl = w.primary_location;
        access = pl?.is_oa && /^cc/i.test(pl?.license ?? "") ? "open" : "unknown";
      }
      const authors = (w.authorships ?? []).map((a: any) => a.author?.display_name).filter(Boolean).join("; ") || "none listed";
      const fields = [url, title, w.publication_year, authors !== "none listed", KIND[w.type], access !== "unknown"];
      return {
        title, url, canonical_url: canonical(url), doi, year: w.publication_year ?? null, authors,
        publication: w.primary_location?.source?.display_name ?? null,
        kind: KIND[w.type] ?? "other", access, evidence_url: w.id,
        completeness: Math.round((fields.filter(Boolean).length / 8) * 100) / 100,
        match_note: alive === undefined ? `openalex:${term}; link not confirmed (site blocks checks)` : `openalex:${term}`,
      };
    });
    const good = rows.filter(Boolean);

    let inserted = 0;
    if (good.length) {
      const res2 = await sql`
        insert into staging.candidate_records (run_id, title, url, canonical_url, doi, year, authors, publication, kind, access, evidence_url, completeness, match_note)
        select ${runId}, x.title, x.url, x.canonical_url, x.doi, x.year, x.authors, x.publication, x.kind, x.access, x.evidence_url, x.completeness, x.match_note
        from jsonb_to_recordset(${sql.json(good)}) as x(title text, url text, canonical_url text, doi text, year int, authors text, publication text, kind text, access text, evidence_url text, completeness numeric, match_note text)
        where not exists (select 1 from public.research_records p where (x.doi is not null and lower(p.doi) = x.doi) or lower(rtrim(p.url,'/')) = lower(x.canonical_url) or lower(p.title) = lower(x.title))
          and not exists (select 1 from staging.candidate_records c where (x.doi is not null and lower(c.doi) = x.doi) or c.canonical_url = x.canonical_url)
        on conflict do nothing`;
      inserted = res2.count;
    }

    const next = data.meta?.next_cursor ?? null;
    await sql`update staging.openalex_state set cursor = coalesce(${next}, cursor), done = ${next === null}, works_seen = works_seen + ${works.length}, updated_at = now() where term = ${term}`;
    const note = `term "${term}": ${works.length} works fetched, ${good.length} usable, ${inserted} new inserted${OA_KEY ? "" : " (keyless)"}`;
    await sql`update staging.swarm_runs set finished_at = now(), status = 'passed', notes = ${note} where id = ${runId}`;
    return new Response(JSON.stringify({ runId, term, fetched: works.length, usable: good.length, inserted, keyless: !OA_KEY }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    await sql`update staging.swarm_runs set finished_at = now(), status = 'failed', notes = ${String(e).slice(0, 500)} where id = ${runId}`;
    return new Response(String(e), { status: 500 });
  }
});
