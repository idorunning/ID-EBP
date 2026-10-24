# Research catalogue snapshot

Checkpoint 32 of `ID-EBP-research-catalogue.xlsx`: **16,671 catalogue IDs**, **16,669 discovery records**, **134 sources**, **zero independent evidence appraisals**. The XLSX remains the research master and was not modified by this website preparation.

Two records are withheld because titles are missing or placeholders: IDEBP-R0667 and IDEBP-R14450. Unknown metadata stays blank. A record may be a publication, project, summary, collection, citation or correction; none of the counts describes independent studies or eligible evaluations.

## Refresh

Resolve and download the latest workbook by its existing identity before exporting. The current command is:

```sh
python3 scripts/export-research.py /absolute/path/ID-EBP-research-catalogue.xlsx --version 32
npm test
npm run dev:catalogue
```

The exporter reads XLSX ZIP/XML without rewriting it. `catalogue.json.gz` is the deterministic release input; the human-readable `catalogue.json` is generated locally and ignored by Git. `manifest.json` records the input and output SHA-256 values and all original IDs, including withheld records. Snapshot replacement uses the same workbook record IDs. `relationships.json` holds explicitly reviewed bibliography relationships; it does not infer duplicates from shared URLs. Check relationships and the resume pointer against each future checkpoint before accepting an update. The resume fields in this manifest describe checkpoint 32 only; future exports must follow the latest Progress notes.

Only discovery metadata is exported. Methods, original summaries, findings, appraisal text and excerpts stay in the workbook. The public website labels recorded authors, publication dates, access and catalogue tags; these are not new claims of independently verified authorship, full-text access or publisher-assigned tags. Recorded tags and derived search terms remain separate. Original date precision is retained, including year-only and month-only dates.

The article/correction relationship and the inferred relationship between two conference abstracts are carried through explicitly. Distinct citations sharing bibliography URLs retain separate IDs and full citations where recorded. A shared URL alone does not establish the same work. This is a discovery snapshot, not a finished work-level evidence graph.

## Search and visibility

`GET /api/research` returns up to 25 records, text search (all words), source/category/year filters and exact catalogue-term filters (all terms). `suggest` returns up to ten matching catalogue terms; `summary` returns counts without records. Query size, page and tag limits are enforced. Relevance is title matching, not evidence quality; browsing otherwise preserves workbook order.

The existing production directory remains authoritative for source visibility on every request. Withdrawal removes a source's research results, facets, suggestions and counts; an unavailable or non-authoritative source service returns 503, without a stale fallback. No member cookies or private account data are needed. No database migration, account changes, new secrets or new dependencies are required.

The unconfigured local preview uses the existing **115-source repository seed**, so it shows **16,246 records**. The current live database has **134 published sources**, with all checkpoint-32 slugs represented. Tests using that full authoritative set confirm **16,669 records**. Do not alter the production visibility guard simply to make a local count match.

## Validation and release

`npm test` includes the existing application/database tests and research snapshot/search/visibility tests. `scripts/verify-research-browser.cjs` provides optional browser acceptance checks with a local Playwright installation and Chromium. Browser checks were **not completed in this environment**: no local Chromium executable was available, the browser download failed, and the available remote browser could not reach the local server. Before publishing, run that browser check and inspect desktop and 320/390px layouts, term selection/removal, filters, pagination and the outage message.

The built Worker is about 6.1 MB gzipped (measure the exact release build). Confirm the target Worker accepts that bundle and its startup/CPU budget before deployment. This change is prepared for review, **not deployed**. Preserve the existing Worker bindings, configuration, scheduled maintenance and account service when publishing.

## Resume collection

At checkpoint 32, Progress B67 points to processing orders 37–39: Norwegian Police University College, IACP Evidence to Action Directory and Police University College Finland. Resolve the latest workbook and use its notes if another run has advanced it. Stage 2 remains incomplete globally; Stage 3 is blocked. The overnight continuation is a bounded collection/checkpoint batch, not an uninterrupted all-night process.
