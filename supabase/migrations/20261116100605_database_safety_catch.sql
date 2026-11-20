-- Database safety catch and append-only change history for the two master tables.
--
-- 1. Bulk guard: one TRANSACTION may not change more than
--      public.sources           1 deleted row  / 25 updated rows
--      public.research_records 25 deleted rows / 500 updated rows
--    (counted cumulatively, so row-by-row loops are caught too) unless it first runs:
--      select private.allow_bulk_change('<why, who - at least 10 characters>');
--    The permission is bound to the current transaction id, so a reason left
--    in a pooled session cannot approve a later transaction. Overridden
--    changes are written to private.bulk_change_audit.
-- 2. TRUNCATE of either table is always refused.
-- 3. Every UPDATE or DELETE copies the old rows into an append-only history
--    table (private.source_history, private.research_record_history).
--    History and audit rows cannot be updated, deleted or truncated.
-- 4. Large inserts (over 500 rows in one statement) are audited, not blocked.
--
-- Website and admin workflows change one row per request and are unaffected.
-- Bulk promotion from staging must call private.allow_bulk_change() first.
-- Rollback: 20261116100000_database_safety_catch.down.sql

set lock_timeout = '5s';

create table private.bulk_change_audit(
  id bigint generated always as identity primary key,
  table_name text not null,
  operation text not null,
  row_count integer not null,
  reason text,
  db_user text not null default coalesce(nullif(current_setting('role', true), 'none'), session_user),
  app_user text default (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
  created_at timestamptz not null default now()
);

create table private.source_history(
  history_id bigint generated always as identity primary key,
  source_id uuid not null,
  operation text not null check (operation in ('UPDATE','DELETE')),
  old_row jsonb not null,
  reason text,
  db_user text not null default coalesce(nullif(current_setting('role', true), 'none'), session_user),
  changed_at timestamptz not null default now()
);
create index source_history_source_idx on private.source_history(source_id, changed_at desc);

create table private.research_record_history(
  history_id bigint generated always as identity primary key,
  record_id text not null,
  operation text not null check (operation in ('UPDATE','DELETE')),
  old_row jsonb not null,
  reason text,
  db_user text not null default coalesce(nullif(current_setting('role', true), 'none'), session_user),
  changed_at timestamptz not null default now()
);
create index research_record_history_record_idx on private.research_record_history(record_id, changed_at desc);

alter table private.bulk_change_audit enable row level security;
alter table private.source_history enable row level security;
alter table private.research_record_history enable row level security;
revoke all on private.bulk_change_audit, private.source_history, private.research_record_history from public, anon, authenticated;

-- History and audit tables are append-only.
create function private.refuse_history_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ID-EBP: % is append-only; % refused', tg_table_name, tg_op using errcode = 'P0001';
end $$;

create trigger source_history_append_only before update or delete on private.source_history
  for each row execute function private.refuse_history_change();
create trigger source_history_no_truncate before truncate on private.source_history
  for each statement execute function private.refuse_history_change();
create trigger research_record_history_append_only before update or delete on private.research_record_history
  for each row execute function private.refuse_history_change();
create trigger research_record_history_no_truncate before truncate on private.research_record_history
  for each statement execute function private.refuse_history_change();
create trigger bulk_change_audit_append_only before update or delete on private.bulk_change_audit
  for each row execute function private.refuse_history_change();
create trigger bulk_change_audit_no_truncate before truncate on private.bulk_change_audit
  for each statement execute function private.refuse_history_change();

-- Grants permission for bulk changes in the CURRENT transaction only.
create function private.allow_bulk_change(reason text) returns void
language plpgsql set search_path = '' as $$
begin
  if reason is null or length(btrim(reason)) < 10 then
    raise exception 'ID-EBP: a bulk change reason of at least 10 characters is required' using errcode = 'P0001';
  end if;
  perform set_config('idebp.bulk_change_reason', btrim(reason), true);
  perform set_config('idebp.bulk_change_txid', txid_current()::text, true);
end $$;

create function private.refuse_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ID-EBP safety catch: TRUNCATE of % is not allowed', tg_table_name using errcode = 'P0001';
end $$;

create function private.safety_catch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  total integer;
  max_rows integer;
  counter text := 'idebp.tx_' || tg_table_name || '_' || lower(tg_op);
  reason text := nullif(btrim(current_setting('idebp.bulk_change_reason', true)), '');
  approved boolean;
begin
  approved := reason is not null and length(reason) >= 10
    and current_setting('idebp.bulk_change_txid', true) = txid_current()::text;

  if tg_op = 'INSERT' then
    select count(*) into n from new_rows;
    if n > 500 then
      insert into private.bulk_change_audit(table_name, operation, row_count, reason)
        values (tg_table_name, tg_op, n, case when approved then reason end);
    end if;
    return null;
  end if;

  select count(*) into n from old_rows;
  if n = 0 then return null; end if;

  total := coalesce(nullif(current_setting(counter, true), ''), '0')::integer + n;
  perform set_config(counter, total::text, true);

  max_rows := case
    when tg_table_name = 'sources' and tg_op = 'DELETE' then 1
    when tg_table_name = 'sources' then 25
    when tg_table_name = 'research_records' and tg_op = 'DELETE' then 25
    else 500 end;

  if total > max_rows then
    if not approved then
      raise exception 'ID-EBP safety catch: % of % rows in %.% this transaction blocked (limit %). If intended, first run: select private.allow_bulk_change(''<reason>'');',
        tg_op, total, tg_table_schema, tg_table_name, max_rows using errcode = 'P0001';
    end if;
    insert into private.bulk_change_audit(table_name, operation, row_count, reason)
      values (tg_table_name, tg_op, n, reason);
  end if;

  if tg_table_name = 'sources' then
    insert into private.source_history(source_id, operation, old_row, reason)
      select o.id, tg_op, to_jsonb(o), case when approved then reason end from old_rows o;
  else
    insert into private.research_record_history(record_id, operation, old_row, reason)
      select o.id, tg_op, to_jsonb(o) - 'search_vector', case when approved then reason end from old_rows o;
  end if;
  return null;
end $$;

revoke all on function private.safety_catch(), private.refuse_truncate(), private.refuse_history_change(), private.allow_bulk_change(text) from public, anon, authenticated;

create trigger sources_safety_catch_update after update on public.sources
  referencing old table as old_rows for each statement execute function private.safety_catch();
create trigger sources_safety_catch_delete after delete on public.sources
  referencing old table as old_rows for each statement execute function private.safety_catch();
create trigger sources_safety_catch_insert after insert on public.sources
  referencing new table as new_rows for each statement execute function private.safety_catch();
create trigger sources_no_truncate before truncate on public.sources
  for each statement execute function private.refuse_truncate();

create trigger research_records_safety_catch_update after update on public.research_records
  referencing old table as old_rows for each statement execute function private.safety_catch();
create trigger research_records_safety_catch_delete after delete on public.research_records
  referencing old table as old_rows for each statement execute function private.safety_catch();
create trigger research_records_safety_catch_insert after insert on public.research_records
  referencing new table as new_rows for each statement execute function private.safety_catch();
create trigger research_records_no_truncate before truncate on public.research_records
  for each statement execute function private.refuse_truncate();

reset lock_timeout;
