alter table private.non_doi_enrichment_queue
 add column if not exists publisher_status text not null default 'pending',
 add column if not exists publisher_attempted_at timestamptz,
 add column if not exists publisher_metadata jsonb,
 add column if not exists publisher_evidence_url text,
 add column if not exists publisher_note text,
 add column if not exists publisher_updated_fields text[] not null default '{}';
alter table private.non_doi_enrichment_queue add constraint non_doi_publisher_status_check
 check(publisher_status in ('pending','processing','verified','no_metadata','blocked','broken_link','pdf_manual','mismatch','error')) not valid;
alter table private.non_doi_enrichment_queue validate constraint non_doi_publisher_status_check;
create index if not exists non_doi_publisher_idx on private.non_doi_enrichment_queue(publisher_status,status,record_id);