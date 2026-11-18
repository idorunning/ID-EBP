-- Source-managed external resources; isolated from the research catalogue.
create table private.source_resources (
 id uuid primary key default gen_random_uuid(),
 source_id uuid not null references public.sources(id) on delete restrict,
 type text not null check (type in ('annual_report','research','related_source','event','newsletter','other')),
 title text not null check (char_length(title) between 5 and 240),
 description text not null default '' check (char_length(description)<=1200),
 url text not null check (char_length(url)<=2048 and url ~* '^https://[a-z0-9][a-z0-9.-]+(:[0-9]{2,5})?(/[^[:space:]]*)?$'),
 report_year integer check(report_year between 1900 and 2100),
 event_date date,
 language text check (language is null or language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
 state text not null default 'pending' check(state in ('pending','approved','rejected','withdrawn')),
 submitted_by uuid not null references auth.users(id),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 review_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index source_resources_public on private.source_resources(source_id,type,report_year desc,created_at desc) where state='approved';
create index source_resources_review on private.source_resources(created_at) where state='pending';
create index source_resources_own on private.source_resources(submitted_by,created_at desc);
alter table private.source_resources enable row level security;
revoke all on private.source_resources from public,anon,authenticated;
grant select,insert,update on private.source_resources to service_role;
-- Review through the trusted directory RPC. No browser role can access the table.
alter function public.directory_api(text,jsonb,uuid,uuid,text) rename to directory_before_resources;
alter function public.directory_before_resources(text,jsonb,uuid,uuid,text) set schema private;
create function public.directory_api(p_action text,p_payload jsonb default '{}'::jsonb,p_actor uuid default null,p_session uuid default null,p_assurance text default 'aal1')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare src public.sources%rowtype; resource private.source_resources%rowtype; address text;
 authorised boolean:=false; admin_ok boolean:=false; item_type text; item_title text; item_url text; item_description text; resource_id uuid; report_year_value integer; event_date_value date; item_language text; decision text; result jsonb;
begin
 if p_action not in ('resource_list','resource_submit','resource_review_queue','resource_moderate') then
   return private.directory_before_resources(p_action,p_payload,p_actor,p_session,p_assurance);
 end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16384 then
   raise exception 'Invalid payload' using errcode='22023';
 end if;
 if p_actor is not null then
   select lower(email) into address from auth.users where id=p_actor and email_confirmed_at is not null;
 end if;
 admin_ok:=address is not null and exists(
   select 1 from private.admin_roles a where a.user_id=p_actor and a.state='active' and not a.must_set_password)
   and not exists(select 1 from private.member_profiles mp where mp.user_id=p_actor and mp.state='suspended');
 if p_action in ('resource_review_queue','resource_moderate') then
   if not admin_ok then raise exception 'Administrator required' using errcode='42501';end if;
   if p_action='resource_review_queue' then
     return jsonb_build_object('resources',coalesce((
       select jsonb_agg(jsonb_build_object('id',r.id,'slug',s.slug,'sourceName',s.name,'type',r.type,'title',r.title,'url',r.url,'description',r.description,'year',r.report_year,'eventDate',r.event_date,'language',r.language,'createdAt',r.created_at) order by r.created_at)
       from private.source_resources r join public.sources s on s.id=r.source_id where r.state='pending'),'[]'::jsonb));
   end if;
   resource_id:=(p_payload->>'id')::uuid;decision:=p_payload->>'decision';
   if decision not in ('approved','rejected') then raise exception 'Invalid decision' using errcode='22023';end if;
   update private.source_resources set state=decision,reviewed_by=p_actor,reviewed_at=now(),review_reason=left(coalesce(p_payload->>'reason',''),1000),updated_at=now()
   where id=resource_id and state='pending' returning * into resource;
   if not found then raise exception 'Resource not awaiting review' using errcode='P0002';end if;
   insert into private.audit_events(actor_id,action,target_id,reason) values(p_actor,'resource_'||decision,resource.source_id,'Resource '||resource.id::text);
   return jsonb_build_object('id',resource.id,'status',resource.state);
 end if;
 select * into src from public.sources where slug=p_payload->>'slug' and status='published';
 if not found then raise exception 'Source not found' using errcode='P0002';end if;
 authorised:=address is not null and not exists(select 1 from private.member_profiles where user_id=p_actor and state='suspended')
  and exists(select 1 from private.source_managers m where m.source_id=src.id and m.user_id=p_actor and m.verified_email=address and m.role in ('owner','editor'));
 if p_action='resource_list' then
   return jsonb_build_object('resources',coalesce((
     select jsonb_agg(jsonb_build_object('id',r.id,'type',r.type,'title',r.title,'description',r.description,'url',r.url,'year',r.report_year,'eventDate',r.event_date,'language',r.language,'status',r.state,'createdAt',r.created_at) order by r.type,r.report_year desc nulls last,r.event_date desc nulls last,r.created_at desc)
     from private.source_resources r where r.source_id=src.id and (r.state='approved' or authorised and r.submitted_by=p_actor)), '[]'::jsonb));
 end if;
 if not authorised then raise exception 'Verified source manager required' using errcode='42501';end if;
 if (select count(*) from private.source_resources where submitted_by=p_actor and created_at>now()-interval '1 day')>=20 then
   raise exception 'rate_limited' using errcode='P0001';end if;
 item_type:=p_payload->>'type';item_title:=trim(coalesce(p_payload->>'title',''));item_description:=trim(coalesce(p_payload->>'description',''));item_url:=trim(coalesce(p_payload->>'url',''));item_language:=nullif(trim(coalesce(p_payload->>'language','')),'');
 if item_type not in ('annual_report','research','related_source','event','newsletter','other') or char_length(item_title) not between 5 and 240 or char_length(item_description)>1200
 or char_length(item_url)>2048 or item_url !~* '^https://[a-z0-9][a-z0-9.-]+(:[0-9]{2,5})?(/[^[:space:]]*)?$'
 or item_url ~* '^https://(localhost|127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)'
 or (item_language is not null and item_language !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$') then
   raise exception 'Invalid resource details' using errcode='22023';end if;
 if nullif(p_payload->>'year','') is not null then report_year_value:=(p_payload->>'year')::integer;end if;
 if nullif(p_payload->>'eventDate','') is not null then event_date_value:=(p_payload->>'eventDate')::date;end if;
 if item_type='annual_report' and (report_year_value is null or report_year_value not between 1900 and 2100) then raise exception 'Report year required' using errcode='22023';end if;
 if item_type='event' and event_date_value is null then raise exception 'Event date required' using errcode='22023';end if;
 if exists(select 1 from private.source_resources where source_id=src.id and lower(url)=lower(item_url) and state in ('approved','pending')) then raise exception 'already_submitted' using errcode='23505';end if;
 insert into private.source_resources(source_id,type,title,description,url,report_year,event_date,language,submitted_by)
 values(src.id,item_type,item_title,item_description,item_url,report_year_value,event_date_value,item_language,p_actor) returning * into resource;
 return jsonb_build_object('id',resource.id,'status','pending');
end;$$;
revoke all on function public.directory_api(text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.directory_api(text,jsonb,uuid,uuid,text) to service_role;
