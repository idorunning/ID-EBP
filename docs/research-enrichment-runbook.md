# ID-EBP research enrichment — operating runbook

Last verified: 19 November 2026. Production project: `hvwmystbqlocjixvwgfl`. Repository: `idorunning/ID-EBP`.

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
| `non-doi-openalex` | Runs the hourly publisher and OpenAlex batch. OpenAlex matching requires an exact title plus a matching URL or matching authorship and year. | `supabase/functions/non-doi-openalex/index.ts` |
| `non-doi-publisher` | Legacy publisher checker. Its minute-by-minute schedule is disabled. | `supabase/functions/non-doi-publisher/index.ts` |

Every worker is protected by the `x-cron-token` value held only in Supabase Vault (`doi_enrichment_cron_token`). The OpenAlex API key is also in Vault. Do not commit secret values or use a public API key for privileged database updates.

## Database tables and checkpoints

- `public.research_records`: 17,209 baseline catalogue entries.
- `private.doi_enrichment_queue`: stable record IDs, batches of 500, DOI, status, evidence, raw metadata, updated fields, attempt/backoff state, DataCite state.
- `private.non_doi_enrichment_queue`: stable record IDs, batches of 500, matching results, original-publisher results, evidence and retrieval status.
- `private.enrichment_run_log`: legacy workflow counts.
- `private.enrichment_hourly_batches`: hourly lease and durable totals for attempts, verifications, updates, deferrals, failures and exceptions.
- `private.enrichment_hourly_results`: individual dispositions, evidence URLs and changed fields.
- `private.enrichment_provider_state`: OpenAlex cooldown and last provider error.
- `private.verification_items` and `private.verification_exceptions`: formal screening and review backlog.
- `private.research_duplicate_review`: DOI and title+URL duplicate groups, **review only**. Deliberate cross-listings are possible.
- `private.research_record_history`: previous row values retained by existing change tracking.
- `private.snapshot_20261116_research_records`: prior baseline copy, not necessarily a complete recovery method.

Progress is committed record by record. Confirm recovery capability and use a new backup before any mass repair.

## Schedules

Check with `select jobid, jobname, schedule, active from cron.job order by jobid;`.

- `doi-enrichment-every-minute` — every minute
- `doi-openalex-bulk-every-5-minutes` — every 5 minutes
- `doi-datacite-fallback` — every 15 minutes
- `id-ebp-research-assurance-hourly` — at minute 50 UTC, screens up to 250 previously unscreened records and records evidence references and exceptions in the existing assurance tables.
- `id-ebp-research-stage-refresh` — at minute 40 UTC, records each record's stage and any change (Live Enrichment stage panel).
- `id-ebp-research-enrichment-hourly` — at minute 55 UTC, targets 250 records. It runs short invocations of up to 16 records and uses the same batch ID throughout. The lease prevents overlapping runs. The next hourly tick can resume the remaining work after a failed or expired batch.
- The previous minute-by-minute OpenAlex and publisher triggers are disabled. The worker makes up to 35 single-concurrency OpenAlex title searches per hour, subject to the remaining budget and a 1,000-credit reserve for existing discovery. It can continue publisher checks while OpenAlex is deferred. OpenAlex searches go to scholarly record kinds first. Since 20 November, a publisher fetch that times out, cannot connect or returns HTTP 5xx is retried after 30 minutes, 3, 12, 24 and 72 hours (six attempts in all), with the reason and host in the note; a host that fails twice within one invocation is skipped for the rest of that chunk. Each billable OpenAlex caller shares the same database request lock.
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

First inspect `cron.job_run_details`, `private.enrichment_run_log`, queue statuses and the most recent Edge Function response. HTTP 429 opens the shared cooldown. Subsequent title searches wait until the recorded retry time or next daily reset as applicable. The recovery jobs requeue claims interrupted for more than ten minutes, but terminal conflicts remain available for inspection.

To pause a scheduled job without discarding its queue or schedule, use `cron.alter_job(jobid, active := false)` for the exact job. Restore only after diagnosing the error. Do not delete queue entries, snapshots or history. To roll back an incorrectly filled value, inspect that record's `private.research_record_history` and original evidence and restore the specific field under change-control.

## Definition of finished

All eligible records have a terminal, evidence-backed disposition: verified; inapplicable resource; or documented unresolved exception. Missing-but-inapplicable fields should be marked as such, not populated with invented values. Check website search and counters separately from database completeness. Full evidence appraisal requires a separate review programme.

## Advance research records to sign-off

Run from the repository with Node.js 22+ and `psql`. Use an authorised database connection via
`PGSERVICE`/`PGPASSFILE` or standard PostgreSQL connection environment variables. Do not place a
password in the command line or in a review file.

```sh
node scripts/advance-research-stages.mjs
node scripts/advance-research-stages.mjs --details > /path/to/stage-review-queue.json
node scripts/advance-research-stages.mjs --apply --advance --reviews /path/to/reviewed-records.json
```

The default run is read-only and gives the highest documented stage per record, with a count for each
blocker. Blockers can overlap. `--details` exports the records, their fingerprints and their outstanding
checks. `--advance` screens the outstanding Stage 1 records and, when the existing worker is eligible,
dispatches one publisher/registry batch. It uses the existing lease and publishes its batch ID on
standard error. The catalogue's usual schedule continues processing later runs.

Use the details export to prepare a JSON array of reviewed records. A reviewer should check each
current field against the evidence supplied. `primary` is convenient when one source supports every
field. Add per-field URLs where the evidentiary sources differ. The supported field keys are
`title`, `authors`, `year`, `source`, `summary`, `tags` and `url`.

```json
[
  {
    "id": "IDEBP-R1234",
    "fingerprint": "00000000000000000000000000000000",
    "reviewer": "Named reviewer",
    "evidence": {
      "primary": "https://example.org/research/report",
      "source": "https://example.org/research"
    },
    "final": {
      "relevance_evidence": "https://example.org/research/report",
      "duplicate_reviewed": true,
      "checked_url": "https://example.org/research/report",
      "link_verified_at": "2026-11-19T20:00:00Z"
    }
  }
]
```

The example is illustrative. Copy the current record fingerprint from the export and use the actual
review date and evidence. Omit `final` to record Stage 4 only. For a qualifying non-publication resource
with no applicable year, provide `year_not_applicable: {"reason":"…" }` and supporting year evidence.
Resolve outstanding review and duplicate flags through the existing assurance workflow. Apply any
reviewed catalogue corrections through the established catalogue workflow before exporting the
fingerprint again.

Stage 4 uses current publication evidence, published source attribution, meaningful metadata and
reviewer-supplied field evidence. The script treats known catalogue placeholder summaries as missing.
Stage 5 additionally requires a current reviewer link check, relevance evidence, duplicate review,
no open assurance issues, a current search index and an exact record match on ID-EBP's live search.
It records the gate outcomes as an assurance checkpoint. A changed catalogue row requires a fresh
review, and repeating a successfully applied run creates no duplicate checkpoint.

## Editorial job (summaries and evidenced gap filling)

See `docs/research-editorial-job.md`. Original summaries, missing authors/years/tags and per-field evidence are
written by a scheduled, leased batch job inside this database; it records Stage 4 and Stage 5 through the same gates.
