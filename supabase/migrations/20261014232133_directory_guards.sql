-- Database invariants. Application authorisation and verification workflows still
-- need the hosted API; these guards also apply to privileged service writes.

create function private.touch_updated_at()
returns trigger language plpgsql set search_path=''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public,anon,authenticated,service_role;

create trigger sources_updated_at before update on public.sources
for each row execute function private.touch_updated_at();
create trigger contacts_updated_at before update on private.source_contacts
for each row execute function private.touch_updated_at();

create function private.check_source_languages()
returns trigger language plpgsql set search_path=''
as $$
declare language_code text;
begin
  -- Validate token shape; the application must also validate against its language
  -- catalogue. Do not claim that this expression validates the BCP 47 registry.
  foreach language_code in array (new.research_languages || new.summary_languages || new.machine_translation_languages)
  loop
    if language_code is null or language_code !~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' then
      raise exception 'Use language codes, not translated display labels' using errcode='23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.check_source_languages() from public,anon,authenticated,service_role;
create trigger source_language_codes before insert or update on public.sources
for each row execute function private.check_source_languages();

create function private.protect_last_admin()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.state='active' and not old.must_set_password
     and (tg_op='DELETE' or new.state<>'active' or new.must_set_password) then
    -- Serialise demotions so concurrent administrative requests cannot both
    -- observe another active administrator and remove the final two accounts.
    perform pg_advisory_xact_lock(652826,1);
    if not exists (
      select 1 from private.admin_roles a
      where a.user_id<>old.user_id and a.state='active' and not a.must_set_password
    ) then
      raise exception 'Activate another administrator before removing the last administrator'
        using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.protect_last_admin() from public,anon,authenticated,service_role;
create trigger preserve_last_admin before delete or update on private.admin_roles
for each row execute function private.protect_last_admin();

-- These functions are trigger-only. Never expose the private schema through
-- PostgREST or grant members direct access to administrative tables.
