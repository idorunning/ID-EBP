-- Input: jsonb object from the trusted operator, keyed by record ID.
-- The runner supplies this expression with transport-safe JSON encoding.
with reviews as (
  select key id,value review from jsonb_each(__REVIEWS__)
), assurance as (
  select * from private.enrichment_dashboard_assurance()
), duplicates as (
  select distinct unnest(record_ids) record_id from private.research_duplicate_review
  where review_status='unreviewed'
), documents as (
  select r.id,r.title,r.url,r.authors,r.year,r.source,r.summary,r.tags,r.kind_std,
    md5((to_jsonb(r)-'search_vector')::text) fingerprint,
    a.assessment_status,a.assessed_at,a.checks,a.baseline_fingerprint,a.reported_at,
    (s.id is not null) source_published,
    (sd.content_hash=md5(left(concat_ws('. ',r.title,
      nullif(array_to_string(r.tags,', '),''),nullif(r.related_terms,''),
      nullif(public.research_clean_summary(r.summary),'')),1600))
      and sd.title_text=public.research_normalise(r.title)) is true indexed,
    coalesce(
      case when d.status='verified' and lower(btrim(r.doi))=lower(btrim(d.doi))
        and d.evidence_url ~ '^https?://[^[:space:]/]+' then d.evidence_url end,
      case when q.publisher_status='verified' and q.publisher_evidence_url ~ '^https?://[^[:space:]/]+'
        and (regexp_replace(q.publisher_evidence_url,'/$','')=regexp_replace(r.url,'/$','')
             or q.publisher_metadata->>'source_url'=r.url)
        then q.publisher_evidence_url end,
      case when q.status='verified' and q.evidence_url ~ '^https?://[^[:space:]/]+'
        and public.research_normalise(q.metadata->>'title')=public.research_normalise(r.title)
        then q.evidence_url end
    ) publication_evidence,
    (du.record_id is not null) duplicate_open,
    (d.status='verified' and nullif(btrim(d.evidence_url),'') is not null
      or q.status='verified' and nullif(btrim(q.evidence_url),'') is not null
      or q.publisher_status='verified' and nullif(btrim(q.publisher_evidence_url),'') is not null) is true confirmed,
    v.review supplied
  from public.research_records r
  left join public.sources s on s.slug=r.source_slug and s.status='published'
  left join public.research_search_documents sd on sd.record_id=r.id
  left join private.doi_enrichment_queue d on d.record_id=r.id
  left join private.non_doi_enrichment_queue q on q.record_id=r.id
  left join assurance a on a.record_id=r.id
  left join duplicates du on du.record_id=r.id
  left join reviews v on v.id=r.id
  __REVIEW_SCOPE__
), evidence as (
  select *,
    case when supplied->>'fingerprint'=fingerprint then supplied
         when checks#>>'{stage4_review,fingerprint}'=fingerprint then checks->'stage4_review'
    end reviewed,
    (assessment_status in ('automatic_screened','evidence_verified')) is true screened
  from documents
), gaps as (
  select *,array_remove(array[
    case when not screened then 'screening_pending' end,
    case when not confirmed then 'publication_confirmation_pending'
      when publication_evidence is null then 'publication_evidence_requires_recheck' end,
    case when coalesce(btrim(title),'')='' then 'title_missing' end,
    case when btrim(coalesce(authors,'')) ~* '^(|not stated.*|not specified.*|unknown.*|responsible organisation:.*|n/a|none listed.*|none|editor|editors|anonymous|various)$' then 'author_or_organisation_missing' end,
    case when year is null and not (
      coalesce(kind_std in ('not-research','publication-resource-page','information-webpage','nonpaper-resource'),false)
      and nullif(btrim(reviewed#>>'{year_not_applicable,reason}'),'') is not null
    ) then 'publication_year_missing' end,
    case when not source_published or coalesce(btrim(source),'')='' then 'source_attribution_unresolved' end,
    case when coalesce(public.research_clean_summary(summary),'')='' then 'summary_missing' end,
    case when not exists(select from unnest(tags) tag where btrim(tag)<>'') then 'topics_missing' end,
    case when coalesce(url,'') !~ '^https?://[^[:space:]/]+' then 'research_link_missing' end,
    case when reviewed is null then 'current_field_evidence_required' end,
    case when supplied is not null and supplied->>'fingerprint' is distinct from fingerprint then 'review_snapshot_changed' end
  ],null) stage4_blockers
  from evidence
), decisions as (
  select *,
    (cardinality(stage4_blockers)=0) ready_for_review,
    array_remove(array[
      case when reported_at is not null then 'open_assurance_issue' end,
      case when duplicate_open then 'duplicate_review_pending' end,
      case when not indexed then 'search_index_pending' end,
      case when jsonb_typeof(reviewed->'final') is distinct from 'object' then 'final_review_required' end,
      case when reviewed ? 'final' and reviewed#>>'{final,checked_url}' is distinct from url
        then 'link_check_is_for_another_url' end,
      case when (coalesce(supplied->>'live_found','false')<>'true') then 'live_search_confirmation_required' end
    ],null) stage5_blockers
  from gaps
), assessment as (
  select *,case
    when ready_for_review and assessment_status='evidence_verified'
      and checks->'full_record_verified'='true'::jsonb and baseline_fingerprint=fingerprint
      and reported_at is null and not duplicate_open and indexed then 5
    when ready_for_review then 4
    when screened and confirmed then 3
    when screened then 2
    else 1 end stage
  from decisions
)
