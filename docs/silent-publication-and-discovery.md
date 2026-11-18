# ID-EBP: quiet publication, enrichment and source discovery

Updated 18 November 2026. Live Supabase project `hvwmystbqlocjixvwgfl`.

## Publication

- The initial public catalogue contains **17,209 records**, all with a title, source and URL.
- `public.research_search_documents` contains 17,209 entries. Both relevant tables have public read policies; an `anon`-role database check returned all 17,209 records.
- `public.research_stats()` returns the full record count. `public.search_research_v2` joins public catalogue records to the complete search index and does not restrict records by the enrichment queue.
- Cloudflare's `idebp-preview` Worker serves `id-ebp.org` and `www.id-ebp.org`. Network/browser access is required for an independent end-to-end HTTP acceptance test.
- The counter for published source listings is based on `public.sources where status='published'`, currently 134. Avoid presenting all catalogue entries as individually peer-reviewed studies.

**Do not bulk reimport existing records**: they are already public. Existing enrichment jobs update verified missing fields in-place. Search indexing is triggered on record changes to search text; do not require a frontend deployment for each small update.

## Routine enrichment

Existing private queues:
- `private.doi_enrichment_queue` — DOI checks in 500-record groups, with Crossref, bulk OpenAlex and DataCite fallback
- `private.non_doi_enrichment_queue` — OpenAlex title checks plus publisher website checks, with retries and provenance
- `private.research_duplicate_review` — candidate duplicate groups, reviewed rather than deleted automatically

Preserve all nonempty metadata, and never replace a prior author/organisation attribution with an empty candidate. Titles, research quality and jurisdiction are not inferred from suggestive search results. Verified metadata is **not** independent scientific appraisal.

All production queue workers run via pg_cron; `cron.job` is the authoritative schedule. They do not send periodic emails or user notifications. Error and change evidence is held in private run tables.

## Broadening source discovery

Two new functions, independent of the public catalogue:

| Service | Source | Coverage | Cadence |
| --- | --- | --- | --- |
| `web-source-discovery` | OpenAlex CC0 sources, institutions, publishers | Journals, repositories, conferences, research institutes, societies, publishers and relevant public-sector bodies | 00:35, 06:35, 12:35, 18:35 UTC, one search term per invocation |
| `web-media-discovery` | GDELT DOC news-index metadata (with GDELT attribution) | Newspapers, specialist magazines, media organisations and articles discussing policing evidence | Monday and Thursday at 04:45 UTC, one query per invocation |
| Existing `openalex-harvest` | OpenAlex CC0 works | New research publications, studies, reports, theses, datasets | Existing overnight schedule |
| Existing `news-harvest` | GDELT | Research cited in news, linked publisher evidence | Reduced to one query weekly because repeated shared-IP 429 errors |

This uses structured and open research/news discovery, **not Firecrawl** and not unlicensed redistribution of Google/Bing RSS search results. OpenAlex data is CC0. GDELT Project data may be reused with citation; underlying article copyrights still belong to publishers. See https://openalex.org/transparency and https://gdeltproject.org/about.html.

Search terms and checkpoints are persisted in `staging.web_source_searches`; candidates in `staging.web_source_candidates`; attempts and failures in `staging.web_source_search_runs`. The search functions only use fixed, known API endpoints. Candidate websites are not automatically fetched or trusted. Repeated entities deduplicate by external identifier and maintain observation counts.

**New source leads are not auto-published.** An OpenAlex entity or GDELT outlet domain requires identity, homepage, research relevance and duplication checks before adding it to the live directory. A journal is not treated as a university institute; news coverage is not treated as an academic evaluation. Candidates with no verifiable homepage remain `needs_identity_check`.

## Rate limits, retries and safety

- OpenAlex search uses an existing Vault API key; one query per scheduled run, retry with backoff on 402/429 or failed requests.
- GDELT repeatedly returned 429 from the shared Supabase egress IP during testing. The media workflow records `rate_limited`, waits 72 hours for that query and defers others. The reduced schedule limits repeated failures. A configured schedule **does not** imply successful harvesting while throttled.
- Search terms are rotated, with a 14-day retry for successfully searched OpenAlex terms and 10-day retry for GDELT terms.
- The workers log zero-result runs and errors without creating empty or fabricated source records.
- There is no automatic overwrite of published sources, no owner verification based on a discovered domain, and no automated email outreach.
- The source feed covers public research-related material; restricted content, permissions and substantive quality reviews remain subject to their original sources.

## Private daily checkpoint

At 03:15 UTC, a SQL cron job snapshots catalogue size, published sources, indexed documents, DOI progress, non-DOI progress, publisher verification and candidate counts into `private.enrichment_daily_checkpoint`. It is quiet and idempotent. The baseline checkpoint was created on 18 November 2026.

Read-only status queries:

```sql
select * from private.enrichment_daily_checkpoint order by as_of desc limit 14;
select stream,count(*) as searches,count(*) filter(where active) as active from staging.web_source_searches group by stream;
select review_status,entity_type,count(*) from staging.web_source_candidates group by 1,2 order by 1,2;
select result_status,count(*) as runs,max(finished_at) latest from staging.web_source_search_runs group by result_status;
select jobid,jobname,active,schedule from cron.job order by jobid;
select count(*) from public.research_records;
select count(*) from public.research_search_documents;
```

## Outstanding boundaries

- The GDELT news endpoint was rate-limited during its first media discovery test: no media candidates were verified from that test. Continue slower scheduled retries and independent web-search verification.
- Existing catalogue entries may have incomplete authors, years, summaries, classifications or links; these remain publicly searchable while enrichment continues.
- The old news collector has a persistent 429 history and is therefore deliberately throttled; do not claim it provides complete current coverage.
- New candidates must be checked and promoted through the established staging/review process before increasing published-source counts.
- A live browser HTTP request and actual user-facing search/counter test is still required to confirm the end-to-end site, beyond Cloudflare routing and anonymous Supabase database access.
- Metadata enrichment and independent evidence appraisal are separate tasks.

## Outreach integration (18 November 2026)

Source and research discovery now feeds a **separate, private outreach review queue**: `private.outreach_targets`, `private.outreach_contact_candidates`, `private.outreach_suppression` and `private.outreach_delivery_log`. The daily 03:40 UTC `outreach-target-refresh-daily` pg_cron job is enabled. It enrols existing and newly discovered research/source records and imports publicly linked `mailto:` suggestions from maintenance evidence as *unverified* contact candidates. A historical source-invitation draft is also staged privately for verification. See [source and research-owner outreach](outreach/research-owner-and-source-contact-process.md).

**No automatic outbound emails are enabled.** Source organisations are first priority; named authors and individual publishers require a separate legal/consent check. Duplicate mailboxes, objections, withdrawn listings, uncertain send acknowledgements and the published contact policy must be respected. Production dispatch must use verified `hello@thinkingaboutpolicing.org` access, not authentication-code email, and must record confirmed sends. The existing Gmail connector failed on 18 November 2026; no successful send was confirmed.
