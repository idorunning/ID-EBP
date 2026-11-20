create table if not exists private.snapshot_20261120_research_records as select * from public.research_records;
alter table private.snapshot_20261120_research_records enable row level security;
revoke all on private.snapshot_20261120_research_records from anon,authenticated;
comment on table private.snapshot_20261120_research_records is 'Point-in-time research catalogue copy before the editorial summary job starts writing (20 November 2026). Not an offsite backup.';
