-- Email-code claims: optional supporting details; explicit administrator decisions.
-- Privileged entrypoints remain service-role-only and check live identity/session.
alter table private.source_managers add column contact_email text;
alter table private.source_managers add column granted_by uuid references auth.users on delete set null;

do $$
declare definition text; old_validation text;
begin
 select pg_get_functiondef('private.directory_core(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 definition:=replace(definition,$old$if item.requested_by=p_actor then raise exception 'Independent reviewer required' using errcode='42501';end if;$old$,'');
 old_validation:=$old$if char_length(trim(coalesce(p_payload->>'evidence',''))) not between 30 and 2000
      or coalesce(p_payload->>'evidenceUrl','') !~ '^https://[^[:space:]@]+$'
      then raise exception 'Provide public evidence of authority' using errcode='22023';end if;$old$;
 if strpos(definition,old_validation)=0 then raise exception 'Claim validation definition changed';end if;
 definition:=replace(definition,old_validation,$new$if p_payload->>'mailboxVerified' is distinct from 'true'
      or coalesce(p_payload->>'contactEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or char_length(coalesce(p_payload->>'evidence',''))>2000
      or char_length(coalesce(p_payload->>'evidenceUrl',''))>2048
      or (coalesce(p_payload->>'evidenceUrl','')<>'' and p_payload->>'evidenceUrl' !~ '^https://[^[:space:]@]+$')
      then raise exception 'Verify the source contact mailbox' using errcode='22023';end if;$new$);
 definition:=replace(definition,$old$actor_domain:=split_part(actor_email,'@',2);$old$,$new$actor_domain:=split_part(lower(coalesce(p_payload->>'contactEmail',actor_email)),'@',2);$new$);
 definition:=replace(definition,$old$'verifiedEmail',actor_email,'emailDomain',actor_domain$old$,$new$'verifiedEmail',actor_email,'contactEmail',lower(p_payload->>'contactEmail'),'mailboxVerifiedAt',now(),'emailDomain',actor_domain$new$);
 definition:=replace(definition,$old$lower(c.contact_email)=actor_email$old$,$new$lower(c.contact_email)=lower(p_payload->>'contactEmail')$new$);
 definition:=replace(definition,$old$insert into private.source_managers(source_id,user_id,role,verified_email) values(item.source_id,item.requested_by,'owner',item.evidence->>'verifiedEmail')$old$,$new$insert into private.source_managers(source_id,user_id,role,verified_email,contact_email,granted_by) values(item.source_id,item.requested_by,'owner',item.evidence->>'verifiedEmail',coalesce(item.evidence->>'contactEmail',item.evidence->>'verifiedEmail'),p_actor)$new$);
 -- Blank admin decision notes use a clear auditable default, with no word count.
 definition:=replace(definition,$old$decision:=p_payload->>'decision';review_reason:=trim(coalesce(p_payload->>'reason',''));$old$,$new$decision:=p_payload->>'decision';review_reason:=coalesce(nullif(trim(p_payload->>'reason'),''),'Administrator '||coalesce(p_payload->>'decision','review')||' decision');$new$);
 definition:=replace(definition,$old$char_length(review_reason) not between 3 and 1000$old$,$new$char_length(review_reason)>1000$new$);
 execute definition;
end;$$;

-- Preserve the established access/team service and add richer admin-only reports.
alter function public.directory_api(text,jsonb,uuid,uuid,text) rename to directory_access;
alter function public.directory_access(text,jsonb,uuid,uuid,text) set schema private;
create function public.directory_api(p_action text,p_payload jsonb default '{}'::jsonb,p_actor uuid default null,p_session uuid default null,p_assurance text default 'aal1')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_action in ('admin_sources','admin_analytics','admin_people') then
  -- The existing service checks active account, live session, membership, role
  -- and the initial password-change gate. No role is accepted from the browser.
  perform private.directory_access('admin_people','{}'::jsonb,p_actor,p_session,p_assurance);
  if p_action='admin_sources' then
   return jsonb_build_object('sources',coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'slug',s.slug,'name',s.name,'url',s.website_url,'status',s.status,'updatedAt',s.updated_at,
    'verified',exists(select 1 from private.source_managers m join auth.users u on u.id=m.user_id where m.source_id=s.id and m.role='owner' and m.verified_email=lower(u.email)),
    'contactEmail',c.contact_email,'contactName',c.contact_name,
    'ratingAverage',sig.rating_average,'ratingCount',coalesce(sig.rating_count,0),
    'pendingClaims',(select count(*) from private.source_claims cl where cl.source_id=s.id and cl.state in ('review','pending')),
    'representatives',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'accountEmail',u.email,'contactEmail',coalesce(m.contact_email,m.verified_email),'role',m.role,'grantedAt',m.granted_at,'grantedBy',g.email,'emailMatches',m.verified_email=lower(u.email))) from private.source_managers m join auth.users u on u.id=m.user_id left join auth.users g on g.id=m.granted_by where m.source_id=s.id),'[]'::jsonb),
    'verifications',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'state',v.state,'kind',v.kind,'verifiedAt',v.decided_at,'verifiedBy',u.email,'contactEmail',coalesce(v.evidence->>'contactEmail',v.evidence->>'verifiedEmail'),'reference',v.evidence->>'verificationUrl','note',v.evidence->>'moderationReason')) from private.source_verifications v left join auth.users u on u.id=v.decided_by where v.source_id=s.id),'[]'::jsonb)
   ) order by s.name) from public.sources s left join private.source_contacts c on c.source_id=s.id left join public.source_signals sig on sig.source_id=s.id),'[]'::jsonb));
  end if;
  if p_action='admin_analytics' then
   return jsonb_build_object('authorised',true,'cloudflare',coalesce((select value::jsonb from private.runtime_config where key='cloudflare_analytics'),'{"status":"setup_required"}'::jsonb),'google',jsonb_build_object('status','setup_required'));
  end if;
  result:=private.directory_access('admin_people',p_payload,p_actor,p_session,p_assurance);
  return result||jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'name',mp.display_name,'state',coalesce(mp.state,'active'),'admin',exists(select 1 from private.admin_roles a where a.user_id=u.id and a.state='active'),'createdAt',u.created_at,'lastSignIn',u.last_sign_in_at,'emailConfirmedAt',u.email_confirmed_at,'sourceCount',(select count(*) from private.source_managers m where m.user_id=u.id),'ratingCount',(select count(*) from private.source_ratings r where r.user_id=u.id),'claimCount',(select count(*) from private.source_claims c where c.requested_by=u.id))) from auth.users u left join private.member_profiles mp on mp.user_id=u.id),'[]'::jsonb),
   'audit',coalesce((select jsonb_agg(to_jsonb(a)) from (select ae.action,ae.reason,ae.created_at,ae.metadata,u.email as actor,s.name as source from private.audit_events ae left join auth.users u on u.id=ae.actor_id left join public.sources s on s.id=ae.target_id order by ae.created_at desc limit 200) a),'[]'::jsonb));
 end if;
 return private.directory_access(p_action,p_payload,p_actor,p_session,p_assurance);
end;$$;
revoke all on function public.directory_api(text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.directory_api(text,jsonb,uuid,uuid,text) to service_role;
-- Only these additional identity timestamps are needed for the admin report.
grant select(created_at,last_sign_in_at) on auth.users to service_role;
revoke all on function private.directory_access(text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.directory_access(text,jsonb,uuid,uuid,text) to service_role;
-- A stale email or removed role must not leave a public verified badge behind.
do $$
declare definition text; alias text; owner_check text;
begin
 select pg_get_functiondef('private.directory_core(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 foreach alias in array array['sig','ss'] loop
  owner_check:='exists(select 1 from private.source_managers om join auth.users ou on ou.id=om.user_id where om.source_id='||alias||'.source_id and om.role=''owner'' and om.verified_email=lower(ou.email) and not exists(select 1 from private.member_profiles mp where mp.user_id=ou.id and mp.state=''suspended''))';
  definition:=replace(definition,'coalesce('||alias||'.organisation_confirmed,false)','(coalesce('||alias||'.organisation_confirmed,false) and '||owner_check||')');
  definition:=replace(definition,'coalesce('||alias||'.domain_confirmed,false)','(coalesce('||alias||'.domain_confirmed,false) and '||owner_check||')');
  if alias='ss' then
   definition:=replace(definition,'''organisationConfirmed'',ss.organisation_confirmed','''organisationConfirmed'',(ss.organisation_confirmed and '||owner_check||')');
   definition:=replace(definition,'''domainConfirmed'',ss.domain_confirmed','''domainConfirmed'',(ss.domain_confirmed and '||owner_check||')');
  end if;
 end loop;
 execute definition;
end;$$;
