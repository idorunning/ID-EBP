alter table staging.candidate_records add column if not exists match_score numeric;
alter table staging.candidate_records add column if not exists match_note text;
