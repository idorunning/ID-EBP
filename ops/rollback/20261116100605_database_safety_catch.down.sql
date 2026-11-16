-- Rollback for 20261116100000_database_safety_catch. Removes the guard only;
-- history and audit tables are kept for forensics.
drop trigger if exists sources_safety_catch_update on public.sources;
drop trigger if exists sources_safety_catch_delete on public.sources;
drop trigger if exists sources_safety_catch_insert on public.sources;
drop trigger if exists sources_no_truncate on public.sources;
drop trigger if exists research_records_safety_catch_update on public.research_records;
drop trigger if exists research_records_safety_catch_delete on public.research_records;
drop trigger if exists research_records_safety_catch_insert on public.research_records;
drop trigger if exists research_records_no_truncate on public.research_records;
drop function if exists private.safety_catch();
drop function if exists private.refuse_truncate();
drop function if exists private.allow_bulk_change(text);
