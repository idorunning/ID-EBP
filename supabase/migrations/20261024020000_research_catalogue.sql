-- Public bibliographic metadata only. No member or editorial-private data.
create table if not exists public.research_records (
 id text primary key, source text not null, source_slug text not null,
 title text not null, url text not null check (url ~ '^https?://'),
 authors text not null default '', publication text not null default '',
 kind text not null default '', summary text not null default '',
 access text not null default '', status text not null default '',
 checked text not null default '', related_terms text not null default '',
 tags text[] not null default '{}',
 search_vector tsvector generated always as (
 setweight(to_tsvector('simple',title),'A') ||
 setweight(to_tsvector('simple',related_terms),'B') ||
 setweight(to_tsvector('simple',source || ' ' || authors || ' ' || summary),'C')
 ) stored
);
alter table public.research_records enable row level security;
create policy "Public catalogue metadata is readable" on public.research_records for select to anon, authenticated using (true);
revoke all on public.research_records from anon,authenticated;
grant select on public.research_records to anon,authenticated;
create index if not exists research_search_idx on public.research_records using gin(search_vector);
create index if not exists research_tags_idx on public.research_records using gin(tags);
create index if not exists research_source_idx on public.research_records(source_slug);
create or replace function public.search_research(q text default '', selected_tags text[] default '{}', page_number integer default 1, source_filter text default '')
returns jsonb language sql stable security invoker set search_path='' as $$
 with matches as materialized (
 select r.*, case when length(trim(q))>0 then ts_rank_cd(search_vector,websearch_to_tsquery('simple',left(q,300))) else 0 end as relevance
 from public.research_records r
 where (length(trim(q))=0 or search_vector @@ websearch_to_tsquery('simple',left(q,300)) or to_tsvector('simple',array_to_string(tags,' ')) @@ websearch_to_tsquery('simple',left(q,300)))
 and not exists (select 1 from unnest(selected_tags) chosen where not exists (select 1 from unnest(r.tags) actual where lower(actual)=lower(chosen)))
 and (source_filter='' or source_slug=source_filter)
 ), results as (
 select id,source,source_slug,title,url,authors,publication,kind,summary,access,status,checked,tags
 from matches order by relevance desc,title,id limit 20 offset (greatest(1,least(coalesce(page_number,1),1000))-1)*20
 ) select jsonb_build_object('total',(select count(*) from matches),'catalogueTotal',(select count(*) from public.research_records),'page',greatest(1,least(coalesce(page_number,1),1000)),'results',coalesce((select jsonb_agg(to_jsonb(results)) from results),'[]'::jsonb));
$$;
create or replace function public.research_tags(prefix text default '')
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (
 select lower(tag) as tag,count(distinct r.id) as count from public.research_records r cross join lateral unnest(r.tags) tag
 where length(tag)<100 and (prefix='' or position(lower(left(prefix,100)) in lower(tag))>0)
 group by lower(tag) order by case when prefix='' then coalesce(array_position(array['hot spots policing','body-worn cameras','domestic abuse','procedural justice','problem-oriented policing','crime prevention','neighbourhood policing','police wellbeing','community policing','use of force'],lower(tag)),999) else 0 end,count(distinct r.id) desc,lower(tag) limit 12) t;
$$;
revoke all on function public.search_research(text,text[],integer,text) from public;
revoke all on function public.research_tags(text) from public;
grant execute on function public.search_research(text,text[],integer,text) to anon,authenticated;
grant execute on function public.research_tags(text) to anon,authenticated;
create or replace function public.research_stats() returns jsonb language sql stable security invoker set search_path='' as $$ select jsonb_build_object('total',count(*),'sources',count(distinct source_slug)) from public.research_records; $$;
revoke all on function public.research_stats() from public;
grant execute on function public.research_stats() to anon,authenticated;
