alter table staging.candidate_sources add column if not exists still_active boolean;
alter table staging.candidate_sources add column if not exists check_note text;
