-- Older catalogue migrations pre-date the live bibliographic metadata columns.
-- Add them idempotently for fresh installations before seeding enrichment queues.
alter table public.research_records
 add column if not exists doi text,
 add column if not exists year integer,
 add column if not exists kind_std text,
 add column if not exists access_std text;

create table if not exists private.doi_enrichment_queue (
 record_id text primary key references public.research_records(id) on delete cascade,
 batch_no int not null,
 doi text not null,
 status text not null default 'queued' check(status in ('queued','processing','verified','conflict','not_found','error')),
 attempts int not null default 0,
 processed_at timestamptz,
 claimed_at timestamptz,
 metadata jsonb,
 evidence_url text,
 note text,
 updated_fields text[] not null default '{}'
);
create index if not exists doi_enrichment_queue_status_idx on private.doi_enrichment_queue(status,batch_no,record_id);
insert into private.doi_enrichment_queue(record_id,batch_no,doi)
select id, ((row_number() over(order by case when year is null or btrim(authors)='' then 0 else 1 end,id)-1)/500)::int+1, doi
from public.research_records where doi is not null and btrim(doi)<>''
on conflict(record_id) do nothing;
do $$ begin
 if not exists(select 1 from vault.secrets where name='doi_enrichment_cron_token') then
  perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'doi_enrichment_cron_token','ID EBP DOI enrichment scheduler');
 end if;
end $$;
revoke all on private.doi_enrichment_queue from anon,authenticated;