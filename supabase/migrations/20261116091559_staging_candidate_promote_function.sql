-- Promote one verified crawl run: fill blanks only, insert new records, log every change. Refuses runs not marked passed.
create or replace function staging.candidate_promote(p_run_id bigint) returns jsonb language plpgsql as $$
declare n_upd int; n_ins int;
begin
  if not exists (select 1 from staging.swarm_runs where id = p_run_id and status = 'passed') then
    return jsonb_build_object('error', 'run not passed - nothing promoted');
  end if;

  create temp table pp on commit drop as
  select distinct on (c.existing_record_id) c.* from staging.candidate_records c
  where c.run_id = p_run_id and c.existing_record_id is not null and c.verifier_status='passed' and c.review_status='pending'
    and not c.injection_flag
  order by c.existing_record_id, c.id;

  insert into private.promotion_log (batch, table_name, row_id, field, old_value, new_value)
  select 'run'||p_run_id, 'research_records', r.id, f.field, f.old_value, f.new_value
  from public.research_records r join pp on pp.existing_record_id = r.id
  cross join lateral (values
    ('authors', r.authors, case when r.authors = '' and pp.authors is not null and pp.authors not ilike 'none listed%' and pp.source_slug <> 'college-toolkit' and pp.kind <> 'not-research' then pp.authors end),
    ('publication', r.publication, case when r.publication = '' and pp.publication is not null then pp.publication end),
    ('summary', r.summary, case when r.summary = '' and pp.summary is not null then pp.summary end),
    ('doi', r.doi, case when r.doi is null and pp.doi is not null then pp.doi end),
    ('year', r.year::text, case when r.year is null and pp.year is not null then pp.year::text end),
    ('kind_std', r.kind_std, case when pp.kind = 'not-research' and coalesce(r.kind_std,'') <> 'not-research' then 'not-research' end)
  ) as f(field, old_value, new_value) where f.new_value is not null;

  update public.research_records r set
    authors = case when r.authors = '' and pp.authors is not null and pp.authors not ilike 'none listed%' and pp.source_slug <> 'college-toolkit' and pp.kind <> 'not-research' then pp.authors else r.authors end,
    publication = case when r.publication = '' and pp.publication is not null then pp.publication else r.publication end,
    summary = case when r.summary = '' and pp.summary is not null then pp.summary else r.summary end,
    doi = coalesce(r.doi, pp.doi), year = coalesce(r.year, pp.year),
    kind_std = case when pp.kind = 'not-research' then 'not-research' else r.kind_std end
  from pp where pp.existing_record_id = r.id;
  get diagnostics n_upd = row_count;
  update staging.candidate_records c set review_status='promoted' from pp where c.id = pp.id;

  with n as (
    select c.*, s.name source_name, row_number() over (order by c.id) + (select max(substring(id from 'IDEBP-R(\d+)')::int) from public.research_records) num
    from staging.candidate_records c join public.sources s on s.slug = c.source_slug
    where c.run_id = p_run_id and c.existing_record_id is null and c.verifier_status='passed' and c.review_status='pending' and not c.injection_flag
      and not exists (select 1 from public.research_records r where r.url = c.url or lower(r.title) = lower(c.title) or (c.doi is not null and r.doi = c.doi))
  ), ins as (
    insert into public.research_records (id, source, source_slug, title, url, authors, publication, kind, summary, access, status, checked, related_terms, tags, doi, year)
    select 'IDEBP-R'||num, source_name, source_slug, title, url, coalesce(authors,''), coalesce(publication,''), coalesce(kind,'other'), coalesce(summary,''), coalesce(access,'unknown'),
           'Stage 3 item page checked by agent and independent verifier', to_char(now(),'YYYY-MM-DD'), '', coalesce(tags,'{}'), doi, year from n returning id, url)
  insert into private.promotion_log (batch, table_name, row_id, field, new_value) select 'run'||p_run_id, 'research_records', id, 'INSERT', url from ins;
  get diagnostics n_ins = row_count;
  update staging.candidate_records c set review_status='promoted'
  where c.run_id = p_run_id and c.existing_record_id is null and c.verifier_status='passed'
    and exists (select 1 from public.research_records r where r.url = c.url);

  return jsonb_build_object('records_updated', n_upd, 'records_inserted', n_ins);
end $$;
revoke all on function staging.candidate_promote(bigint) from public, anon, authenticated;
