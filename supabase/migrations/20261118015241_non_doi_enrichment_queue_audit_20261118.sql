create table if not exists private.non_doi_enrichment_queue (
 record_id text primary key references public.research_records(id) on delete cascade,
 batch_no integer not null check(batch_no>=1),
 status text not null default 'queued' check(status in ('queued','processing','verified','partial','ambiguous','not_found','not_applicable','error')),
 attempts integer not null default 0,
 claimed_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 processed_at timestamptz,
 evidence_url text,
 metadata jsonb,
 note text,
 updated_fields text[] not null default '{}'
);
create index if not exists non_doi_enrichment_next_idx on private.non_doi_enrichment_queue(status,next_attempt_at,batch_no,record_id);
create index if not exists non_doi_enrichment_batch_idx on private.non_doi_enrichment_queue(batch_no,status);
insert into private.non_doi_enrichment_queue(record_id,batch_no,status,note)
select id, ((row_number() over(order by
 case when kind_std in ('not-research','publication-resource-page','information-webpage','nonpaper-resource') then 2
 when year is null or btrim(authors)='' then 0 else 1 end,id)-1)/500)::integer+1,
 case when kind_std in ('not-research','publication-resource-page','information-webpage','nonpaper-resource') then 'not_applicable' else 'queued' end,
 case when kind_std in ('not-research','publication-resource-page','information-webpage','nonpaper-resource') then
 'Collection or resource page: DOI academic lookup not applicable; no publication year/author invented'
 else null end
from public.research_records where doi is null or btrim(doi)=''
on conflict(record_id) do nothing;
create table if not exists private.enrichment_run_log(
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 workflow text not null,
 batch_no int,
 attempted int not null default 0,
 verified int not null default 0,
 partial int not null default 0,
 conflicts int not null default 0,
 errors int not null default 0,
 notes text
);
revoke all on private.non_doi_enrichment_queue from anon,authenticated;
revoke all on private.enrichment_run_log from anon,authenticated;