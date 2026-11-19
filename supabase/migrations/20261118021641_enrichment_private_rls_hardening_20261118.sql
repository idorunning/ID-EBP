alter table private.doi_enrichment_queue enable row level security;
alter table private.non_doi_enrichment_queue enable row level security;
alter table private.enrichment_run_log enable row level security;
alter table private.research_duplicate_review enable row level security;
revoke all on private.doi_enrichment_queue from anon,authenticated;
revoke all on private.non_doi_enrichment_queue from anon,authenticated;
revoke all on private.enrichment_run_log from anon,authenticated;
revoke all on private.research_duplicate_review from anon,authenticated;