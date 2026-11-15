-- Targeted audit fixes. Apply transactionally after the existing workflow API.
-- No existing ownership decisions are guessed: pre-existing duplicate owners make
-- this migration fail safely for review rather than silently discarding access.
create unique index source_one_owner on private.source_managers(source_id) where role='owner';
-- Rate-limit cleanup filters on window_start, not the (key,window_start) PK prefix.
create index api_rate_limits_expiry on private.api_rate_limits(window_start);
-- Daily contribution quotas and private team/session lookups stay indexed as the
-- account catalogue grows; each index corresponds to an existing API predicate.
create index source_submissions_daily on private.source_submissions(submitted_by,created_at);
create index source_tag_suggestions_daily on private.source_tag_suggestions(submitted_by,created_at);
-- Composite indexes retain the leading user lookup, so keep no duplicate indexes.
drop index private.source_submissions_user;
drop index private.source_tag_suggestion_user;
create index source_team_invites_daily on private.source_team_invitations(invited_by,created_at);
create index source_team_invites_mailbox on private.source_team_invitations(email,expires_at) where state='pending';

-- Preserve the established API and grants while refusing to patch an unexpected
-- procedure version. pg_get_functiondef is also used by earlier project migrations.
do $migration$
declare definition text; old_fragment text; new_fragment text;
begin

 select pg_get_functiondef('private.directory_core(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 old_fragment:=$old$  select * into s from public.sources src where src.slug=p_payload->>'slug' for update;$old$;
 new_fragment:=$new$  -- Public reads must not queue behind ratings, owner edits or moderation.
  if p_action in ('profile','source_community') then
    select * into s from public.sources src where src.slug=p_payload->>'slug';
  else
    select * into s from public.sources src where src.slug=p_payload->>'slug' for update;
  end if;$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Audit migration: expected private.directory_core fragment missing';end if;
 execute replace(definition,old_fragment,new_fragment);

 select pg_get_functiondef('private.directory_core(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 old_fragment:=$old$if decision='approve' and (exists(select 1 from private.source_managers m where m.source_id=item.source_id and m.role='owner') or not exists$old$;
 new_fragment:=$new$if decision='approve' and (exists(select 1 from private.member_profiles mp where mp.user_id=item.requested_by and mp.state='suspended') or exists(select 1 from private.source_managers m where m.source_id=item.source_id and m.role='owner') or not exists$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Audit migration: expected private.directory_core fragment missing';end if;
 execute replace(definition,old_fragment,new_fragment);

 select pg_get_functiondef('private.directory_core(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 old_fragment:=$old$      select * into item from private.source_claims c where c.id=(p_payload->>'id')::uuid and c.state in ('pending','review') for update;$old$;
 new_fragment:=$new$      -- Match ownership replacement's source -> claim lock order. Recheck the
      -- claim after waiting; another reviewer may have decided it meanwhile.
      perform 1 from public.sources src join private.source_claims c on c.source_id=src.id
        where c.id=(p_payload->>'id')::uuid for update of src;
      select * into item from private.source_claims c where c.id=(p_payload->>'id')::uuid and c.state in ('pending','review') for update;$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Audit migration: expected private.directory_core fragment missing';end if;
 execute replace(definition,old_fragment,new_fragment);

 select pg_get_functiondef('public.directory_api(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 old_fragment:=$old$  for item in select m.source_id from private.source_maintenance m join public.sources s on s.id=m.source_id where s.status='published' and m.next_check_at<=now() and (m.lease is null or m.leased_at<now()-interval '15 minutes') order by m.next_check_at for update of m skip locked limit 5 loop
   update private.source_maintenance set lease=gen_random_uuid(),leased_at=now() where source_id=item.source_id;
  end loop;
  return jsonb_build_object('jobs',coalesce((select jsonb_agg(jsonb_build_object('id',m.source_id,'lease',m.lease,'slug',s.slug,'url',s.website_url,'name',s.name,'about',s.about,'publicDetails',s.public_details,'duplicateUrls',(select count(*) from public.sources other where other.id<>s.id and other.status='published' and other.canonical_domain=s.canonical_domain))) from private.source_maintenance m join public.sources s on s.id=m.source_id where m.leased_at=now() and m.lease is not null),'[]'::jsonb));
$old$;
 new_fragment:=$new$  -- RETURNING identifies this call's batch. A transaction timestamp is not a
  -- lease owner and may be shared by multiple calls or independent transactions.
  with candidates as (
   select m.source_id from private.source_maintenance m join public.sources s on s.id=m.source_id
    where s.status='published' and m.next_check_at<=now() and (m.lease is null or m.leased_at<now()-interval '15 minutes')
    order by m.next_check_at,m.source_id for update of m skip locked limit 5
  ), leased as (
   update private.source_maintenance m set lease=gen_random_uuid(),leased_at=now()
    from candidates c where m.source_id=c.source_id returning m.*
  )
  select jsonb_build_object('jobs',coalesce(jsonb_agg(jsonb_build_object('id',m.source_id,'lease',m.lease,'slug',s.slug,'url',s.website_url,'name',s.name,'about',s.about,'publicDetails',s.public_details,'duplicateUrls',(select count(*) from public.sources other where other.id<>s.id and other.status='published' and other.canonical_domain=s.canonical_domain))),'[]'::jsonb)) into result
   from leased m join public.sources s on s.id=m.source_id;
  return result;
$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Audit migration: expected public.directory_api fragment missing';end if;
 execute replace(definition,old_fragment,new_fragment);

 select pg_get_functiondef('public.directory_api(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 old_fragment:=$old$  for item in select id from private.workflow_outbox where state='pending' and available_at<=now() for update skip locked limit 10 loop update private.workflow_outbox set state='sending',lease=gen_random_uuid(),leased_at=now(),attempts=attempts+1 where id=item.id;end loop;
  return jsonb_build_object('messages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'lease',lease,'to',recipient,'subject',subject,'text',body)) from private.workflow_outbox where state='sending' and leased_at=now()),'[]'::jsonb));
$old$;
 new_fragment:=$new$  with candidates as (
   select id from private.workflow_outbox where state='pending' and available_at<=now()
    order by available_at,created_at,id for update skip locked limit 10
  ), leased as (
   update private.workflow_outbox o set state='sending',lease=gen_random_uuid(),leased_at=now(),attempts=attempts+1
    from candidates c where o.id=c.id returning o.*
  )
  select jsonb_build_object('messages',coalesce(jsonb_agg(jsonb_build_object('id',id,'lease',lease,'to',recipient,'subject',subject,'text',body)),'[]'::jsonb)) into result from leased;
  return result;
$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Audit migration: expected public.directory_api fragment missing';end if;
 execute replace(definition,old_fragment,new_fragment);

 select pg_get_functiondef('public.directory_api(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 old_fragment:=$old$ -- Internal worker actions are service-role-only and separately authenticated by$old$;
 new_fragment:=$new$ -- Serialise a member's writes with suspension, reinstatement and role grants.
 -- Lock actor and target keys in stable order, before source rows and the live
 -- membership checks. Different accounts remain independent; read views do not
 -- acquire these locks. Quotas across different sources share the same user lock.
 if p_actor is not null and p_action not in ('profile','source_community','community','saved_sources','admin_review','admin_sources','admin_people','admin_analytics','admin_workflows','review_status','team','account_export') then
  uid:=null;
  if p_action='moderate' and p_payload->>'kind'='claim' then
   select requested_by into uid from private.source_claims where id=(p_payload->>'id')::uuid;
  elsif p_action='moderate' and p_payload->>'kind'='revision' then
   select submitted_by into uid from private.source_revisions where id=(p_payload->>'id')::bigint;
  elsif p_action='accept_editor' then
   select invited_by into uid from private.source_team_invitations where id=(p_payload->>'invitationId')::uuid;
  elsif p_action='revoke_editor' then
   uid:=(p_payload->>'userId')::uuid;
  elsif p_action='admin_manage' and p_payload->>'operation'='resolve_ownership' then
   select requested_by into uid from private.source_claims where id=(p_payload->>'claimId')::uuid;
  elsif p_action='admin_manage' and p_payload->>'operation' in ('suspend_member','reinstate_member','revoke_manager') then
   uid:=(p_payload->>'userId')::uuid;
  end if;
  for item in select distinct hashtext(u::text) as lock_key from unnest(array[p_actor,uid]) u where u is not null order by lock_key loop
   perform pg_advisory_xact_lock(652827,item.lock_key);
  end loop;
 end if;
 -- Internal worker actions are service-role-only and separately authenticated by$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Audit migration: expected public.directory_api fragment missing';end if;
 execute replace(definition,old_fragment,new_fragment);

 select pg_get_functiondef('public.directory_api(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 old_fragment:=$old$  select * into src from public.sources where slug=p_payload->>'slug';
  extra:=$old$;
 new_fragment:=$new$  -- Hold the base snapshot through exact-retry lookup and insertion.
  select * into src from public.sources where slug=p_payload->>'slug' for update;
  if not found then raise exception 'Source not found' using errcode='P0002';end if;
  if not exists(select 1 from private.source_managers m where m.source_id=src.id and m.user_id=p_actor and m.verified_email=address) then raise exception 'Source manager required' using errcode='42501';end if;
  extra:=$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Audit migration: expected public.directory_api fragment missing';end if;
 execute replace(definition,old_fragment,new_fragment);

 select pg_get_functiondef('public.directory_api(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 old_fragment:=$old$  result:=private.directory_saved('edit_profile',jsonb_build_object('slug',src.slug,'profile',profile-'url'-'country'-'languages'-'publicDetails'),p_actor,p_session,p_assurance);$old$;
 new_fragment:=$new$  -- Retried identical submissions reuse the same pending decision. Compare the
  -- full proposal and source version; changed input or a new live base is distinct.
  select r.id into rid from private.source_revisions r where r.source_id=src.id and r.submitted_by=p_actor and r.state='review' and r.base_updated_at=src.updated_at
   and r.proposed_profile=(jsonb_build_object('name',src.name,'about',src.about,'publisher',src.publisher,'topics',src.topics,'methods',src.methods,'contentTypes',src.content_types)||(profile-'url'-'country'-'languages'-'publicDetails')||extra)
   order by r.id desc limit 1;
  if found then return jsonb_build_object('state','review','revisionId',rid,'message','Your changes are saved for review. Published details stay available while they are checked.');end if;
  result:=private.directory_saved('edit_profile',jsonb_build_object('slug',src.slug,'profile',profile-'url'-'country'-'languages'-'publicDetails'),p_actor,p_session,p_assurance);$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Audit migration: expected public.directory_api fragment missing';end if;
 execute replace(definition,old_fragment,new_fragment);
end;
$migration$;
