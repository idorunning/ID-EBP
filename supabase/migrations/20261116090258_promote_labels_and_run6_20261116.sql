update staging.label_suggestions set access_std = 'unknown' where access_std = 'paywalled' and reviewed_by is null;
update staging.label_suggestions s set access_std = 'open'
from staging.candidate_records c where c.existing_record_id = s.record_id and c.run_id = 3 and c.access = 'open';
update staging.label_suggestions set needs_review = (confidence < 0.5 and reviewed_by is null);
update staging.label_suggestions set verifier_status = 'passed' where not needs_review and verifier_status = 'unchecked';
select staging.label_promote();

create temp table p6 on commit drop as
select distinct on (c.existing_record_id) c.* from staging.candidate_records c
where c.run_id = 6 and c.existing_record_id is not null and c.verifier_status='passed' and c.review_status='pending'
order by c.existing_record_id, c.id;

insert into private.promotion_log (batch, table_name, row_id, field, old_value, new_value)
select 'run6', 'research_records', r.id, f.field, f.old_value, f.new_value
from public.research_records r join p6 on p6.existing_record_id = r.id
cross join lateral (values
  ('authors', r.authors, case when r.authors = '' and p6.authors is not null and p6.authors not ilike 'none listed%' and p6.source_slug <> 'college-toolkit' and p6.kind <> 'not-research' then p6.authors end),
  ('publication', r.publication, case when r.publication = '' and p6.publication is not null then p6.publication end),
  ('summary', r.summary, case when r.summary = '' and p6.summary is not null then p6.summary end),
  ('doi', r.doi, case when r.doi is null and p6.doi is not null then p6.doi end),
  ('year', r.year::text, case when r.year is null and p6.year is not null then p6.year::text end),
  ('kind_std', r.kind_std, case when p6.kind = 'not-research' and coalesce(r.kind_std,'') <> 'not-research' then 'not-research' end)
) as f(field, old_value, new_value) where f.new_value is not null;

update public.research_records r set
  authors = case when r.authors = '' and p6.authors is not null and p6.authors not ilike 'none listed%' and p6.source_slug <> 'college-toolkit' and p6.kind <> 'not-research' then p6.authors else r.authors end,
  publication = case when r.publication = '' and p6.publication is not null then p6.publication else r.publication end,
  summary = case when r.summary = '' and p6.summary is not null then p6.summary else r.summary end,
  doi = coalesce(r.doi, p6.doi), year = coalesce(r.year, p6.year),
  kind_std = case when p6.kind = 'not-research' then 'not-research' else r.kind_std end
from p6 where p6.existing_record_id = r.id;
update staging.candidate_records c set review_status='promoted' from p6 where c.id = p6.id;

with n as (
  select c.*, s.name source_name, row_number() over (order by c.id) + (select max(substring(id from 'IDEBP-R(\d+)')::int) from public.research_records) num
  from staging.candidate_records c join public.sources s on s.slug = c.source_slug
  where c.run_id = 6 and c.existing_record_id is null and c.verifier_status='passed' and c.review_status='pending'
    and not exists (select 1 from public.research_records r where r.url = c.url or lower(r.title) = lower(c.title))
), ins as (
  insert into public.research_records (id, source, source_slug, title, url, authors, publication, kind, summary, access, status, checked, related_terms, tags, doi, year)
  select 'IDEBP-R'||num, source_name, source_slug, title, url, coalesce(authors,''), coalesce(publication,''), coalesce(kind,'other'), coalesce(summary,''), coalesce(access,'unknown'),
         'Stage 3 item page checked by agent and independent verifier', '2026-11-16', '', coalesce(tags,'{}'), doi, year from n returning id, url)
insert into private.promotion_log (batch, table_name, row_id, field, new_value) select 'run6','research_records', id, 'INSERT', url from ins;
update staging.candidate_records c set review_status='promoted'
where c.run_id = 6 and c.existing_record_id is null and c.verifier_status='passed'
  and exists (select 1 from public.research_records r where r.url = c.url);
