-- Research submissions are editorial-private until explicitly approved.
create table if not exists public.research_submissions (
 id uuid primary key default gen_random_uuid(),
 submitter uuid not null references auth.users(id) on delete restrict,
 title text not null check (char_length(title) between 5 and 300),
 authors text not null check (char_length(authors) between 2 and 1000),
 publication_year integer check (publication_year between 1600 and 2100),
 doi text check (doi is null or char_length(doi) between 6 and 250),
 url text not null check (url ~ '^https://' and char_length(url)<=2048),
 source_name text not null default '' check (char_length(source_name)<=200),
 summary text not null default '' check (char_length(summary)<=3000),
 tags text[] not null default '{}' check (cardinality(tags)<=10),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 moderator uuid references auth.users(id),
 moderated_at timestamptz,
 created_at timestamptz not null default now(),
 published_record_id text
);
create unique index if not exists research_submissions_doi_pending_unique on public.research_submissions (lower(doi)) where doi is not null and status='pending';
create unique index if not exists research_submissions_url_pending_unique on public.research_submissions (lower(url)) where status='pending';
create index if not exists research_submissions_queue_idx on public.research_submissions (status,created_at);
alter table public.research_submissions enable row level security;
revoke all on public.research_submissions from public, anon, authenticated;
grant select,insert,update on public.research_submissions to service_role;

-- Service-only transaction for publication. Frontend users cannot call this.
create or replace function public.moderate_research_submission(p_id uuid,p_moderator uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.research_submissions%rowtype; record_id text; clean_doi text;
begin
 if p_decision not in ('approved','rejected') then raise exception 'Invalid decision' using errcode='22023'; end if;
 select * into item from public.research_submissions where id=p_id for update;
 if not found then raise exception 'Submission not found' using errcode='P0002'; end if;
 if item.status<>'pending' then raise exception 'Submission already reviewed' using errcode='23505'; end if;
 if p_decision='approved' then
   clean_doi := nullif(lower(trim(item.doi)),'');
   record_id:='community-'||item.id::text;
   if exists(select 1 from public.research_records where lower(url)=lower(item.url) or (clean_doi is not null and (lower(url) like '%'||clean_doi||'%' or lower(id)=clean_doi)))
   then raise exception 'Research already catalogued' using errcode='23505'; end if;
   insert into public.research_records(id,source,source_slug,title,url,authors,publication,kind,summary,access,status,checked,tags)
   values(record_id,coalesce(nullif(item.source_name,''),'Independent research'),'community-submissions',item.title,item.url,item.authors,
          coalesce(item.publication_year::text,''),'Research submission',item.summary,'External link','Published',current_date::text,item.tags);
 end if;
 update public.research_submissions
 set status=p_decision,moderator=p_moderator,moderated_at=now(),published_record_id=record_id
 where id=p_id;
 return jsonb_build_object('id',p_id,'status',p_decision,'recordId',record_id);
end $$;
revoke all on function public.moderate_research_submission(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.moderate_research_submission(uuid,uuid,text) to service_role;
