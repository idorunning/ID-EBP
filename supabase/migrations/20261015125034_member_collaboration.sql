-- Member collaboration. Generated with Supabase CLI migration new.
-- All privileged functions are SECURITY INVOKER and executable by service_role
-- only. The API verifies Supabase Auth, then SQL verifies the live user/session.
create table private.member_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null default '' check(char_length(display_name)<=120),
  state text not null default 'active' check(state in ('active','suspended')),
  created_at timestamptz not null default now()
);
create table private.admin_invitations (
  email text primary key check(email=lower(email) and char_length(email) between 3 and 254),
  state text not null default 'pending' check(state in ('pending','accepted','revoked')),
  require_password_change boolean not null default true,
  accepted_by uuid references auth.users on delete set null,
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
comment on table private.admin_invitations is 'Deliberate privileged invitations only. No administrator is inferred from registration metadata or a hardcoded address.';
create table private.source_ratings (
  user_id uuid not null references auth.users on delete cascade,
  source_id uuid not null references public.sources on delete cascade,
  stars smallint not null check(stars between 0 and 5),
  updated_at timestamptz not null default now(),
  primary key(user_id,source_id)
);
create index source_ratings_source on private.source_ratings(source_id);
create table private.source_tag_suggestions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources on delete cascade,
  submitted_by uuid references auth.users on delete set null,
  label text not null check(char_length(label) between 2 and 60 and label !~ '[<>[:cntrl:]]'),
  normalised text not null,
  state text not null default 'review' check(state in ('review','approved','rejected')),
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);
create unique index source_tag_suggestion_pending on private.source_tag_suggestions(source_id,normalised) where state='review';
create index source_tag_suggestion_user on private.source_tag_suggestions(submitted_by);
create table public.source_tags (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources on delete cascade,
  label text not null check(char_length(label) between 2 and 60 and label !~ '[<>[:cntrl:]]'),
  normalised text not null,
  unique(source_id,normalised)
);
create table private.source_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users on delete cascade,
  profile jsonb not null check(jsonb_typeof(profile)='object'),
  state text not null default 'review' check(state in ('review','approved','rejected')),
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);
create index source_submissions_user on private.source_submissions(submitted_by);
create table private.source_claim_domains (
  source_id uuid not null references public.sources on delete cascade,
  domain text not null check(domain=lower(domain) and domain ~ '^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$'),
  primary key(source_id,domain)
);
comment on table private.source_claim_domains is 'Exact approved organisation email domains. Public/free hosting does not establish source ownership.';
create table private.api_rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null check(count>0),
  primary key(key,window_start)
);
alter table public.source_signals add column rating_average numeric(4,3) check(rating_average between 0 and 5);
alter table public.source_signals add column rating_count integer not null default 0 check(rating_count>=0);
-- Keep the existing source/human/draft translation contract intact. Accepted
-- AI-assisted directory metadata has a separate, explicitly labelled collection.
create table public.source_ai_translations (
  source_id uuid not null references public.sources on delete cascade,
  locale text not null check(locale ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'),
  about text not null check(char_length(about) between 1 and 1200),
  original_about text not null check(char_length(original_about) between 1 and 600),
  origin text not null default 'ai_translation' check(origin='ai_translation'),
  accepted_at timestamptz not null default now(),
  primary key(source_id,locale)
);
comment on table public.source_ai_translations is 'Accepted AI-assisted directory descriptions, tied to the exact original description. Linked research is never translated or human certified.';
alter table public.source_ai_translations enable row level security;
revoke all on public.source_ai_translations from public,anon,authenticated,service_role;
grant select on public.source_ai_translations to anon,authenticated;
grant select,insert,update,delete on public.source_ai_translations to service_role;
create policy current_published_ai_translations on public.source_ai_translations for select to anon,authenticated using(exists(select 1 from public.sources s where s.id=source_id and s.status='published' and s.about=original_about));
-- Auth deletion cascades must immediately remove a deleted member's rating from
-- public aggregates. The Auth role cannot write directory aggregates itself.
-- This definer function is trigger-only, in private, with no EXECUTE grants.
create function private.refresh_star_signals()
returns trigger language plpgsql security definer set search_path=''
as $$
declare affected_source uuid;
begin
  affected_source:=case when tg_op='DELETE' then old.source_id else new.source_id end;
  perform 1 from public.sources s where s.id=affected_source for update;
  if found then
    insert into public.source_signals(source_id,rating_average,rating_count)
      select affected_source,avg(r.stars),count(*)::integer from private.source_ratings r where r.source_id=affected_source
      on conflict(source_id) do update set rating_average=excluded.rating_average,rating_count=excluded.rating_count,calculated_at=now();
  end if;
  if tg_op='DELETE' then return old;end if;return new;
end;
$$;
revoke all on function private.refresh_star_signals() from public,anon,authenticated,service_role;
create trigger refresh_source_ratings after insert or update or delete on private.source_ratings for each row execute function private.refresh_star_signals();
alter table public.source_tags enable row level security;
alter table private.member_profiles enable row level security;
alter table private.admin_invitations enable row level security;
alter table private.source_ratings enable row level security;
alter table private.source_tag_suggestions enable row level security;
alter table private.source_submissions enable row level security;
alter table private.source_claim_domains enable row level security;
alter table private.api_rate_limits enable row level security;
revoke all on public.source_tags from public,anon,authenticated,service_role;
grant select on public.source_tags to anon,authenticated;
grant select,insert,update,delete on public.source_tags to service_role;
create policy published_source_tags on public.source_tags for select to anon,authenticated using(exists(select 1 from public.sources s where s.id=source_id and s.status='published'));
revoke all on private.member_profiles,private.admin_invitations,private.source_ratings,private.source_tag_suggestions,private.source_submissions,private.source_claim_domains,private.api_rate_limits from public,anon,authenticated,service_role;
grant select,insert,update,delete on private.member_profiles,private.admin_invitations,private.source_ratings,private.source_tag_suggestions,private.source_submissions,private.source_claim_domains,private.api_rate_limits to service_role;

create function public.directory_api(p_action text,p_payload jsonb default '{}'::jsonb,p_actor uuid default null,p_session uuid default null,p_assurance text default 'aal1')
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  s public.sources%rowtype;
  actor_email text;
  actor_domain text;
  is_admin boolean:=false;
  is_manager boolean:=false;
  result jsonb;
  item record;
  entity_id uuid;
  target_source_id uuid;
  profile jsonb;
  label text;
  normalised_label text;
  decision text;
  review_reason text;
  allowed boolean;
  domain_matched boolean;
  rate_window timestamptz;
  attempts integer;
  seconds integer;
  limit_count integer;
  avg_stars numeric;
  star_count integer;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or pg_catalog.octet_length(p_payload::text)>16384 then raise exception 'Invalid payload' using errcode='22023';end if;
  if p_action='rate_limit' then
    seconds:=(p_payload->>'seconds')::integer;limit_count:=(p_payload->>'limit')::integer;
    if seconds not between 1 and 86400 or limit_count not between 1 and 1000 or char_length(p_payload->>'key') not between 10 and 200 then raise exception 'Invalid rate limit' using errcode='22023';end if;
    rate_window:=pg_catalog.to_timestamp(pg_catalog.floor(extract(epoch from now())/seconds)*seconds);
    insert into private.api_rate_limits as rl(key,window_start,count) values(p_payload->>'key',rate_window,1)
      on conflict(key,window_start) do update set count=rl.count+1 returning count into attempts;
    if attempts>limit_count then raise exception 'rate_limited';end if;
    delete from private.api_rate_limits where window_start<now()-interval '2 days';
    return jsonb_build_object('allowed',true);
  end if;
  if p_actor is not null then
    select lower(u.email) into actor_email from auth.users u
      join auth.sessions sess on sess.user_id=u.id and sess.id=p_session
      where u.id=p_actor and u.email_confirmed_at is not null and coalesce(u.is_anonymous,false)=false
      and (sess.not_after is null or sess.not_after>now());
    if actor_email is null then raise exception 'Confirmed active account required' using errcode='42501';end if;
    if exists(select 1 from private.member_profiles mp where mp.user_id=p_actor and mp.state='suspended') then raise exception 'Account suspended' using errcode='42501';end if;
    select exists(select 1 from private.admin_roles a where a.user_id=p_actor and a.state='active' ) into is_admin;
  end if;
  if p_action='community' then
    return jsonb_build_object('authoritative',true,'sources',coalesce((select jsonb_object_agg(src.slug,jsonb_build_object(
      'ratingAverage',sig.rating_average,'ratingCount',coalesce(sig.rating_count,0),'domainConfirmed',coalesce(sig.domain_confirmed,false),
      'organisationConfirmed',coalesce(sig.organisation_confirmed,false),'tags',coalesce((select jsonb_agg(t.label order by t.label) from public.source_tags t where t.source_id=src.id),'[]'::jsonb),
      'profile',jsonb_build_object('id',src.id,'slug',src.slug,'name',src.name,'about',src.about,'publisher',src.publisher,'topics',src.topics,'methods',src.methods,'contentTypes',src.content_types,
        'url',src.website_url,'country',src.country_code,'coverage',src.coverage,'types',src.kinds,'languages',src.research_languages,'access',src.access_type,'checked',src.checked_at,'logoPath',src.logo_path,
        'translations',coalesce((select jsonb_object_agg(ai.locale,jsonb_build_object('about',ai.about,'origin',ai.origin,'acceptedAt',ai.accepted_at)) from public.source_ai_translations ai where ai.source_id=src.id and ai.original_about=src.about),'{}'::jsonb)
          ||coalesce((select jsonb_object_agg(tr.locale,jsonb_build_object('about',tr.about,'origin',tr.origin,'reviewedAt',tr.reviewed_at)) from public.source_translations tr where tr.source_id=src.id and tr.origin<>'machine_draft' and tr.reviewed_at is not null),'{}'::jsonb))
    )) from public.sources src left join public.source_signals sig on sig.source_id=src.id where src.status='published'),'{}'::jsonb));
  end if;
  if p_action='session' then
    if p_actor is null then raise exception 'Sign in required' using errcode='42501';end if;
    -- A privileged invitation must exist before registration. Confirmation of
    -- that invited mailbox activates the role; administration still needs MFA.
    select * into item from private.admin_invitations ai where ai.email=actor_email and ai.state='pending' for update;
    if found then
      insert into private.admin_roles(user_id,state,must_set_password,invited_by) values(p_actor,'active',item.require_password_change,item.invited_by) on conflict(user_id) do nothing;
      update private.admin_invitations set state='accepted',accepted_by=p_actor,accepted_at=now() where email=actor_email;
      insert into private.audit_events(actor_id,action,reason) values(p_actor,'accept_admin_invitation','Confirmed account accepted a deliberate administrator invitation');
      select exists(select 1 from private.admin_roles a where a.user_id=p_actor and a.state='active' ) into is_admin;
    end if;
    insert into private.member_profiles(user_id) values(p_actor) on conflict do nothing;
    return jsonb_build_object('admin',is_admin,'passwordChangeRequired',exists(select 1 from private.admin_roles a where a.user_id=p_actor and a.must_set_password),'mfaRequired',is_admin and p_assurance<>'aal2',
      'managedSources',coalesce((select jsonb_agg(jsonb_build_object('id',src.id,'slug',src.slug,'name',src.name,'role',m.role)) from private.source_managers m join public.sources src on src.id=m.source_id where m.user_id=p_actor and m.verified_email=actor_email),'[]'::jsonb),
      'claims',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'slug',src.slug,'name',src.name,'state',c.state)) from private.source_claims c join public.sources src on src.id=c.source_id where c.requested_by=p_actor),'[]'::jsonb),
      'tagSuggestions',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'state',t.state,'slug',src.slug)) from private.source_tag_suggestions t join public.sources src on src.id=t.source_id where t.submitted_by=p_actor),'[]'::jsonb),
      'submissions',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'name',ss.profile->>'name','state',ss.state)) from private.source_submissions ss where ss.submitted_by=p_actor),'[]'::jsonb));
  end if;
  if p_action in ('admin_review','moderate') then
    if not is_admin then raise exception 'Admin permission required' using errcode='42501';end if;
    if exists(select 1 from private.admin_roles a where a.user_id=p_actor and a.must_set_password) then raise exception 'password_change_required' using errcode='42501';end if;
    if p_assurance<>'aal2' then raise exception 'mfa_required' using errcode='42501';end if;
  end if;
  if p_action='admin_review' then
    return jsonb_build_object(
      'tags',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'sourceName',src.name,'slug',src.slug,'createdAt',t.created_at)) from private.source_tag_suggestions t join public.sources src on src.id=t.source_id where t.state='review'),'[]'::jsonb),
      'claims',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'sourceName',src.name,'slug',src.slug,'email',u.email,'evidence',c.evidence,'createdAt',c.created_at)) from private.source_claims c join public.sources src on src.id=c.source_id join auth.users u on u.id=c.requested_by where c.state in ('pending','review')),'[]'::jsonb),
      'revisions',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'sourceName',src.name,'slug',src.slug,'profile',r.proposed_profile,'createdAt',r.created_at)) from private.source_revisions r join public.sources src on src.id=r.source_id where r.state='review'),'[]'::jsonb),
      'submissions',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'profile',ss.profile,'createdAt',ss.created_at)) from private.source_submissions ss where ss.state='review'),'[]'::jsonb));
  end if;
  if p_action='moderate' then
    decision:=p_payload->>'decision';review_reason:=trim(coalesce(p_payload->>'reason',''));
    if decision is null or decision not in ('approve','reject') or char_length(review_reason) not between 3 and 1000 then raise exception 'Give a review reason' using errcode='22023';end if;
    if p_payload->>'kind'='tag' then
      select * into item from private.source_tag_suggestions t where t.id=(p_payload->>'id')::uuid and t.state='review' for update;
      if not found then raise exception 'Review item not found' using errcode='P0002';end if;
      target_source_id:=item.source_id;
      update private.source_tag_suggestions set state=case when decision='approve' then 'approved' else 'rejected' end,decided_by=p_actor,decided_at=now(),reason=review_reason where id=item.id;
      if decision='approve' then insert into public.source_tags(source_id,label,normalised) values(item.source_id,item.label,item.normalised) on conflict(source_id,normalised) do nothing;end if;
    elsif p_payload->>'kind'='claim' then
      select * into item from private.source_claims c where c.id=(p_payload->>'id')::uuid and c.state in ('pending','review') for update;
      if not found then raise exception 'Review item not found' using errcode='P0002';end if;
      target_source_id:=item.source_id;
      perform 1 from public.sources where id=target_source_id for update;
      if item.requested_by=p_actor then raise exception 'Independent reviewer required' using errcode='42501';end if;
      if decision='approve' and (exists(select 1 from private.source_managers m where m.source_id=item.source_id and m.role='owner') or not exists(select 1 from auth.users u where u.id=item.requested_by and u.email_confirmed_at is not null and lower(u.email)=item.evidence->>'verifiedEmail')) then raise exception 'Ownership conflict or email changed' using errcode='42501';end if;
      if decision='approve' and (p_payload->>'independentCheck' is distinct from 'true' or char_length(coalesce(p_payload->>'verificationUrl',''))<10) then raise exception 'Record an independent verification reference' using errcode='22023';end if;
      update private.source_claims set state=case when decision='approve' then 'accepted' else 'rejected' end,decided_by=p_actor,decided_at=now(),evidence=evidence||jsonb_build_object('moderationReason',review_reason,'verificationUrl',p_payload->>'verificationUrl') where id=item.id;
      if decision='approve' then
        insert into private.source_managers(source_id,user_id,role,verified_email) values(item.source_id,item.requested_by,'owner',item.evidence->>'verifiedEmail') on conflict do nothing;
        delete from private.source_ratings r where r.source_id=item.source_id and r.user_id=item.requested_by;
        insert into public.source_signals(source_id,organisation_confirmed,domain_confirmed) values(item.source_id,true,coalesce((item.evidence->>'domainMatched')::boolean,false)) on conflict(source_id) do update set organisation_confirmed=true,domain_confirmed=source_signals.domain_confirmed or excluded.domain_confirmed,calculated_at=now();
        insert into private.source_verifications(source_id,requested_by,kind,state,evidence,decided_by,decided_at) values(item.source_id,item.requested_by,'organisation','confirmed',item.evidence||jsonb_build_object('moderationReason',review_reason,'verificationUrl',p_payload->>'verificationUrl'),p_actor,now());
      end if;
    elsif p_payload->>'kind'='revision' then
      select * into item from private.source_revisions r where r.id=(p_payload->>'id')::bigint and r.state='review' for update;
      if not found then raise exception 'Review item not found' using errcode='P0002';end if;
      target_source_id:=item.source_id;profile:=item.proposed_profile;
      update private.source_revisions set state=case when decision='approve' then 'applied' else 'rejected' end where id=item.id;
      if decision='approve' then
        if jsonb_typeof(profile->'topics')<>'array' or jsonb_typeof(profile->'methods')<>'array' or jsonb_typeof(profile->'contentTypes')<>'array'
          or exists(select 1 from jsonb_array_elements((profile->'topics')||(profile->'methods')||(profile->'contentTypes')) v where jsonb_typeof(v)<>'string' or char_length(v#>>'{}') not between 1 and 100 or (v#>>'{}') ~ '[<>[:cntrl:]]')
          then raise exception 'Invalid revision categories' using errcode='22023';end if;
        update public.sources set name=profile->>'name',about=profile->>'about',publisher=profile->>'publisher',
          topics=array(select jsonb_array_elements_text(profile->'topics')),methods=array(select jsonb_array_elements_text(profile->'methods')),content_types=array(select jsonb_array_elements_text(profile->'contentTypes')) where id=item.source_id;
        -- A changed description makes previous translations stale; do not present
        -- translations of the former text as translations of the revision.
        update public.source_translations set reviewed_at=null where source_translations.source_id=item.source_id;
      end if;
    elsif p_payload->>'kind'='submission' then
      select * into item from private.source_submissions ss where ss.id=(p_payload->>'id')::uuid and ss.state='review' for update;
      if not found then raise exception 'Review item not found' using errcode='P0002';end if;
      profile:=item.profile;
      update private.source_submissions set state=case when decision='approve' then 'approved' else 'rejected' end,decided_by=p_actor,decided_at=now(),reason=review_reason where id=item.id;
      if decision='approve' then
        if jsonb_typeof(profile->'languages')<>'array' or jsonb_typeof(profile->'types')<>'array' or jsonb_typeof(profile->'contentTypes')<>'array' or jsonb_typeof(profile->'topics')<>'array'
          or exists(select 1 from jsonb_array_elements(profile->'languages') v where jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$')
          or exists(select 1 from jsonb_array_elements((profile->'types')||(profile->'contentTypes')||(profile->'topics')) v where jsonb_typeof(v)<>'string' or char_length(v#>>'{}') not between 1 and 100 or (v#>>'{}') ~ '[<>[:cntrl:]]')
          then raise exception 'Invalid submitted categories' using errcode='22023';end if;
        insert into public.sources(slug,name,website_url,canonical_domain,publisher,about,country_code,kinds,content_types,topics,research_languages,access_type,provenance,status,published_at)
          values('member-'||replace(item.id::text,'-',''),profile->>'name',profile->>'url',profile->>'domain',profile->>'publisher',profile->>'about',profile->>'country',array(select jsonb_array_elements_text(profile->'types')),array(select jsonb_array_elements_text(profile->'contentTypes')),array(select jsonb_array_elements_text(profile->'topics')),array(select jsonb_array_elements_text(profile->'languages')),'mixed','source_declared','published',now()) returning id into target_source_id;
        insert into public.source_signals(source_id) values(target_source_id);
        -- Submitting a listing is not proof of ownership. Claim it separately.
      end if;
    else raise exception 'Unknown review type' using errcode='22023';end if;
    insert into private.audit_events(actor_id,action,target_id,reason,metadata) values(p_actor,'moderate_'||(p_payload->>'kind'),target_source_id,review_reason,jsonb_build_object('decision',decision,'itemId',p_payload->>'id'));
    return jsonb_build_object('reviewed',true,'decision',decision);
  end if;
  if p_action='submit_source' then
    if p_actor is null then raise exception 'Sign in required' using errcode='42501';end if;
    if (select count(*) from private.source_submissions ss where ss.submitted_by=p_actor and ss.created_at>now()-interval '1 day')>=5 then raise exception 'rate_limited';end if;
    profile:=p_payload;
    if char_length(trim(coalesce(profile->>'name',''))) not between 2 and 160 or char_length(trim(coalesce(profile->>'about',''))) not between 20 and 600
      or coalesce(profile->>'url','') !~ '^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(/[^[:space:]@]*)?$' or char_length(profile->>'url')>2048
      or coalesce(profile->>'country','') !~ '^[A-Z]{2}$' or coalesce(jsonb_typeof(profile->'languages'),'null')<>'array' or jsonb_array_length(profile->'languages') not between 1 and 30
      or coalesce(jsonb_typeof(profile->'types'),'null')<>'array' or jsonb_array_length(profile->'types') not between 1 and 10
      then raise exception 'Invalid source details' using errcode='22023';end if;
    if exists(select 1 from jsonb_array_elements(profile->'languages') l where jsonb_typeof(l)<>'string' or char_length(l#>>'{}')>40 or (l#>>'{}') !~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$') then raise exception 'Invalid language code' using errcode='22023';end if;
    profile:=profile||jsonb_build_object('domain',lower(regexp_replace(split_part(profile->>'url','/',3),'^www\.','')),'contentTypes',coalesce(profile->'contentTypes','["Original research"]'::jsonb),'topics',coalesce(profile->'topics','[]'::jsonb));
    if coalesce(jsonb_typeof(profile->'contentTypes'),'null')<>'array' or jsonb_array_length(profile->'contentTypes') not between 1 and 30
      or coalesce(jsonb_typeof(profile->'topics'),'null')<>'array' or jsonb_array_length(profile->'topics')>30
      or exists(select 1 from jsonb_array_elements((profile->'types')||(profile->'contentTypes')||(profile->'topics')) v where jsonb_typeof(v)<>'string' or char_length(v#>>'{}') not between 1 and 100 or (v#>>'{}') ~ '[<>[:cntrl:]]')
      then raise exception 'Invalid source categories' using errcode='22023';end if;
    insert into private.source_submissions(submitted_by,profile) values(p_actor,profile) returning id into entity_id;
    insert into private.audit_events(actor_id,action,reason,metadata) values(p_actor,'submit_source','Member submitted a source for review',jsonb_build_object('submissionId',entity_id));
    return jsonb_build_object('submission',jsonb_build_object('id',entity_id,'state','review'),'message','Your source has been submitted for review.');
  end if;
  select * into s from public.sources src where src.slug=p_payload->>'slug' for update;
  if not found then raise exception 'Source not found' using errcode='P0002';end if;
  is_manager:=p_actor is not null and exists(select 1 from private.source_managers m where m.source_id=s.id and m.user_id=p_actor and m.verified_email=actor_email);
  if s.status<>'published' and not is_manager and not is_admin then raise exception 'Source not found' using errcode='P0002';end if;
  if p_action='profile' then
    return jsonb_build_object('managed',is_manager,'profile',jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'about',s.about,'publisher',s.publisher,'topics',s.topics,'methods',s.methods,'contentTypes',s.content_types,'url',s.website_url,'country',s.country_code,'languages',s.research_languages,'types',s.kinds));
  end if;
  if p_action='source_community' then
    select jsonb_build_object('average',ss.rating_average,'count',ss.rating_count,'own',(select r.stars from private.source_ratings r where r.source_id=s.id and r.user_id=p_actor)) into result from public.source_signals ss where ss.source_id=s.id;
    return jsonb_build_object('rating',coalesce(result,jsonb_build_object('average',null,'count',0,'own',null)),
      'tags',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'label',t.label) order by t.label) from public.source_tags t where t.source_id=s.id),'[]'::jsonb),
      'verification',coalesce((select jsonb_build_object('domainConfirmed',ss.domain_confirmed,'organisationConfirmed',ss.organisation_confirmed) from public.source_signals ss where ss.source_id=s.id),'{"domainConfirmed":false,"organisationConfirmed":false}'::jsonb),'managed',is_manager);
  end if;
  if p_actor is null then raise exception 'Sign in required' using errcode='42501';end if;
  if p_action in ('rate_source','remove_rating') then
    if is_manager then raise exception 'Source managers cannot rate their own source' using errcode='42501';end if;
    if p_action='remove_rating' then delete from private.source_ratings r where r.user_id=p_actor and r.source_id=s.id;
    else
      if (p_payload->>'stars')::numeric not between 0 and 5 or (p_payload->>'stars')::numeric<>trunc((p_payload->>'stars')::numeric) then raise exception 'Invalid stars' using errcode='22023';end if;
      insert into private.source_ratings(user_id,source_id,stars) values(p_actor,s.id,(p_payload->>'stars')::smallint) on conflict(user_id,source_id) do update set stars=excluded.stars,updated_at=now();
    end if;
    select avg(r.stars),count(*)::integer into avg_stars,star_count from private.source_ratings r where r.source_id=s.id;
    insert into public.source_signals(source_id,rating_average,rating_count) values(s.id,avg_stars,star_count) on conflict(source_id) do update set rating_average=excluded.rating_average,rating_count=excluded.rating_count,calculated_at=now();
    insert into private.audit_events(actor_id,action,target_id,reason) values(p_actor,p_action,s.id,'Member updated their own source rating');
    return jsonb_build_object('rating',jsonb_build_object('average',avg_stars,'count',star_count,'own',(select r.stars from private.source_ratings r where r.source_id=s.id and r.user_id=p_actor)));
  end if;
  if p_action='suggest_tag' then
    label:=regexp_replace(trim(coalesce(p_payload->>'label','')),'\s+',' ','g');normalised_label:=lower(label);
    if char_length(label) not between 2 and 60 or label ~ '[<>[:cntrl:]]' or label ~* '(https?://|www\.|@)' then raise exception 'Invalid tag' using errcode='22023';end if;
    if (select count(*) from private.source_tag_suggestions t where t.submitted_by=p_actor and t.created_at>now()-interval '1 day')>=12 then raise exception 'rate_limited';end if;
    if exists(select 1 from public.source_tags t where t.source_id=s.id and t.normalised=normalised_label) then raise exception 'Already tagged' using errcode='23505';end if;
    insert into private.source_tag_suggestions(source_id,submitted_by,label,normalised) values(s.id,p_actor,label,normalised_label) returning id into entity_id;
    insert into private.audit_events(actor_id,action,target_id,reason,metadata) values(p_actor,'suggest_tag',s.id,'Member submitted a searchable tag for review',jsonb_build_object('suggestionId',entity_id));
    return jsonb_build_object('suggestion',jsonb_build_object('id',entity_id,'state','review','label',label),'message','Your tag is awaiting review.');
  end if;
  if p_action='claim_source' then
    if is_manager then return jsonb_build_object('claim',jsonb_build_object('state','accepted'),'message','You already manage this source.');end if;
    actor_domain:=split_part(actor_email,'@',2);
    -- Exact organisation domains only; no suffix tricks or free email/hosting.
    domain_matched:=(actor_domain=s.canonical_domain or exists(select 1 from private.source_claim_domains d where d.source_id=s.id and d.domain=actor_domain))
      and actor_domain !~ '(^|\.)(gmail\.com|googlemail\.com|outlook\.com|hotmail\.[a-z.]+|live\.[a-z.]+|yahoo\.[a-z.]+|icloud\.com|proton\.me|protonmail\.com|aol\.com|medium\.com|substack\.com|wordpress\.com|blogspot\.com|github\.io|wixsite\.com)$'
      and actor_domain not in ('ac.uk','gov.uk','co.uk','org.uk','edu.au','ac.nz','ac.jp','edu','com','org');
    -- A second representative requires review; never displace an existing owner.
    -- Domain affiliation alone does not establish authority over a university or
    -- police force. Only an exact privately preapproved mailbox can auto-manage.
    -- Mailbox or domain matches are evidence only. An independent admin always decides.
    allowed:=false;
    if char_length(trim(coalesce(p_payload->>'evidence',''))) not between 30 and 2000
      or coalesce(p_payload->>'evidenceUrl','') !~ '^https://[^[:space:]@]+$'
      then raise exception 'Provide public evidence of authority' using errcode='22023';end if;
    insert into private.source_claims(source_id,requested_by,state,evidence,decided_at) values(s.id,p_actor,case when allowed then 'accepted' else 'review' end,jsonb_build_object('verifiedEmail',actor_email,'emailDomain',actor_domain,'emailConfirmed',true,'domainMatched',domain_matched,'approvedMailboxMatched',exists(select 1 from private.source_contacts c where c.source_id=s.id and lower(c.contact_email)=actor_email),'statement',p_payload->>'evidence','publicEvidenceUrl',p_payload->>'evidenceUrl'),case when allowed then now() else null end) returning id into entity_id;
    if allowed then
      insert into private.source_managers(source_id,user_id,role,verified_email) values(s.id,p_actor,'owner',actor_email);
      insert into private.source_verifications(source_id,requested_by,kind,state,evidence,decided_at) values(s.id,p_actor,'organisation','confirmed',jsonb_build_object('approvedMailboxMatched',true,'emailDomain',actor_domain),now());
      insert into public.source_signals(source_id,domain_confirmed,organisation_confirmed) values(s.id,domain_matched,true) on conflict(source_id) do update set domain_confirmed=source_signals.domain_confirmed or excluded.domain_confirmed,organisation_confirmed=true,calculated_at=now();
      -- Owners cannot keep a former independent rating for their own source.
      delete from private.source_ratings r where r.source_id=s.id and r.user_id=p_actor;
      select avg(r.stars),count(*)::integer into avg_stars,star_count from private.source_ratings r where r.source_id=s.id;
      update public.source_signals set rating_average=avg_stars,rating_count=star_count where source_signals.source_id=s.id;
    end if;
    insert into private.audit_events(actor_id,action,target_id,reason,metadata) values(p_actor,'claim_source',s.id,case when allowed then 'Confirmed email matched the privately approved source contact' else 'Ownership claim needs independent review' end,jsonb_build_object('claimId',entity_id));
    return jsonb_build_object('claim',jsonb_build_object('id',entity_id,'state',case when allowed then 'accepted' else 'review' end),'message',case when allowed then 'Your approved contact email is verified. You can now manage this source.' else 'Your claim has been sent for ownership review.' end);
  end if;
  if p_action='edit_profile' then
    if not is_manager then raise exception 'Source manager required' using errcode='42501';end if;
    if coalesce(jsonb_typeof(p_payload->'profile'),'null')<>'object' then raise exception 'Invalid profile object' using errcode='22023';end if;
    profile:=jsonb_build_object('name',s.name,'about',s.about,'publisher',s.publisher,'topics',s.topics,'methods',s.methods,'contentTypes',s.content_types)||(p_payload->'profile');
    if char_length(trim(coalesce(profile->>'name',''))) not between 2 and 160 or char_length(trim(coalesce(profile->>'about',''))) not between 20 and 600 or char_length(coalesce(profile->>'publisher',''))>160
      or jsonb_typeof(profile->'topics')<>'array' or jsonb_array_length(profile->'topics')>30
      or jsonb_typeof(profile->'methods')<>'array' or jsonb_array_length(profile->'methods')>30
      or jsonb_typeof(profile->'contentTypes')<>'array' or jsonb_array_length(profile->'contentTypes') not between 1 and 30
      or exists(select 1 from jsonb_array_elements((profile->'topics')||(profile->'methods')||(profile->'contentTypes')) v where jsonb_typeof(v)<>'string' or char_length(v#>>'{}') not between 1 and 100 or (v#>>'{}') ~ '[<>[:cntrl:]]')
      or exists(select 1 from jsonb_object_keys(p_payload->'profile') k where k not in ('name','about','publisher','topics','methods','contentTypes'))
      then raise exception 'Invalid profile details' using errcode='22023';end if;
    if (select count(*) from private.source_revisions r where r.source_id=s.id and r.submitted_by=p_actor and r.state='review')>=5 then raise exception 'rate_limited';end if;
    insert into private.source_revisions(source_id,submitted_by,proposed_profile,state) values(s.id,p_actor,profile,'review');
    insert into private.audit_events(actor_id,action,target_id,reason) values(p_actor,'edit_profile',s.id,'Source representative submitted revised public details');
    return jsonb_build_object('state','review','message','Your changes are saved for review. Published details stay available while they are checked.');
  end if;
  raise exception 'Unknown action' using errcode='22023';
end;
$$;
revoke all on function public.directory_api(text,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.directory_api(text,jsonb,uuid,uuid,text) to service_role;
-- SECURITY INVOKER needs these explicit Auth reads; never grant them to clients.
grant usage on schema auth to service_role;
grant select(id,email,email_confirmed_at,is_anonymous) on auth.users to service_role;
grant select(id,user_id,not_after) on auth.sessions to service_role;
