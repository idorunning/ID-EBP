# ID-EBP research enrichment — operating runbook

Last verified: 18 November 2026. Production project: `hvwmystbqlocjixvwgfl`. Repository: `idorunning/ID-EBP`.

## Scope and status definitions

One catalogue record is **not necessarily one independent research study**. Some entries are resource indexes, government toolkits, journal pages, guidance and collections. Never invent a year, DOI or individual author for those resources.

The catalogue contained **17,209** records at the baseline check, of which **7,462** had a DOI and **9,747** did not. The non-DOI queue initially marked **847** pages/collections as not applicable to academic title matching (this does **not** claim full enrichment). Counts are checkpoints, not live counters.

`verified` means a DOI/title match or publisher-page identity check met the pipeline's conservative rule. It does **not** mean an independent appraisal of research quality, full-text reading, complete metadata, or public search visibility. Inspect `updated_fields` to distinguish metadata verification from actual changes.

## Deployed Edge Functions

| Name | Role | Source |
|---|---|---|
| `doi-enrichment` | Crossref single-DOI check, low-rate and retrying | `supabase/functions/doi-enrichment/index.ts` |
| `doi-openalex-bulk` | OpenAlex batch DOI verification; up to 50 per call | `supabase/functions/doi-openalex-bulk/index.ts` |
| `doi-datacite-fallback` | DataCite fallback for DOI records unresolved by other APIs | `supabase/functions/doi-datacite-fallback/index.ts` |
| `non-doi-openalex` | Exact-title OpenAlex search, corroborated by author/year/original URL/uniqueness | `supabase/functions/non-doi-openalex/index.ts` |
| `non-doi-publisher` | Fetch original publisher HTML and extract structured metadata; flags PDF/blocked/incorrect titles | `supabase/functions/non-doi-publisher/index.ts` |

Every worker is protected by the `x-cron-token` value held only in Supabase Vault (`doi_enrichment_cron_token`). The OpenAlex API key is also in Vault. Do not commit secret values or use a public API key for privileged database updates.

## Database tables and checkpoints

- `public.research_records`: 17,209 baseline catalogue entries.
- `private.doi_enrichment_queue`: stable record IDs, batches of 500, DOI, status, evidence, raw metadata, updated fields, attempt/backoff state, DataCite state.
- `private.non_doi_enrichment_queue`: stable record IDs, batches of 500, matching results, original-publisher results, evidence and retrieval status.
- `private.enrichment_run_log`: records processed and dispositions per run.
- `private.research_duplicate_review`: DOI and title+URL duplicate groups, **review only**. Deliberate cross-listings are possible.
- `private.research_record_history`: previous row values retained by existing change tracking.
- `private.snapshot_20261116_research_records`: prior baseline copy, not necessarily a complete recovery method.

Progress is committed record by record. Confirm recovery capability and use a new backup before any mass repair.

## Schedules

Check with `select jobid, jobname, schedule, active from cron.job order by jobid;`.

- `doi-enrichment-every-minute` — every minute
- `doi-openalex-bulk-every-5-minutes` — every 5 minutes
- `doi-datacite-fallback` — every 15 minutes
- `non-doi-openalex-every-minute` — every minute
- `non-doi-publisher-every-minute` — every minute
- `doi-queue-add-discovered` — every 30 minutes, adds newly recovered DOIs
- `doi-enrichment-recover-stalled`, `doi-datacite-recover-stalled`, `non-doi-recover-stalled`, `non-doi-publisher-recover-stalled` — interrupted-job recovery

Other, unrelated scheduled jobs (news and research discovery) are not part of this pipeline and must not be suspended casually.

## Read-only monitoring SQL

```sql
select status, count(*) from private.doi_enrichment_queue group by status order by status;
select batch_no, status, count(*) from private.doi_enrichment_queue group by 1,2 order by 1,2;
select status, count(*) from private.non_doi_enrichment_queue group by status order by status;
select publisher_status, count(*) from private.non_doi_enrichment_queue group by publisher_status order by publisher_status;
select duplicate_type, count(*) from private.research_duplicate_review
where review_status = 'unreviewed' group by 1 order by 1;
select workflow, max(created_at) last_run, sum(attempted) attempted, sum(verified) verified
from private.enrichment_run_log group by workflow;
select count(*) as total,
       count(*) filter(where year is null) as missing_year,
       count(*) filter(where btrim(authors)='') as missing_authors,
       count(*) filter(where btrim(summary)='') as missing_summary,
       count(*) filter(where cardinality(tags)=0) as missing_tags
from public.research_records;
```

## Publication and correctness safeguards

1. Keep every existing nonempty title, author, date, label and URL unless a separate reviewed correction is approved.
2. Only fill missing values when a DOI+title or publisher URL+title has been checked; ambiguous metadata must remain in the review queue.
3. Year differences over one year or author conflicts are never silently overwritten.
4. `not_found` and `blocked` are not proof a publication does not exist. Retry rate limits and document true exceptions.
5. OpenAlex institutional-affiliation countries are not countries where research was conducted. Do not claim they are.
6. Matching a paper to a DOI is not a scientific evidence appraisal.
7. Do not silently delete or merge records with shared DOIs; the duplicate queue needs case-by-case review.
8. Do not copy third-party abstracts into public summaries without editorial and rights review.
9. PDF extraction, inaccessible websites, publication anomalies, and final human quality appraisal are **separate outstanding activities**.
10. Do not equate queued, indexed, metadata-verified, fully enriched and publicly searchable.

## Responding to problems

First inspect `cron.job_run_details`, `private.enrichment_run_log`, queue statuses and the most recent Edge Function response. Temporary 429 errors should back off. The recovery jobs requeue claims interrupted for more than ten minutes, but terminal conflicts remain available for inspection.

To stop one scheduled job without discarding its queue, use `select cron.unschedule('<exact jobname>');`. Restore only after diagnosing the error. Do not delete queue entries, snapshots or history. To roll back an incorrectly filled value, inspect that record's `private.research_record_history` and original evidence and restore the specific field under change-control.

## Definition of finished

All eligible records have a terminal, evidence-backed disposition: verified; inapplicable resource; or documented unresolved exception. Missing-but-inapplicable fields should be marked as such, not populated with invented values. Check website search and counters separately from database completeness. Full evidence appraisal requires a separate review programme.
