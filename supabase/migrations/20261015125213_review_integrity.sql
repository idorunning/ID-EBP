-- Keep before/after revision history and reject stale submissions at publication.
alter table private.source_revisions add column base_updated_at timestamptz;
alter table private.source_revisions add column previous_profile jsonb;
create function private.capture_revision_base() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select updated_at,to_jsonb(s) into new.base_updated_at,new.previous_profile from public.sources s where s.id=new.source_id;
 return new;
end;$$;
revoke all on function private.capture_revision_base() from public,anon,authenticated,service_role;
create trigger revision_base before insert on private.source_revisions for each row execute function private.capture_revision_base();
create function private.check_revision_publication() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='applied' and old.state<>'applied' then
  perform 1 from public.sources s where s.id=new.source_id and s.updated_at=new.base_updated_at for update;
  if not found then raise exception 'Profile changed since submission; submit a fresh revision' using errcode='22023';end if;
  if not exists(select 1 from private.source_managers m join auth.users u on u.id=m.user_id where m.source_id=new.source_id and m.user_id=new.submitted_by and lower(u.email)=m.verified_email and not exists(select 1 from private.member_profiles p where p.user_id=u.id and p.state='suspended')) then raise exception 'Representative access has been revoked' using errcode='42501';end if;
 end if;
 return new;
end;$$;
revoke all on function private.check_revision_publication() from public,anon,authenticated,service_role;
create trigger revision_publication before update on private.source_revisions for each row execute function private.check_revision_publication();
-- The provisioning helper can only read a one-use, private deployment record.
-- It is not exposed through any website route and returns null after consumption.
create function public.directory_bootstrap(p_complete boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare setup jsonb;
begin
 select value::jsonb into setup from private.runtime_config where key='bootstrap' for update;
 if p_complete then delete from private.runtime_config where key='bootstrap';return null;end if;
 return setup;
end;$$;
revoke all on function public.directory_bootstrap(boolean) from public,anon,authenticated;
grant execute on function public.directory_bootstrap(boolean) to service_role;
