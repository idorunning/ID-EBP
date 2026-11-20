do $$ begin if to_regclass($q$private.snapshot_20261115_sources$q$) is not null then revoke all on private.snapshot_20261115_sources, private.snapshot_20261115_research_records from public, anon, authenticated; end if; end $$;
alter table private.promotion_log enable row level security;
alter table if exists private.snapshot_20261115_sources enable row level security;
alter table if exists private.snapshot_20261115_research_records enable row level security;
alter table if exists staging.label_suggestions_haiku_20261116 enable row level security; -- table was created ad hoc on live, not by a migration
revoke all on private.promotion_log from public, anon, authenticated;
do $$ begin if to_regclass($q$staging.label_suggestions_haiku_20261116$q$) is not null then revoke all on staging.label_suggestions_haiku_20261116 from public, anon, authenticated; end if; end $$;
