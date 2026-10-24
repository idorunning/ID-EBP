# Research search release — 24 October 2026

First searchable public catalogue from coordinator workbook version 35 (checked 23 October).

- 18,511 workbook records.
- 17,080 public catalogue records imported with stable workbook IDs, covering 16,676 distinct resource URLs. Multiple source records can refer to the same resource.
- 1,430 explicit candidate records and one untitled record withheld.
- 4,248 published records currently have direct catalogue tags. Text search also covers titles, source names, authors, summaries and related search terms.
- Records include studies, repository metadata, collection pages, learning resources and summaries. No independent study appraisals are claimed. Full-text access, missing metadata, duplicate relationships and further relevance screening remain work in progress.

## Published functionality

`/research` supports free text, suggested/removable exact tags, source filters, pagination and links to originals. Existing source browsing stays at `/directory`. Home page counter measures published research/resource records, not unique papers. Public read-only API: `/api/research`, `/api/research/tags`, `/api/research/stats`.

Database access uses invoker functions, explicit SELECT-only grants and RLS. Anonymous INSERT and UPDATE privileges were tested and are false. Existing member and account data are outside this table. SQL is retained under `supabase/migrations/`.

## Validation

173 Node/database checks passed. Live database queries returned 79 records for `body worn cameras`, 126 for `hot spots`, and five records combining `hot spots` with the exact `hot spots policing` tag. Counts describe catalogue matches, not effect estimates or independent evaluations. Live browser verification passed for text search, adding a suggested tag (five results), the homepage research counter and outbound result links. Desktop layout visually reviewed. A separate mobile browser viewport was unavailable; the responsive CSS remains to be checked on a phone. Live deployment preserved existing account bindings and scheduled tasks.

## Next work

Complete per-record tags and bibliographic enrichment, check original full-text availability and relevance, reconcile duplicates and versions, process the withheld candidate queue, then begin independent evidence appraisal. The first release provides catalogue retrieval. It does not add an AI evidence-synthesis assistant.
