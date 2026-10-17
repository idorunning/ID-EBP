alter function public.directory_api(text,jsonb,uuid,uuid,text) rename to directory_saved;
alter function public.directory_saved(text,jsonb,uuid,uuid,text) set schema private;
create function public.directory_api(p_action text,p_payload jsonb default '{}'::jsonb,p_actor uuid default null,p_session uuid default null,p_assurance text default 'aal1')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; profile jsonb; extra jsonb; item record; src public.sources%rowtype; target public.sources%rowtype; op text; reason text; address text; key text; challenge_kind text; uid uuid; rid bigint; token uuid; count_rows integer;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16384 then raise exception 'Invalid payload' using errcode='22023';end if;
 -- Internal worker actions are service-role-only and separately authenticated by
 -- the Edge Function proxy. No public HTTP route forwards an internal request.
 if p_action='review_status' and p_payload->>'kind'='revision' then
  perform private.directory_saved('admin_review','{}',p_actor,p_session,p_assurance);select state into op from private.source_revisions where id=(p_payload->>'id')::bigint;return jsonb_build_object('state',op);
 elsif p_action='maintenance_take' then
  for item in select m.source_id from private.source_maintenance m join public.sources s on s.id=m.source_id where s.status='published' and m.next_check_at<=now() and (m.lease is null or m.leased_at<now()-interval '15 minutes') order by m.next_check_at for update of m skip locked limit 5 loop
   update private.source_maintenance set lease=gen_random_uuid(),leased_at=now() where source_id=item.source_id;
  end loop;
  return jsonb_build_object('jobs',coalesce((select jsonb_agg(jsonb_build_object('id',m.source_id,'lease',m.lease,'slug',s.slug,'url',s.website_url,'name',s.name,'about',s.about,'publicDetails',s.public_details,'duplicateUrls',(select count(*) from public.sources other where other.id<>s.id and other.status='published' and other.canonical_domain=s.canonical_domain))) from private.source_maintenance m join public.sources s on s.id=m.source_id where m.leased_at=now() and m.lease is not null),'[]'::jsonb));
 elsif p_action='maintenance_complete' then
  update private.source_maintenance set result=p_payload->'result',checked_at=now(),lease=null,leased_at=null,next_check_at=now()+interval '7 days' where source_id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid;get diagnostics count_rows=row_count;
  return jsonb_build_object('updated',count_rows=1);
 elsif p_action='outbox_take' then
  -- A lost acknowledgement is uncertain; never automatically re-send a leased
  -- email after its lease expires, which could duplicate a delivered message.
  update private.workflow_outbox o set state='cancelled' where o.state='pending' and ((o.event_key like 'editor-invitation:%' and not exists(select 1 from private.source_team_invitations i where i.id::text=split_part(o.event_key,':',2) and i.state='pending' and i.expires_at>now())) or (o.event_key like 'claim-receipt:%' and not exists(select 1 from private.source_claims c where c.id::text=split_part(o.event_key,':',2) and c.state in ('pending','review'))));
  update private.workflow_outbox set state='uncertain' where state='sending' and leased_at<now()-interval '15 minutes';
  for item in select id from private.workflow_outbox where state='pending' and available_at<=now() for update skip locked limit 10 loop update private.workflow_outbox set state='sending',lease=gen_random_uuid(),leased_at=now(),attempts=attempts+1 where id=item.id;end loop;
  return jsonb_build_object('messages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'lease',lease,'to',recipient,'subject',subject,'text',body)) from private.workflow_outbox where state='sending' and leased_at=now()),'[]'::jsonb));
 elsif p_action='outbox_complete' then
  update private.workflow_outbox set state=case when p_payload->>'sent'='true' then 'sent' else 'uncertain' end,sent_at=case when p_payload->>'sent'='true' then now() end,provider_id=left(p_payload->>'providerId',200) where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and state='sending';return jsonb_build_object('updated',found);
 end if;
 if p_action in ('edit_profile','account_update','account_export','account_challenge','account_verify','account_delete_request','account_email_ready','account_email_finish') then
  result:=private.directory_saved('session','{}',p_actor,p_session,p_assurance);
  select lower(email) into address from auth.users where id=p_actor;
 end if;
 if p_action='edit_profile' then
  profile:=p_payload->'profile';
  if jsonb_typeof(profile) is distinct from 'object' or exists(select 1 from jsonb_object_keys(profile) k where k not in ('name','about','publisher','topics','methods','contentTypes','url','country','languages','publicDetails')) then raise exception 'Invalid profile fields' using errcode='22023';end if;
  select * into src from public.sources where slug=p_payload->>'slug';
  extra:=jsonb_build_object('url',coalesce(profile->>'url',src.website_url),'country',coalesce(profile->>'country',src.country_code),'languages',coalesce(profile->'languages',to_jsonb(src.research_languages)),'publicDetails',src.public_details||coalesce(profile->'publicDetails','{}'::jsonb));
  if extra->>'url' !~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}([/?#][^[:space:]@]*)?$' or char_length(extra->>'url')>2048 or extra->>'country' !~ '^[A-Z]{2}$' or jsonb_typeof(extra->'languages')<>'array' or jsonb_array_length(extra->'languages') not between 1 and 100 or exists(select 1 from jsonb_array_elements(extra->'languages') v where jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$') then raise exception 'Invalid website, country or languages' using errcode='22023';end if;
  if jsonb_typeof(extra->'publicDetails')<>'object' or exists(select 1 from jsonb_each(extra->'publicDetails') e where e.key not in ('contactName','contactEmail','contactPage','social','logoUrl','portraitUrl','portraitSourceUrl','portraitAlt','imagePermission','summaryGenerated') or (e.key not in ('social','imagePermission','summaryGenerated') and (jsonb_typeof(e.value)<>'string' or char_length(e.value#>>'{}')>2048))) then raise exception 'Invalid public contacts' using errcode='22023';end if;
  for key in select unnest(array['contactPage','logoUrl','portraitUrl','portraitSourceUrl']) loop
   if coalesce(extra->'publicDetails'->>key,'')<>'' and extra->'publicDetails'->>key !~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}([/?#][^[:space:]@]*)?$' then raise exception 'Invalid public URL' using errcode='22023';end if;
  end loop;
  if coalesce(extra->'publicDetails'->>'contactEmail','')<>'' and extra->'publicDetails'->>'contactEmail' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid public email' using errcode='22023';end if;
  if extra->'publicDetails' ? 'social' and (jsonb_typeof(extra->'publicDetails'->'social')<>'array' or jsonb_array_length(extra->'publicDetails'->'social')>10) then raise exception 'Invalid social links' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(extra->'publicDetails'->'social','[]')) v where jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}([/?#][^[:space:]@]*)?$') then raise exception 'Invalid social link' using errcode='22023';end if;
  if (coalesce(extra->'publicDetails'->>'logoUrl','')<>'' or coalesce(extra->'publicDetails'->>'portraitUrl','')<>'') and extra->'publicDetails'->>'imagePermission' is distinct from 'true' then raise exception 'Confirm permission to use images' using errcode='22023';end if;
  if coalesce(extra->'publicDetails'->>'portraitUrl','')<>'' and coalesce(extra->'publicDetails'->>'portraitSourceUrl','')='' then raise exception 'Provide photo provenance' using errcode='22023';end if;
  result:=private.directory_saved('edit_profile',jsonb_build_object('slug',src.slug,'profile',profile-'url'-'country'-'languages'-'publicDetails'),p_actor,p_session,p_assurance);
  select id into rid from private.source_revisions where source_id=src.id and submitted_by=p_actor and state='review' order by id desc limit 1;
  update private.source_revisions set proposed_profile=proposed_profile||extra where id=rid;
  return result||jsonb_build_object('revisionId',rid);
 elsif p_action='account_update' then
  if char_length(coalesce(p_payload->>'displayName',''))>120 then raise exception 'Invalid account name' using errcode='22023';end if;
  update private.member_profiles set display_name=trim(p_payload->>'displayName') where user_id=p_actor;
  return jsonb_build_object('updated',true);
 elsif p_action='account_export' then
  return jsonb_build_object('profile',(select jsonb_build_object('displayName',display_name,'createdAt',created_at) from private.member_profiles where user_id=p_actor),'email',address,'savedSources',coalesce((select jsonb_agg(jsonb_build_object('name',s.name,'url',s.website_url,'slug',s.slug)) from public.saved_sources ss join public.sources s on s.id=ss.source_id where ss.user_id=p_actor),'[]'::jsonb),'ratings',coalesce((select jsonb_agg(jsonb_build_object('source',s.slug,'stars',r.stars,'updatedAt',r.updated_at)) from private.source_ratings r join public.sources s on s.id=r.source_id where r.user_id=p_actor),'[]'::jsonb),'claims',result->'claims','deletionRequest',(select jsonb_build_object('id',id,'state',state,'createdAt',created_at) from private.account_requests where user_id=p_actor order by created_at desc limit 1));
 elsif p_action='account_challenge' then
  challenge_kind:=p_payload->>'kind';
  if challenge_kind not in ('email_current','email_new','deletion') or p_payload->>'hash' !~ '^[a-f0-9]{64}$' or coalesce(p_payload->>'targetEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid verification' using errcode='22023';end if;
  if challenge_kind<>'email_new' and lower(p_payload->>'targetEmail')<>address then raise exception 'Account mailbox required' using errcode='42501';end if;
  insert into private.member_challenges(user_id,kind,target_email,token_hash,expires_at) values(p_actor,challenge_kind,lower(p_payload->>'targetEmail'),p_payload->>'hash',now()+interval '10 minutes') on conflict(user_id,kind) do update set target_email=excluded.target_email,token_hash=excluded.token_hash,expires_at=excluded.expires_at,attempts=0,verified_at=null;
  return jsonb_build_object('sent',true);
 elsif p_action='account_verify' then
  select * into item from private.member_challenges where user_id=p_actor and kind=p_payload->>'kind' for update;
  if not found or item.expires_at<now() or item.attempts>=5 then return jsonb_build_object('verified',false);end if;
  update private.member_challenges set attempts=attempts+1,verified_at=case when item.token_hash=p_payload->>'hash' then now() else verified_at end where user_id=p_actor and kind=item.kind;
  return jsonb_build_object('verified',item.token_hash=p_payload->>'hash');
 elsif p_action='account_email_ready' then
  if not exists(select 1 from private.member_challenges where user_id=p_actor and kind='email_current' and verified_at is not null and expires_at>now() and target_email=address) or not exists(select 1 from private.member_challenges where user_id=p_actor and kind='email_new' and verified_at is not null and expires_at>now()) then raise exception 'Verify both mailboxes' using errcode='42501';end if;
  return jsonb_build_object('email',(select target_email from private.member_challenges where user_id=p_actor and kind='email_new'));
 elsif p_action='account_email_finish' then
  delete from private.member_challenges where user_id=p_actor and kind in ('email_current','email_new');
  insert into private.audit_events(actor_id,action,reason) values(p_actor,'account_email_changed','Both the previous and new mailbox were verified');return jsonb_build_object('updated',true);
 elsif p_action='account_delete_request' then
  if not exists(select 1 from private.member_challenges where user_id=p_actor and kind='deletion' and verified_at is not null and expires_at>now() and target_email=address) then raise exception 'Verify your account email' using errcode='42501';end if;
  insert into private.account_requests(user_id,kind) values(p_actor,'deletion') on conflict(user_id) where state='pending' do nothing;
  delete from private.member_challenges where user_id=p_actor and kind='deletion';
  insert into private.audit_events(actor_id,action,reason) values(p_actor,'account_deletion_requested','Member verified their account mailbox and requested deletion');return jsonb_build_object('requested',true);
 end if;
 if p_action='admin_manage' and p_payload->>'operation'='publish_source' and exists(select 1 from private.source_duplicates d join public.sources s on s.id=d.source_id where s.slug=p_payload->>'slug') then raise exception 'Undo the duplicate decision before restoring' using errcode='22023';end if;
 if p_action in ('admin_manage','admin_workflows','moderate') then
  perform private.directory_saved('admin_review','{}',p_actor,p_session,p_assurance);
 end if;
 if p_action='admin_workflows' then
  return jsonb_build_object('maintenance',coalesce((select jsonb_agg(jsonb_build_object('slug',s.slug,'name',s.name,'dueAt',m.next_check_at,'checkedAt',m.checked_at,'result',m.result)) from private.source_maintenance m join public.sources s on s.id=m.source_id),'[]'::jsonb),'notifications',coalesce((select jsonb_agg(to_jsonb(o)) from (select id,event_key,state,attempts,created_at,sent_at from private.workflow_outbox order by created_at desc limit 100) o),'[]'::jsonb),'accountRequests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'email',u.email,'state',r.state,'createdAt',r.created_at)) from private.account_requests r join auth.users u on u.id=r.user_id where r.state='pending'),'[]'::jsonb));
 elsif p_action='admin_manage' and p_payload->>'operation' in ('reinstate_member','merge_duplicate','undo_duplicate','resolve_ownership','queue_maintenance','cancel_deletion_request') then
  op:=p_payload->>'operation';reason:=trim(coalesce(p_payload->>'reason',''));if char_length(reason) not between 10 and 1000 then raise exception 'Record the decision reason' using errcode='22023';end if;
  if op='reinstate_member' then update private.member_profiles set state='active' where user_id=(p_payload->>'userId')::uuid;get diagnostics count_rows=row_count;if count_rows=0 then raise exception 'Member not found' using errcode='P0002';end if;
  elsif op='cancel_deletion_request' then update private.account_requests set state='cancelled',decided_by=p_actor,decided_at=now() where id=(p_payload->>'requestId')::uuid and state='pending';
  else
   select * into src from public.sources where slug=p_payload->>'slug' for update;if not found then raise exception 'Source not found' using errcode='P0002';end if;
   if op='merge_duplicate' then
    select * into target from public.sources where slug=p_payload->>'targetSlug' and status='published' for update;
    if not found or target.id=src.id or exists(select 1 from private.source_duplicates where source_id=target.id or target_id=src.id) then raise exception 'Choose a separate canonical source' using errcode='22023';end if;
    insert into private.source_duplicates(source_id,target_id,previous_status,decided_by,reason) values(src.id,target.id,src.status,p_actor,reason);
    insert into public.saved_sources(user_id,source_id) select user_id,target.id from public.saved_sources where source_id=src.id on conflict do nothing;
    update public.sources set status='hidden' where id=src.id;
   elsif op='undo_duplicate' then
    select * into item from private.source_duplicates where source_id=src.id for update;
    if not found then raise exception 'Duplicate record not found' using errcode='P0002';end if;
    update public.sources set status=item.previous_status where id=src.id;delete from private.source_duplicates where source_id=src.id;
   elsif op='queue_maintenance' then insert into private.source_maintenance(source_id) values(src.id) on conflict(source_id) do update set next_check_at=now();
   elsif op='resolve_ownership' then
    select * into item from private.source_claims where id=(p_payload->>'claimId')::uuid and source_id=src.id and state in ('pending','review') for update;
    if not found or p_payload->>'independentCheck' is distinct from 'true' then raise exception 'Select and verify the replacement claimant' using errcode='22023';end if;
    delete from private.source_managers where source_id=src.id;
    update private.source_team_invitations set state='revoked' where source_id=src.id and state='pending';
    update private.source_verifications set state='expired' where source_id=src.id and state='confirmed';
    perform private.directory_saved('moderate',jsonb_build_object('kind','claim','id',item.id,'decision','approve','reason',reason,'independentCheck',true,'verificationUrl',p_payload->>'verificationUrl'),p_actor,p_session,p_assurance);
   end if;
  end if;
  insert into private.audit_events(actor_id,action,target_id,reason,metadata) values(p_actor,op,src.id,reason,p_payload-'reason');return jsonb_build_object('updated',true);
 end if;
 if p_action='moderate' and p_payload->>'kind'='revision' then
  select * into item from private.source_revisions where id=(p_payload->>'id')::bigint and state='review' for update;
  result:=private.directory_saved(p_action,p_payload,p_actor,p_session,p_assurance);
  if p_payload->>'decision'='approve' and item.proposed_profile ? 'publicDetails' then
   profile:=item.proposed_profile;
   update public.sources set website_url=profile->>'url',canonical_domain=lower(substring(profile->>'url' from '^https://([^/?#]+)')),country_code=profile->>'country',research_languages=array(select jsonb_array_elements_text(profile->'languages')),public_details=(profile->'publicDetails')||jsonb_build_object('summaryGenerated',false) where id=item.source_id;
  end if;return result;
 end if;
 result:=private.directory_saved(p_action,p_payload,p_actor,p_session,p_assurance);
 if p_action='profile' then select * into src from public.sources where slug=p_payload->>'slug';result:=jsonb_set(result,'{profile}',result->'profile'||jsonb_build_object('publicDetails',src.public_details));
 elsif p_action='community' then
  select coalesce(jsonb_object_agg(s.slug,(result->'sources'->s.slug)||jsonb_build_object('profile',(result->'sources'->s.slug->'profile')||jsonb_build_object('publicDetails',s.public_details,'linkAudit',(select jsonb_build_object('status',m.result->>'status','checkedAt',m.checked_at,'httpStatus',m.result->'httpStatus','note',m.result->>'note') from private.source_maintenance m where m.source_id=s.id and m.checked_at is not null)))),'{}') into profile from public.sources s where s.status='published';
  result:=result||jsonb_build_object('sources',profile,'redirects',coalesce((select jsonb_object_agg(s.slug,t.slug) from private.source_duplicates d join public.sources s on s.id=d.source_id join public.sources t on t.id=d.target_id where t.status='published'),'{}'));
 elsif p_action='session' then result:=result||jsonb_build_object('displayName',(select display_name from private.member_profiles where user_id=p_actor),'deletionRequested',exists(select 1 from private.account_requests where user_id=p_actor and state='pending'));
 elsif p_action='admin_sources' then
  select coalesce(jsonb_agg(record||jsonb_build_object('duplicateOf',(select t.slug from private.source_duplicates d join public.sources t on t.id=d.target_id where d.source_id=(record->>'id')::uuid))),'[]') into profile from jsonb_array_elements(result->'sources') record;
  result:=result||jsonb_build_object('sources',profile);
 end if;
 return result;
end;$$;
revoke all on function private.directory_saved(text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.directory_saved(text,jsonb,uuid,uuid,text) to service_role;
revoke all on function public.directory_api(text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.directory_api(text,jsonb,uuid,uuid,text) to service_role;
