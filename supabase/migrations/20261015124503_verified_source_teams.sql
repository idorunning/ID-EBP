-- Source roles are bound to the verified email that the administrator checked.
alter table private.source_managers add column verified_email text;
update private.source_managers m set verified_email=lower(u.email) from auth.users u where u.id=m.user_id;
alter table private.source_managers alter column verified_email set not null;
create table private.source_team_invitations (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.sources on delete cascade,
 email text not null check(email=lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 invited_by uuid not null references auth.users, state text not null default 'pending' check(state in ('pending','accepted','revoked')),
 expires_at timestamptz not null default now()+interval '7 days', accepted_by uuid references auth.users,
 created_at timestamptz not null default now()
);
create unique index pending_team_invite on private.source_team_invitations(source_id,email) where state='pending';
create table private.runtime_config(key text primary key,value text not null);
alter table private.runtime_config enable row level security;
alter table private.source_team_invitations enable row level security;
revoke all on private.runtime_config,private.source_team_invitations from public,anon,authenticated,service_role;
grant select,insert,update,delete on private.runtime_config,private.source_team_invitations to service_role;
alter function public.directory_api(text,jsonb,uuid,uuid,text) rename to directory_core;
alter function public.directory_core(text,jsonb,uuid,uuid,text) set schema private;

create function public.directory_api(p_action text,p_payload jsonb default '{}'::jsonb,p_actor uuid default null,p_session uuid default null,p_assurance text default 'aal1')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare address text; src public.sources%rowtype; inv private.source_team_invitations%rowtype; result jsonb; admin_ok boolean; reason text;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16384 then raise exception 'Invalid payload' using errcode='22023';end if;
 if p_action='proxy_check' then return jsonb_build_object('valid',exists(select 1 from private.runtime_config where key='proxy_hash' and value=p_payload->>'hash'));end if;
 if p_actor is not null then
  select lower(u.email) into address from auth.users u join auth.sessions ss on ss.user_id=u.id and ss.id=p_session
   where u.id=p_actor and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (ss.not_after is null or ss.not_after>now());
  if address is null or exists(select 1 from private.member_profiles where user_id=p_actor and state='suspended') then raise exception 'Active verified member required' using errcode='42501';end if;
 end if;
 if p_action='password_changed' then
  if address is null then raise exception 'Sign in required' using errcode='42501';end if;
  update private.admin_roles set must_set_password=false where user_id=p_actor;
  insert into private.audit_events(actor_id,action,reason) values(p_actor,'password_changed','Password updated through authenticated account service');
  return jsonb_build_object('updated',true);
 end if;
 admin_ok:=address is not null and p_assurance='aal2' and exists(select 1 from private.admin_roles a where a.user_id=p_actor and a.state='active' and not a.must_set_password);
 if p_action='admin_people' then
  if not admin_ok then raise exception 'Admin MFA required' using errcode='42501';end if;
  return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('id',mp.user_id,'email',u.email,'state',mp.state,'admin',exists(select 1 from private.admin_roles a where a.user_id=u.id and a.state='active'))) from private.member_profiles mp join auth.users u on u.id=mp.user_id),'[]'::jsonb),
   'managers',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'slug',s.slug,'sourceName',s.name,'email',m.verified_email,'role',m.role)) from private.source_managers m join public.sources s on s.id=m.source_id),'[]'::jsonb),
   'audit',coalesce((select jsonb_agg(to_jsonb(a)) from (select action,reason,created_at from private.audit_events order by created_at desc limit 50) a),'[]'::jsonb));
 end if;
 if p_action='admin_manage' then
  if not admin_ok then raise exception 'Admin MFA required' using errcode='42501';end if;
  reason:=trim(coalesce(p_payload->>'reason',''));if char_length(reason) not between 10 and 1000 then raise exception 'Record a reason' using errcode='22023';end if;
  if p_payload->>'operation'='invite_admin' then
   if coalesce(p_payload->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email' using errcode='22023';end if;
   insert into private.admin_invitations(email,invited_by) values(lower(p_payload->>'email'),p_actor) on conflict(email) do update set state='pending',invited_by=p_actor;
  elsif p_payload->>'operation'='suspend_member' then
   if (p_payload->>'userId')::uuid=p_actor or exists(select 1 from private.admin_roles where user_id=(p_payload->>'userId')::uuid and state='active') then raise exception 'Cannot suspend an active administrator' using errcode='42501';end if;
   update private.member_profiles set state='suspended' where user_id=(p_payload->>'userId')::uuid;
   delete from private.source_managers where user_id=(p_payload->>'userId')::uuid;
   update private.source_team_invitations set state='revoked' where invited_by=(p_payload->>'userId')::uuid and state='pending';
  elsif p_payload->>'operation'='revoke_manager' then
   delete from private.source_managers m using public.sources s where m.source_id=s.id and s.slug=p_payload->>'slug' and m.user_id=(p_payload->>'userId')::uuid;
  elsif p_payload->>'operation' in ('hide_source','publish_source') then
   update public.sources set status=case when p_payload->>'operation'='hide_source' then 'hidden' else 'published' end where slug=p_payload->>'slug';
  else raise exception 'Unknown operation' using errcode='22023';end if;
  -- Ownership badges are removed if the approved owner has been revoked.
  update public.source_signals sig set organisation_confirmed=false,domain_confirmed=false where not exists(select 1 from private.source_managers m where m.source_id=sig.source_id and m.role='owner');
  insert into private.audit_events(actor_id,action,reason,metadata) values(p_actor,p_payload->>'operation',reason,p_payload- 'reason');
  return jsonb_build_object('updated',true);
 end if;
 if p_action in ('team','invite_editor','accept_editor','revoke_editor') then
  if address is null then raise exception 'Sign in required' using errcode='42501';end if;
  select * into src from public.sources where slug=p_payload->>'slug' for update;
  if not found then raise exception 'Source not found' using errcode='P0002';end if;
  if p_action='accept_editor' then
   select * into inv from private.source_team_invitations where id=(p_payload->>'invitationId')::uuid and source_id=src.id and email=address and state='pending' and expires_at>now() for update;
   if not found or not exists(select 1 from private.source_managers m join auth.users u on u.id=m.user_id where m.source_id=src.id and m.user_id=inv.invited_by and m.role='owner' and m.verified_email=lower(u.email) and not exists(select 1 from private.member_profiles mp where mp.user_id=m.user_id and mp.state='suspended')) then raise exception 'Invitation unavailable' using errcode='42501';end if;
   insert into private.source_managers(source_id,user_id,role,verified_email) values(src.id,p_actor,'editor',address) on conflict do nothing;
   delete from private.source_ratings where source_id=src.id and user_id=p_actor;
   update private.source_team_invitations set state='accepted',accepted_by=p_actor where id=inv.id;
  else
   if not exists(select 1 from private.source_managers where source_id=src.id and user_id=p_actor and role='owner' and verified_email=address) then raise exception 'Source owner required' using errcode='42501';end if;
   if p_action='team' then return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('userId',user_id,'email',verified_email,'role',role)) from private.source_managers where source_id=src.id),'[]'::jsonb),'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'expiresAt',expires_at)) from private.source_team_invitations where source_id=src.id and state='pending' and expires_at>now()),'[]'::jsonb));end if;
   if p_action='invite_editor' then
    if coalesce(p_payload->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email' using errcode='22023';end if;
    if (select count(*) from private.source_team_invitations where invited_by=p_actor and created_at>now()-interval '1 day')>=10 then raise exception 'rate_limited';end if;
    insert into private.source_team_invitations(source_id,email,invited_by) values(src.id,lower(p_payload->>'email'),p_actor);
   elsif p_action='revoke_editor' then
    delete from private.source_managers where source_id=src.id and user_id=(p_payload->>'userId')::uuid and role='editor';
    update private.source_team_invitations set state='revoked' where source_id=src.id and id::text=p_payload->>'invitationId' and state='pending';
   end if;
  end if;
  insert into private.audit_events(actor_id,action,target_id,reason) values(p_actor,p_action,src.id,'Source team access updated after verified identity and scope checks');
  return jsonb_build_object('updated',true);
 end if;
 result:=private.directory_core(p_action,p_payload,p_actor,p_session,p_assurance);
 if p_action='session' then result:=result||jsonb_build_object('teamInvitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'slug',s.slug,'name',s.name,'expiresAt',i.expires_at)) from private.source_team_invitations i join public.sources s on s.id=i.source_id where i.email=address and i.state='pending' and i.expires_at>now()),'[]'::jsonb));end if;
 return result;
end;$$;
revoke all on function public.directory_api(text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.directory_api(text,jsonb,uuid,uuid,text) to service_role;
