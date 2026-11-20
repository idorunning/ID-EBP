-- Fix (Codex review P1): on a fresh connection idebp.bulk_change_txid is undefined, so the
-- approval expression was NULL and "if not approved" did not raise. Force a strict boolean.
create or replace function private.safety_catch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  total integer;
  max_rows integer;
  counter text := 'idebp.tx_' || tg_table_name || '_' || lower(tg_op);
  reason text := nullif(btrim(current_setting('idebp.bulk_change_reason', true)), '');
  approved boolean;
begin
  approved := coalesce(reason is not null and length(reason) >= 10
    and current_setting('idebp.bulk_change_txid', true) = txid_current()::text, false);

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
    if approved is not true then
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

revoke all on function private.safety_catch() from public, anon, authenticated;
