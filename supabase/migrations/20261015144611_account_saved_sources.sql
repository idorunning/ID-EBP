-- Account collections use the existing RLS-protected table. The trusted API
-- always derives the member from the verified live session, never the payload.
alter function public.directory_api(text,jsonb,uuid,uuid,text) rename to directory_reports;
alter function public.directory_reports(text,jsonb,uuid,uuid,text) set schema private;
create function public.directory_api(p_action text,p_payload jsonb default '{}'::jsonb,p_actor uuid default null,p_session uuid default null,p_assurance text default 'aal1')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare src uuid; result jsonb; review_state text;
begin
 if p_action='review_status' then
  perform private.directory_reports('admin_review','{}'::jsonb,p_actor,p_session,p_assurance);
  if p_payload->>'kind'='claim' then select state into review_state from private.source_claims where id=(p_payload->>'id')::uuid;
  elsif p_payload->>'kind'='tag' then select state into review_state from private.source_tag_suggestions where id=(p_payload->>'id')::uuid;
  elsif p_payload->>'kind'='revision' then select state into review_state from private.source_revisions where id=(p_payload->>'id')::uuid;
  elsif p_payload->>'kind'='submission' then select state into review_state from private.source_submissions where id=(p_payload->>'id')::uuid;
  else raise exception 'Invalid review kind' using errcode='22023';end if;
  return jsonb_build_object('state',review_state);
 end if;
 if p_action in ('saved_sources','save_source','remove_saved_source','import_saved_sources') then
  if p_actor is null then raise exception 'Sign in required' using errcode='42501';end if;
  perform private.directory_reports('session','{}'::jsonb,p_actor,p_session,p_assurance);
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16384 then raise exception 'Invalid payload' using errcode='22023';end if;
  if p_action='import_saved_sources' then
   if jsonb_typeof(p_payload->'slugs') is distinct from 'array' then raise exception 'Expected source list' using errcode='22023';end if;
   if jsonb_array_length(p_payload->'slugs')>200 then raise exception 'Too many sources' using errcode='22023';end if;
   if exists(select 1 from jsonb_array_elements(p_payload->'slugs') item where jsonb_typeof(item)<>'string' or (item#>>'{}') !~ '^[a-z0-9]+(-[a-z0-9]+)*$') then raise exception 'Invalid source list' using errcode='22023';end if;
   insert into public.saved_sources(user_id,source_id)
    select p_actor,s.id from public.sources s where s.status='published' and s.slug in (select jsonb_array_elements_text(p_payload->'slugs'))
    on conflict(user_id,source_id) do nothing;
  elsif p_action in ('save_source','remove_saved_source') then
   select s.id into src from public.sources s where s.slug=p_payload->>'slug' and (p_action='remove_saved_source' or s.status='published');
   if src is null then raise exception 'Source not found' using errcode='P0002';end if;
   if p_action='save_source' then
    insert into public.saved_sources(user_id,source_id) values(p_actor,src) on conflict(user_id,source_id) do nothing;
   else delete from public.saved_sources where user_id=p_actor and source_id=src;end if;
   return jsonb_build_object('slug',p_payload->>'slug','saved',p_action='save_source');
  end if;
  return jsonb_build_object('saved',coalesce((select jsonb_agg(s.slug order by ss.created_at,s.slug) from public.saved_sources ss join public.sources s on s.id=ss.source_id where ss.user_id=p_actor and s.status='published'),'[]'::jsonb));
 end if;
 return private.directory_reports(p_action,p_payload,p_actor,p_session,p_assurance);
end;$$;
revoke all on function private.directory_reports(text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.directory_reports(text,jsonb,uuid,uuid,text) to service_role;
revoke all on function public.directory_api(text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.directory_api(text,jsonb,uuid,uuid,text) to service_role;
