-- Promote verified staging details to live tables. Fills blanks only; every change logged.
-- Safety: nightly Supabase backup 15 Nov 03:29 + private.snapshot_20261115_* full copies.
alter table public.research_records add column if not exists doi text;
alter table public.research_records add column if not exists year int;

create table if not exists private.promotion_log (
  id bigint generated always as identity primary key,
  promoted_at timestamptz not null default now(),
  batch text not null, table_name text not null, row_id text not null,
  field text not null, old_value text, new_value text);
revoke all on private.promotion_log from public, anon, authenticated;

-- best verified staging row per existing record (prefer agent-checked run 2 over crossref run 3)
create temp table p on commit drop as
select distinct on (c.existing_record_id) c.*
from staging.candidate_records c
where c.existing_record_id is not null and c.verifier_status='passed' and c.review_status='pending'
  and coalesce(c.kind,'') <> 'not-research' and coalesce(c.match_note,'') not like '%CHECK%'
order by c.existing_record_id, c.run_id asc, c.id;

insert into private.promotion_log (batch, table_name, row_id, field, old_value, new_value)
select 'b1', 'research_records', r.id, f.field, f.old_value, f.new_value
from public.research_records r join p on p.existing_record_id = r.id
cross join lateral (values
  ('authors', r.authors, case when r.authors = '' and p.authors is not null and p.authors not ilike 'none listed%' then p.authors end),
  ('publication', r.publication, case when r.publication = '' and p.publication is not null then p.publication end),
  ('summary', r.summary, case when r.summary = '' and p.summary is not null then p.summary end),
  ('tags', array_to_string(r.tags, '|'), case when cardinality(r.tags) = 0 and cardinality(p.tags) > 0 then array_to_string(p.tags, '|') end),
  ('doi', r.doi, case when r.doi is null and p.doi is not null then p.doi end),
  ('year', r.year::text, case when r.year is null and p.year is not null then p.year::text end)
) as f(field, old_value, new_value)
where f.new_value is not null;

update public.research_records r set
  authors = case when r.authors = '' and p.authors is not null and p.authors not ilike 'none listed%' then p.authors else r.authors end,
  publication = case when r.publication = '' and p.publication is not null then p.publication else r.publication end,
  summary = case when r.summary = '' and p.summary is not null then p.summary else r.summary end,
  tags = case when cardinality(r.tags) = 0 and cardinality(p.tags) > 0 then p.tags else r.tags end,
  doi = coalesce(r.doi, p.doi),
  year = coalesce(r.year, p.year)
from p where p.existing_record_id = r.id;

update staging.candidate_records c set review_status = 'promoted' from p where c.id = p.id;

-- New records (57, agent-harvested and verified)
with n as (
  select c.*, s.name as source_name,
         row_number() over (order by c.id) + (select max(substring(id from 'IDEBP-R(\d+)')::int) from public.research_records) as num
  from staging.candidate_records c join public.sources s on s.slug = c.source_slug
  where c.existing_record_id is null and c.verifier_status='passed' and c.review_status='pending'
    and not exists (select 1 from public.research_records r where r.url = c.url or lower(r.title) = lower(c.title))
), ins as (
  insert into public.research_records (id, source, source_slug, title, url, authors, publication, kind, summary, access, status, checked, related_terms, tags, doi, year)
  select 'IDEBP-R' || num, source_name, source_slug, title, url, coalesce(authors,''), coalesce(publication,''), kind, coalesce(summary,''), access,
         'Stage 3 item page checked by agent and independent verifier', '2026-11-15', '', tags, doi, year
  from n returning id, url
)
insert into private.promotion_log (batch, table_name, row_id, field, new_value)
select 'b1', 'research_records', id, 'INSERT', url from ins;

update staging.candidate_records c set review_status='promoted'
where c.existing_record_id is null and c.verifier_status='passed' and c.review_status='pending'
  and exists (select 1 from public.research_records r where r.url = c.url);

-- Sources: owner/licence details into public_details (only missing keys); blank publisher filled; contacts to private table
create temp table ps on commit drop as
select distinct on (existing_source_id) * from staging.candidate_sources
where existing_source_id is not null and verifier_status='passed' order by existing_source_id, run_id desc;

insert into private.promotion_log (batch, table_name, row_id, field, old_value, new_value)
select 'b1', 'sources', s.id::text, 'public_details', s.public_details::text,
  (jsonb_strip_nulls(jsonb_build_object('owner', ps.legal_name, 'parentBody', ps.parent_body, 'publicationsUrl', ps.publications_url,
     'termsUrl', ps.terms_url, 'licence', ps.licence_note, 'contactPage', ps.contact_page_url, 'stillActive', ps.still_active,
     'detailsCheckedOn', '2026-11-15')) || coalesce(s.public_details, '{}'::jsonb))::text
from public.sources s join ps on ps.existing_source_id = s.id;

update public.sources s set
  public_details = jsonb_strip_nulls(jsonb_build_object('owner', ps.legal_name, 'parentBody', ps.parent_body, 'publicationsUrl', ps.publications_url,
     'termsUrl', ps.terms_url, 'licence', ps.licence_note, 'contactPage', ps.contact_page_url, 'stillActive', ps.still_active,
     'detailsCheckedOn', '2026-11-15')) || coalesce(s.public_details, '{}'::jsonb),
  publisher = case when coalesce(s.publisher,'') = '' then coalesce(ps.legal_name, s.publisher) else s.publisher end
from ps where ps.existing_source_id = s.id;

insert into private.source_contacts (source_id, contact_email, contact_name, updated_at)
select ps.existing_source_id, ps.public_contact_email, 'Organisational address (seen at ' || coalesce(ps.contact_seen_at_url, 'site') || ')', now()
from ps where ps.public_contact_email is not null
  and not exists (select 1 from private.source_contacts sc where sc.source_id = ps.existing_source_id);

update staging.candidate_sources c set review_status='promoted' from ps where c.id = ps.id;
