# Research search by topic and meaning

A visitor can enter a topic, acronym, spelling variant or question. The same dictionary powers research search, source matching and topic suggestions. It contains 48 initial topics; relationships describe retrieval, not interchangeable legal definitions.

## Behaviour

- DA, DV, domestic abuse and domestic violence share a broad topic group. Intimate partner violence remains a more specific topic.
- Domestic burglary means residential burglary. Burglary never automatically becomes robbery. General intimate relationships suggests relevant topics without assuming abuse.
- Recognised variants are alternatives within a topic. Distinct chosen topics and source filters must all match. Exact-word mode and quoted/Boolean searches bypass expansion and AI.
- Prevention questions boost intervention/evaluation matches, especially in titles. Direct word/topic results precede separately labelled meaning or similar-wording results.
- Every matching record is pageable. Semantic results are thresholded, not guaranteed exhaustive. Matching is not an evidence appraisal.

## Data and maintenance

`public/search-topics.js` is authoritative. Run `node scripts/sync-search-topics.mjs` when preparing the initial seed; subsequent dictionary edits must have a new migration and a bounded reindex. The test suite checks seed consistency. Curated record tags and original summaries are not overwritten. Search-only topics are inferred from available text; inventory placeholders and known sign-in boilerplate are excluded.

`research_search_documents` has English full-text, literal, topic and 384-dimensional vector representations. The model is `@cf/baai/bge-small-en-v1.5`, explicitly using `cls` pooling. Both indexing and querying use that exact combination. Input is limited to 1,600 characters from public title/tags/related terms/usable summary. This first model is English-oriented; multilingual semantic coverage is not claimed.

Record changes refresh the lexical/topic index and invalidate outdated embeddings. A private leased queue catches new/changed records. The existing Worker schedule takes two batches of at most 64 records each. Completion verifies the lease and content hash, so concurrent edits cannot receive stale vectors. Failed jobs retry after their ten-minute lease expires.

The `research-indexer` Edge Function authenticates the existing website proxy secret against its stored hash. It allows only taking and completing embedding jobs. Service credentials remain within the Edge Function. Anonymous and member roles have read-only catalogue access and cannot call index-write functions.

The optional `/api/internal/research-index` POST route accepts only a temporary `RESEARCH_INDEX_TOKEN` of at least 32 characters. When provisioned, this allows an authorised initial backfill of four batches per call. Delete that temporary binding after backfill; without it the route is unavailable. The public search never triggers write jobs.

Search queries use a bounded in-memory embedding cache and a per-isolate request allowance. This is not a distributed abuse-prevention quota. AI timeout/failure/allowance exhaustion retains word/topic results. Query strings are redacted from Worker request logs.

## Validation

The local suite covers expected topic recall and exclusions, question intent, source/tag constraints, genuine vector retrieval with controlled fixtures, exact searches, anonymous write denial, stale-lease protection, pagination, existing account workflows and injected markup. Test fixtures are synthetic; live catalogue checks are recorded separately when released.

No new account/member data is indexed. Research quality, original full-text access and metadata completeness remain separate catalogue tasks.
