create function private.screen_research_verification_batch() returns uuid
language plpgsql set search_path='' as $$
declare programme uuid;
declare batch uuid;
declare stamped integer;
begin
  if not pg_try_advisory_xact_lock(68130921) then return null; end if;
  select id into programme from private.verification_programmes
  where status='active' and name='ID-EBP catalogue assurance baseline 2026-11';
  if programme is null or not exists (
    select from public.research_records r where not exists (
      select from private.verification_items i join private.verification_batches b on b.id=i.batch_id
      where b.programme_id=programme and i.record_id=r.id
    )
  ) then return null; end if;

  insert into private.verification_batches(programme_id,batch_number,status,target_count,rules_version,started_at)
  select programme,coalesce(max(batch_number),0)+1,'running',250,'record-screen-v2',now()
  from private.verification_batches where programme_id=programme returning id into batch;

  with candidates as (
    select r.*,s.id source_id,s.country_code source_country,
      d.status doi_status,d.evidence_url doi_evidence,
      q.status openalex_status,q.evidence_url openalex_evidence,
      q.publisher_status,q.publisher_evidence_url,
      exists (select from private.research_duplicate_review dup
        where dup.review_status='unreviewed' and r.id=any(dup.record_ids)) duplicate_review
    from public.research_records r
    left join public.sources s on s.slug=r.source_slug and s.status='published'
    left join private.doi_enrichment_queue d on d.record_id=r.id
    left join private.non_doi_enrichment_queue q on q.record_id=r.id
    where not exists (select from private.verification_items i join private.verification_batches b on b.id=i.batch_id
      where b.programme_id=programme and i.record_id=r.id)
    order by (q.publisher_status='broken_link') desc nulls last,
             duplicate_review desc,(s.id is null) desc,(d.status='verified') desc nulls last,r.id
    limit 250
  ), screened as (
    select c.id, to_jsonb(r)-'search_vector' baseline, jsonb_build_object(
      'title',case when c.title ~ '\S' then 'present' else 'missing' end,
      'relevance','requires_review',
      'source_attribution',case when c.source_id is null then 'unresolved' else 'directory_source_linked' end,
      'authors',case when c.authors is null or btrim(c.authors) ~* '^(|not stated.*|not specified.*|unknown.*|responsible organisation:.*)$' then 'unresolved' else 'recorded' end,
      'publication_year',case when c.year is null then 'missing' else 'recorded' end,
      'doi',case when c.doi is null or btrim(c.doi)='' then 'missing_or_inapplicable' when c.doi ~* '^10\.[0-9]{4,9}/\S+$' then 'well_formed' else 'needs_review' end,
      'canonical_url',case when c.url ~ '^https?://' then 'recorded' else 'needs_review' end,
      'link_accessibility',case when c.publisher_status in ('verified','broken_link','blocked','pdf_manual') then c.publisher_status else 'unchecked' end,
      'summary',case when coalesce(btrim(c.summary),'')='' then 'missing' else 'present_provenance_unconfirmed' end,
      'publication_type',case when coalesce(btrim(c.kind_std),'')='' then 'missing' else 'catalogue_classification' end,
      'topics_and_tags',case when coalesce(cardinality(c.tags),0)=0 then 'missing' else 'catalogue_classification' end,
      'research_methods','requires_review',
      'language','requires_review',
      'research_country','requires_review',
      'source_country',c.source_country,
      'access_status',case when coalesce(btrim(c.access_std),'')='' then 'missing' else 'recorded' end,
      'duplicate',case when c.duplicate_review then 'open_candidate' else 'no_open_candidate_in_audit' end,
      'evidence_provenance',jsonb_strip_nulls(jsonb_build_object(
        'doi_registry',case when c.doi_status='verified' then c.doi_evidence end,
        'openalex_index',case when c.openalex_status='verified' then c.openalex_evidence end,
        'publisher',case when c.publisher_status='verified' then c.publisher_evidence_url end
      )),
      'full_record_verified',false
    ) checks
    from candidates c join public.research_records r on r.id=c.id
  )
  insert into private.verification_items(batch_id,record_id,baseline_record,baseline_fingerprint,
    selected_reason,assessment_status,checks,assessed_at)
  select batch,id,baseline,md5(baseline::text),'automated catalogue screen','automatic_screened',checks,now()
  from screened;
  get diagnostics stamped=row_count;
  insert into private.verification_exceptions(batch_id,record_id,issue_code,priority,detail)
  select batch,i.record_id,e.issue,e.priority,jsonb_build_object('observed',i.checks->>e.field)
  from private.verification_items i
  cross join lateral (values
    ('unresolved_attribution','high','source_attribution',i.checks->>'source_attribution'='unresolved'),
    ('broken_publisher_link','high','link_accessibility',i.checks->>'link_accessibility'='broken_link'),
    ('suspected_duplicate','high','duplicate',i.checks->>'duplicate'='open_candidate'),
    ('unresolved_authors','medium','authors',i.checks->>'authors'='unresolved'),
    ('missing_year','medium','publication_year',i.checks->>'publication_year'='missing'),
    ('doi_requires_review','medium','doi',i.checks->>'doi'='needs_review'),
    ('url_requires_review','medium','canonical_url',i.checks->>'canonical_url'='needs_review'),
    ('missing_summary','low','summary',i.checks->>'summary'='missing'),
    ('missing_tags','low','topics_and_tags',i.checks->>'topics_and_tags'='missing')
  ) e(issue,priority,field,active)
  where i.batch_id=batch and e.active
  on conflict (batch_id,record_id,issue_code) do nothing;
  update private.verification_batches set status='review_required',completed_at=now(),checkpoint_at=now(),
    summary=jsonb_build_object('screened',stamped,'externally_verified',0,
      'issues',(select count(*) from private.verification_exceptions where batch_id=batch),
      'records_with_issues',(select count(distinct record_id) from private.verification_exceptions where batch_id=batch))
  where id=batch;
  return batch;
end;
$$;
revoke all on function private.screen_research_verification_batch() from public,anon,authenticated;

create function public.directory_research_verification_report() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare formal jsonb := '{}'::jsonb;
declare report jsonb;
declare next_tick timestamptz;
begin
  if to_regclass('private.verification_items') is not null then
    select jsonb_object_agg(record_id,verified) into formal from (
      select i.record_id,bool_or(i.assessment_status='evidence_verified' and
        coalesce(i.checks->>'full_record_verified','false')='true') verified
      from private.verification_items i join private.verification_batches b on b.id=i.batch_id
      join private.verification_programmes p on p.id=b.programme_id
      where p.name='ID-EBP catalogue assurance baseline 2026-11' group by i.record_id
    ) v;
    formal := coalesce(formal,'{}'::jsonb);
  end if;
  if to_regclass('cron.job') is not null then
    select date_bin(interval '1 hour',now(),timestamptz '2000-01-01 00:55:00+00')+interval '1 hour'
    into next_tick from cron.job where jobname='id-ebp-research-enrichment-hourly' and active and schedule='55 * * * *';
  end if;
  with records as (
    select r.*,
      coalesce(formal->>r.id,'false')='true' fully,
      formal ? r.id screened,
      (coalesce(d.status='verified',false) or coalesce(q.status='verified',false)
       or coalesce(q.publisher_status='verified',false)) metadata_verified
    from public.research_records r
    left join private.doi_enrichment_queue d on d.record_id=r.id
    left join private.non_doi_enrichment_queue q on q.record_id=r.id
  )
  select jsonb_build_object(
    'publishedResearch',count(*),
    'publishedSources',(select count(*) from public.sources where status='published'),
    'fullyVerified',count(*) filter (where fully),
    'partiallyVerified',count(*) filter (where not fully and metadata_verified),
    'awaitingVerification',count(*) filter (where not fully and not metadata_verified),
    'formallyScreened',count(*) filter (where screened),
    'missingMetadata',jsonb_build_object(
      'year',count(*) filter (where year is null),
      'authors',count(*) filter (where coalesce(btrim(authors),'') ~* '^(|not stated.*|not specified.*|unknown.*|responsible organisation:.*)$'),
      'summary',count(*) filter (where coalesce(btrim(summary),'')=''),
      'tags',count(*) filter (where coalesce(cardinality(tags),0)=0),
      'source',count(*) filter (where not exists (select from public.sources s where s.slug=records.source_slug and s.status='published')),
      'url',count(*) filter (where coalesce(url,'') !~ '^https?://')
    ),
    'doiRecords',count(*) filter (where coalesce(btrim(doi),'')<>''),
    'doiVerified',(select count(*) from private.doi_enrichment_queue where status='verified'),
    'openAlexVerified',(select count(*) from private.non_doi_enrichment_queue where status='verified'),
    'publisherVerified',(select count(*) from private.non_doi_enrichment_queue where publisher_status='verified'),
    'enrichmentRemaining',private.enrichment_hourly_remaining(),
    'duplicateBacklog',(select count(*) from private.research_duplicate_review where review_status='unreviewed'),
    'nextBatch',next_tick,
    'latestBatch',(select to_jsonb(b)-'chunk_until'-'lease_until' from private.enrichment_hourly_batches b
      where status='complete' and attempted>0 order by finished_at desc limit 1),
    'latestWorkerError',(select jsonb_build_object('reportedAt',at,'message',message) from (
      select finished_at at,error message from private.enrichment_hourly_batches where status='failed'
      union all
      select updated_at,last_error from private.enrichment_provider_state where last_error is not null
      union all
      select checked_at,note from private.enrichment_hourly_results where status='error'
    ) e order by at desc nulls last limit 1)
  ) into report from records;
  return report;
end;
$$;
revoke all on function public.directory_research_verification_report() from public,anon,authenticated;
grant execute on function public.directory_research_verification_report() to service_role;
