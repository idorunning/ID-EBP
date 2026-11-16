create table private.snapshot_20261116_sources as table public.sources;
create table private.snapshot_20261116_research_records as table public.research_records;
create table private.snapshot_20261116_source_contacts as table private.source_contacts;
create table private.snapshot_20261116_source_managers as table private.source_managers;
create table private.snapshot_20261116_source_tags as table public.source_tags;
create table private.snapshot_20261116_source_links as table public.source_links;
do $$ declare t text; begin
 foreach t in array array['snapshot_20261116_sources','snapshot_20261116_research_records','snapshot_20261116_source_contacts','snapshot_20261116_source_managers','snapshot_20261116_source_tags','snapshot_20261116_source_links'] loop
  execute format('alter table private.%I enable row level security', t);
  execute format('revoke all on private.%I from public, anon, authenticated', t);
 end loop; end $$;
