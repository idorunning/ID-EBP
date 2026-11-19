-- Preserve DOI attempt and outcome history when the queues overwrite their latest state.
-- Hourly publisher/OpenAlex result rows already provide their own durable audit.
create table private.enrichment_doi_events (
  id bigint generated always as identity primary key,
  recorded_at timestamptz not null default clock_timestamp(),
  record_id text not null,
  workflow text not null check (workflow in ('doi','datacite')),
  phase text not null check (phase in ('attempt','outcome')),
  status text not null,
  fields text[] not null default '{}'
);
create index enrichment_doi_events_time on private.enrichment_doi_events (recorded_at desc);
create index enrichment_hourly_results_report_time on private.enrichment_hourly_results (checked_at desc);
alter table private.enrichment_doi_events enable row level security;
revoke all on private.enrichment_doi_events from public, anon, authenticated;

create table private.enrichment_dashboard_coverage (
  installed_at timestamptz primary key default clock_timestamp()
);
insert into private.enrichment_dashboard_coverage default values;
alter table private.enrichment_dashboard_coverage enable row level security;
revoke all on private.enrichment_dashboard_coverage from public, anon, authenticated;

create function private.log_enrichment_doi_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.datacite_status is distinct from old.datacite_status
      and (old.datacite_status='processing' or new.datacite_status='processing') then
    insert into private.enrichment_doi_events(record_id,workflow,phase,status,fields)
    values(new.record_id,'datacite',case when new.datacite_status='processing' then 'attempt' else 'outcome' end,
      new.datacite_status,case when new.datacite_status='verified' then coalesce(new.updated_fields,'{}') else '{}' end);
  end if;

  if new.status is distinct from old.status
      and (old.status='processing' or new.status='processing')
      and not (new.datacite_status='verified' and old.datacite_status is distinct from new.datacite_status) then
    insert into private.enrichment_doi_events(record_id,workflow,phase,status,fields)
    values(new.record_id,'doi',case when new.status='processing' then 'attempt' else 'outcome' end,new.status,
      case when new.status='verified' then coalesce(new.updated_fields,'{}') else '{}' end);
  end if;
  return new;
end;
$$;
revoke all on function private.log_enrichment_doi_event() from public, anon, authenticated;
create trigger enrichment_doi_audit after update of status,datacite_status on private.doi_enrichment_queue
for each row execute function private.log_enrichment_doi_event();

-- Optional, record-level evidence for fields with no reliable catalogue columns.
-- A changed title or URL retires the former evidence from the live calculation.
create table private.research_enrichment_evidence (
  record_id text not null references public.research_records(id) on delete cascade,
  metric text not null check (metric in ('research_country','research_language','translation','doi_identification','link_reachability')),
  disposition text not null check (disposition in ('verified','not_applicable','failed')),
  verified_value text,
  evidence_url text not null check (evidence_url ~* '^https?://[^[:space:]/]+'),
  record_title text not null,
  record_url text not null,
  checked_at timestamptz not null default clock_timestamp(),
  primary key(record_id,metric),
  check (disposition <> 'verified' or nullif(btrim(verified_value),'') is not null),
  check (metric <> 'research_country' or disposition <> 'verified' or verified_value ~ '^[A-Z]{2}(,[A-Z]{2})*$'),
  check (metric <> 'research_language' or disposition <> 'verified' or verified_value ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  check (metric <> 'doi_identification' or disposition <> 'verified' or verified_value ~* '^10\.[0-9]{4,9}/\S+$')
);
alter table private.research_enrichment_evidence enable row level security;
revoke all on private.research_enrichment_evidence from public, anon, authenticated;

create function public.directory_live_enrichment(p_actor uuid,p_session uuid,p_assurance text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.directory_api('admin_analytics','{}',p_actor,p_session,p_assurance);
  return private.live_enrichment_report();
end;
$$;
revoke all on function public.directory_live_enrichment(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.directory_live_enrichment(uuid,uuid,text) to service_role;

-- Some local and preview projects do not install pg_cron or formal assurance.
-- An absent service leaves its telemetry unavailable while the rest still works.
create function private.enrichment_dashboard_schedule()
returns table(jobid bigint, active boolean, schedule text, dispatch_status text, dispatch_at timestamptz)
language plpgsql stable set search_path='' as $$
begin
  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    return query select j.jobid,j.active,j.schedule,d.status,d.start_time
    from cron.job j left join lateral (
      select x.status,x.start_time from cron.job_run_details x
      where x.jobid=j.jobid order by x.runid desc limit 1
    ) d on true
    where j.jobname='id-ebp-research-enrichment-hourly';
  end if;
end;
$$;
revoke all on function private.enrichment_dashboard_schedule() from public, anon, authenticated;

create function private.enrichment_dashboard_assurance()
returns table(record_id text,assessment_status text,assessed_at timestamptz,
  checks jsonb,baseline_fingerprint text,reported_at timestamptz)
language plpgsql stable set search_path='' as $$
begin
  if to_regclass('private.verification_items') is null or to_regclass('private.verification_exceptions') is null then
    return;
  end if;
  return query
    with formal as (
      select distinct on (i.record_id) i.record_id,i.assessment_status,i.assessed_at,i.checks,i.baseline_fingerprint
      from private.verification_items i join private.verification_batches b on b.id=i.batch_id
      join private.verification_programmes p on p.id=b.programme_id
      where p.name='ID-EBP catalogue assurance baseline 2026-11' and i.assessed_at is not null
      order by i.record_id,i.assessed_at desc,i.batch_id desc
    ), exceptions as (
      select e.record_id,max(e.created_at) as reported_at from private.verification_exceptions e
      where e.status in ('open','investigating') group by e.record_id
    )
    select coalesce(f.record_id,e.record_id),f.assessment_status,f.assessed_at,f.checks,f.baseline_fingerprint,e.reported_at
    from formal f full join exceptions e on e.record_id=f.record_id;
end;
$$;
revoke all on function private.enrichment_dashboard_assurance() from public, anon, authenticated;

create function private.live_enrichment_report() returns jsonb
language sql stable set search_path='' as $$
with
clock as (
  select now() as at,(select min(installed_at) from private.enrichment_dashboard_coverage) as doi_since,
    (select min(started_at) from private.enrichment_hourly_batches) as hourly_since
),
schedule as (
  select j.jobid,j.active,j.schedule,j.dispatch_status,j.dispatch_at,
    case when j.active and j.schedule ~ '^[0-5]?[0-9] \* \* \* \*'
      then date_bin(interval '1 hour',c.at,
        '2000-01-01 00:00:00+00'::timestamptz + make_interval(mins=>split_part(j.schedule,' ',1)::int))
    end as prior_tick
  from clock c left join private.enrichment_dashboard_schedule() j on true
),
hourly as (
  select batch_id,record_id,status,method,checked_at,updated_fields,note
  from private.enrichment_hourly_results, clock where checked_at>=at-interval '30 days'
),
doi_events as (
  select e.* from private.enrichment_doi_events e,clock where recorded_at>=at-interval '30 days'
),
activity as (
  select record_id,checked_at as at,status,'outcome' as phase,updated_fields as fields,'hourly' as origin from hourly
  union all
  select record_id,recorded_at,status,phase,fields,'doi' from doi_events
),
changes as (
  select record_id,max(a.at) as changed_at
  from activity a,clock c where a.at>=c.at-interval '24 hours' and cardinality(fields)>0
  group by record_id
),
field_changes as (
  select field,count(distinct a.record_id) filter (where a.at>=c.at-interval '24 hours') as count_24h,
         max(a.at) as last_at
  from activity a cross join clock c cross join lateral unnest(a.fields) field
  group by field
),
ever_hourly as (
  select record_id,max(checked_at) as latest,bool_or(cardinality(updated_fields)>0) as improved,
    max(checked_at) filter (where cardinality(updated_fields)>0) as improved_at
  from private.enrichment_hourly_results group by record_id
),
ever_doi as (
  select record_id,max(recorded_at) as latest,bool_or(cardinality(fields)>0) as improved,
    max(recorded_at) filter (where cardinality(fields)>0) as improved_at
  from private.enrichment_doi_events group by record_id
),
duplicates as (
  select ids.id,max(d.last_seen_at) as reported_at from private.research_duplicate_review d
  cross join lateral unnest(d.record_ids) ids(id)
  where d.review_status='unreviewed' group by ids.id
),
confirmed as (
  select r.id,jsonb_object_agg(e.metric,jsonb_build_object('state',e.disposition,'value',e.verified_value,'at',e.checked_at)) as facts
  from public.research_records r join private.research_enrichment_evidence e
    on e.record_id=r.id and e.record_title=r.title and e.record_url=r.url
  group by r.id
),
records as materialized (
  select r.id,r.title,r.authors,r.year,r.publication,r.doi,r.url,r.kind_std,r.access_std,r.summary,r.tags,r.related_terms,
    s.id as source_id,sd.record_id is not null as indexed,sd.embedding is not null as embedded,sd.embedded_at,
    cardinality(sd.topic_ids)>0 as topical,
    coalesce(eh.improved,false) or coalesce(ed.improved,false)
      or coalesce(d.status='verified' and cardinality(d.updated_fields)>0,false)
      or coalesce(q.status='verified' and cardinality(q.updated_fields)>0,false)
      or coalesce(q.publisher_status='verified' and cardinality(q.publisher_updated_fields)>0,false) as enriched,
    greatest(eh.latest,ed.latest,d.processed_at,q.processed_at,q.publisher_attempted_at) as last_processed,
    eh.latest is not null or ed.latest is not null or d.processed_at is not null or q.processed_at is not null
      or q.publisher_attempted_at is not null or coalesce(d.attempts+d.datacite_attempts,0)>0
      or coalesce(q.attempts+q.publisher_attempts,0)>0 as attempted,
    (d.status='verified' and lower(btrim(r.doi))=lower(btrim(d.doi)) and d.evidence_url ~* '^https?://')
      is true as doi_verified,
    d.processed_at as doi_at,
    nullif(btrim(r.doi),'') is not null or d.record_id is not null
      or c.facts#>>'{doi_identification,state}'='verified' as doi_eligible,
    c.facts#>>'{doi_identification,state}'='not_applicable' and nullif(btrim(r.doi),'') is null as doi_na,
    (q.status='verified' and q.evidence_url ~* '^https?://' and q.metadata->>'source'='OpenAlex'
      and q.metadata->>'language' ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
      and public.research_normalise(r.title)=public.research_normalise(q.metadata->>'title')) is true as language_provider,
    q.processed_at as title_match_at,
    greatest(
      case when d.status='verified' and d.evidence_url ~* '^https?://' and lower(btrim(r.doi))=lower(btrim(d.doi))
        and public.research_normalise(r.title)=public.research_normalise(d.metadata->>'title') then d.processed_at end,
      case when q.status='verified' and q.evidence_url ~* '^https?://'
        and public.research_normalise(r.title)=public.research_normalise(q.metadata->>'title') then q.processed_at end,
      case when q.publisher_status='verified' and q.publisher_evidence_url ~* '^https?://'
        and (q.publisher_metadata->>'source_url'=r.url or q.publisher_evidence_url=r.url)
        and public.research_normalise(r.title)=public.research_normalise(q.publisher_metadata->>'title') then q.publisher_attempted_at end
    ) as title_verified_at,
    (q.publisher_status='verified' and (q.publisher_metadata->>'source_url'=r.url or q.publisher_evidence_url=r.url)
      and q.publisher_evidence_url ~* '^https?://') is true as publisher_matched,
    q.publisher_attempted_at as publisher_at,
    (q.publisher_status='broken_link' or c.facts#>>'{link_reachability,state}'='failed') is true as broken,
    (d.status='error' or d.datacite_status='error' or q.status='error' or q.publisher_status='error') is true as errors,
    (q.publisher_status='blocked') is true as blocked,
    (q.status='not_applicable') is true as matching_na,
    (q.status not in ('verified') and q.publisher_status not in ('verified') and
      (q.status in ('queued','processing') or q.publisher_status in ('pending','processing'))
      and d.status is distinct from 'verified') is true as queued,
    (q.publisher_status in ('pdf_manual','blocked') or d.status='conflict' or d.datacite_status='conflict'
      or q.status='ambiguous' or q.publisher_status='mismatch' or f.reported_at is not null) is true as manual,
    du.reported_at as duplicate_at,f.reported_at as review_at,
    f.assessed_at, f.checks ? 'duplicate' as duplicate_screened,
    (f.assessment_status='evidence_verified' and f.checks->'full_record_verified'='true'::jsonb
      and f.baseline_fingerprint=md5((to_jsonb(r)-'search_vector')::text)) is true as fully_verified,
    c.facts, greatest(ch.changed_at, eh.improved_at, ed.improved_at,
      case when d.status='verified' and cardinality(d.updated_fields)>0 then d.processed_at end,
      case when q.status='verified' and cardinality(q.updated_fields)>0 then q.processed_at end,
      case when q.publisher_status='verified' and cardinality(q.publisher_updated_fields)>0 then q.publisher_attempted_at end) as changed_at
  from public.research_records r
  left join public.sources s on s.slug=r.source_slug and s.status='published'
  left join public.research_search_documents sd on sd.record_id=r.id
  left join private.doi_enrichment_queue d on d.record_id=r.id
  left join private.non_doi_enrichment_queue q on q.record_id=r.id
  left join ever_hourly eh on eh.record_id=r.id left join ever_doi ed on ed.record_id=r.id
  left join private.enrichment_dashboard_assurance() f on f.record_id=r.id
  left join duplicates du on du.id=r.id left join confirmed c on c.id=r.id left join changes ch on ch.record_id=r.id
),
totals as (
  select count(*) as total,
    count(*) filter(where attempted) as attempted,count(*) filter(where enriched) as enriched,
    count(*) filter(where fully_verified) as verified,
    count(*) filter(where assessed_at is not null) as screened,
    count(*) filter(where queued) as hourly_queue,
    count(*) filter(where not attempted) as not_attempted,
    count(*) filter(where attempted and not coalesce(enriched,false) and not fully_verified and not errors and not blocked) as attempted_without_update,
    count(*) filter(where matching_na) as matching_na
  from records
),
research_definitions(key,section,label,tone,meaning,origin,field,inverse) as (values
  ('title','Core metadata','Valid title format','blue','Catalogue title contains readable text and is not a placeholder.','research_records','title',false),
  ('authors','Core metadata','Authors recorded','blue','Named authors or a credited organisation. Placeholder authorship remains outstanding.','research_records','authors',false),
  ('year','Core metadata','Publication year recorded','blue','Structured year from 1801 to next year.','research_records','year',false),
  ('publication','Core metadata','Publication or publisher recorded','blue','A publication or publisher is recorded on the research entry.','research_records','publication',false),
  ('title_identity','Core metadata','Research title corroborated','green','A verified DOI, publisher or academic-index identity result contains the same normalised title as the current record.','DOI and non-DOI enrichment queues',null,false),
  ('doi','Core metadata','DOI identification','blue','Well-formed DOI among records with a DOI value, a DOI queue entry or documented DOI evidence. Unknown eligibility and documented inapplicability are excluded.','research_records · DOI queue · research_enrichment_evidence','doi',false),
  ('doi_validation','Core metadata','DOI validated','green','A successful registry or academic-index DOI and title match for the current catalogue DOI, with evidence. All recorded DOI values or other known candidates are eligible.','doi_enrichment_queue',null,false),
  ('url','Core metadata','Valid research URL format','blue','Catalogue link has HTTP or HTTPS format and a host.','research_records','url',false),
  ('reachable','Core metadata','Research link verified','green','Evidence confirms the current URL, or a publisher identity check verifies the page at the same URL.','non_doi_enrichment_queue · research_enrichment_evidence',null,false),
  ('source','Core metadata','Linked directory source','blue','The recorded source slug resolves to a published directory entry.','research_records · sources','source_slug',false),
  ('kind','Core metadata','Research type classified','blue','A structured research type is recorded. Generic unknown and other labels remain outstanding.','research_records','kind_std',false),
  ('access','Core metadata','Access classified','blue','Structured access is open, paywalled or requires free registration.','research_records','access_std',false),
  ('summary','Research enrichment','Summary recorded','blue','A non-empty catalogue summary is present.','research_records','summary',false),
  ('tags','Research enrichment','Subject tags recorded','blue','There is at least one non-empty subject tag.','research_records','tags',false),
  ('related','Research enrichment','Related search terms recorded','blue','Related search terms are present in the catalogue.','research_records','related_terms',false),
  ('category','Research enrichment','Standardised search topics','blue','At least one topic from the search dictionary is assigned to the record.','research_search_documents',null,false),
  ('country','Research enrichment','Study country evidenced','green','A recorded evidence check identifies the country studied. Documented inapplicable records are excluded.','research_enrichment_evidence',null,false),
  ('language','Research enrichment','Research language evidenced','green','A recorded evidence check or matched OpenAlex work identifies the language. Documented inapplicable records are excluded.','research_enrichment_evidence · non_doi_enrichment_queue',null,false),
  ('translation','Research enrichment','Translated metadata verified','green','Evidence confirms translated metadata. The eligible cohort contains recorded translation assessments, including recorded failures. Documented inapplicable records are excluded.','research_enrichment_evidence',null,false),
  ('indexed','Research enrichment','Search documents indexed','blue','A search index document exists for the record.','research_search_documents',null,false),
  ('embedded','Research enrichment','Semantic search indexed','blue','The current search document contains a semantic embedding.','research_search_documents',null,false),
  ('processed','Data quality','Records attempted','blue','A catalogue record has a queue attempt, processing timestamp or durable result.','Hourly results · DOI events · enrichment queues',null,false),
  ('enriched','Data quality','Records successfully enriched','blue','An enrichment result lists at least one field actually written. Existing historical queue evidence is included where retained.','Hourly results · DOI events · enrichment queues',null,false),
  ('verified','Data quality','Records fully verified','green','The latest formal assessment explicitly verifies the full record and matches the current record fingerprint.','verification_items',null,false),
  ('screened','Data quality','Records formally screened','blue','A record has a dated catalogue assurance assessment.','verification_items',null,false),
  ('duplicate_screened','Data quality','Duplicate check recorded','blue','The formal assurance assessment contains an individual duplicate check. The separate catalogue-wide audit records candidate groups only.','verification_items',null,false),
  ('duplicates','Data quality','Suspected duplicates','amber','Distinct records in unresolved duplicate candidate groups.','research_duplicate_review',null,true),
  ('broken','Data quality','Broken links','red','Latest publisher result or recorded reachability evidence reports a broken link.','non_doi_enrichment_queue · research_enrichment_evidence',null,true),
  ('review','Data quality','Records awaiting assurance review','amber','Distinct records with open or investigating formal exceptions.','verification_exceptions',null,true),
  ('errors','Data quality','Records with enrichment errors','red','An enrichment queue currently records a terminal error for at least one method.','DOI and non-DOI enrichment queues',null,true),
  ('manual','Data quality','Records requiring manual intervention','amber','An open assurance exception, manual PDF, blocked publisher, conflicting DOI, or ambiguous identity match needs human review.','Enrichment queues · verification_exceptions',null,true),
  ('blocked','Data quality','Publisher access blocked','red','The latest publisher result is blocked.','non_doi_enrichment_queue',null,true),
  ('queue','Data quality','Records in hourly enrichment queue','amber','Non-DOI records with queued or in-flight work that have no successful existing check.','non_doi_enrichment_queue · doi_enrichment_queue',null,true)
),
research_counts as (
  select v.key,count(*) filter(where v.eligible) as eligible,
    count(*) filter(where v.eligible and v.complete) as complete,max(v.latest) as latest
  from records r
  cross join lateral (values
    ('title',true,r.title ~ '[[:alnum:]]' and lower(btrim(r.title)) not in ('unknown','untitled','n/a','not stated'),null::timestamptz),
    ('title_identity',true,r.title_verified_at is not null,r.title_verified_at),
    ('authors',true,coalesce(btrim(r.authors),'') !~* '^(|not (stated|reported|provided|specified).*|unknown.*|n/a|responsible organisation:.*)$',null),
    ('year',true,r.year between 1801 and extract(year from current_date)::int+1,null),
    ('publication',true,coalesce(btrim(r.publication),'') !~* '^(|not (stated|reported|provided|specified).*|unknown.*|n/a)$',null),
    ('doi',r.doi_eligible and not coalesce(r.doi_na,false),coalesce(btrim(r.doi),'') ~* '^10\.[0-9]{4,9}/\S+$',null),
    ('doi_validation',r.doi_eligible and not coalesce(r.doi_na,false),r.doi_verified,case when r.doi_verified then r.doi_at end),
    ('url',true,r.url ~* '^https?://[^/?#[:space:]]+[^[:space:]]*$',null),
    ('reachable',true,r.publisher_matched or r.facts#>>'{link_reachability,state}'='verified',
      greatest(case when r.publisher_matched then r.publisher_at end,
        case when r.facts#>>'{link_reachability,state}'='verified' then (r.facts#>>'{link_reachability,at}')::timestamptz end)),
    ('source',true,r.source_id is not null,null),
    ('kind',true,coalesce(lower(btrim(r.kind_std)),'') not in ('','other','unknown'),null),
    ('access',true,r.access_std in ('open','paywalled','free-registration'),null),
    ('summary',true,nullif(btrim(r.summary),'') is not null,null),
    ('tags',true,exists(select from unnest(r.tags) t where nullif(btrim(t),'') is not null),null),
    ('related',true,nullif(btrim(r.related_terms),'') is not null,null),
    ('category',true,r.topical,null),
    ('country',r.facts#>>'{research_country,state}' is distinct from 'not_applicable',
      r.facts#>>'{research_country,state}'='verified',(r.facts#>>'{research_country,at}')::timestamptz),
    ('language',r.facts#>>'{research_language,state}' is distinct from 'not_applicable',
      r.facts#>>'{research_language,state}'='verified' or r.language_provider,
      greatest((r.facts#>>'{research_language,at}')::timestamptz,case when r.language_provider then r.title_match_at end)),
    ('translation',r.facts#>>'{translation,state}' in ('verified','failed'),
      r.facts#>>'{translation,state}'='verified',(r.facts#>>'{translation,at}')::timestamptz),
    ('indexed',true,r.indexed,null),
    ('embedded',true,r.embedded,r.embedded_at),
    ('processed',true,r.attempted,r.last_processed),
    ('enriched',true,r.enriched,r.changed_at),
    ('verified',true,r.fully_verified,case when r.fully_verified then r.assessed_at end),
    ('screened',true,r.assessed_at is not null,r.assessed_at),
    ('duplicate_screened',true,r.duplicate_screened,case when r.duplicate_screened then r.assessed_at end),
    ('duplicates',true,r.duplicate_at is not null,r.duplicate_at),
    ('broken',true,r.broken,case when r.broken then r.publisher_at end),
    ('review',true,r.review_at is not null,r.review_at),
    ('errors',true,r.errors,case when r.errors then r.last_processed end),
    ('manual',true,r.manual,null),
    ('blocked',true,r.blocked,case when r.blocked then r.publisher_at end),
    ('queue',true,r.queued,null)
  ) v(key,eligible,complete,latest)
  group by v.key
),
source_counts as (
  select v.key,count(*) as eligible,count(*) filter (where v.complete) as complete,max(v.latest) as latest
  from public.sources s
  left join public.source_signals sig on sig.source_id=s.id
  left join private.source_contacts c on c.source_id=s.id
  cross join lateral (values
    ('organisation',coalesce(sig.organisation_confirmed,false),case when sig.organisation_confirmed then sig.calculated_at end),
    ('domain',coalesce(sig.domain_confirmed,false),case when sig.domain_confirmed then sig.calculated_at end),
    ('source_country',nullif(btrim(s.country_code),'') is not null,null),
    ('source_contact',nullif(btrim(c.contact_email),'') is not null,null),
    ('source_check',s.checked_at is not null,s.checked_at)
  ) v(key,complete,latest)
  where s.status='published' group by v.key
),
source_definitions(key,label,tone,meaning,origin) as (values
  ('organisation','Organisations verified','green','A published source has a confirmed organisation signal.','source_signals'),
  ('domain','Source domains verified','green','A published source has a confirmed domain signal.','source_signals'),
  ('source_country','Source country recorded','blue','A published source has a directory country code.','sources'),
  ('source_contact','Published sources with a contact','blue','A published source has a staff-recorded contact email.','source_contacts'),
  ('source_check','Sources with a catalogue check','blue','A published source has a recorded catalogue check date.','sources')
),
display_metrics as (
  select d.key,d.section,d.label,d.tone,d.meaning,d.origin,d.inverse,coalesce(r.eligible,0) as eligible,
    coalesce(r.complete,0) as complete,greatest(r.latest,fc.last_at) as latest,
    case when d.key='enriched' then (select count(*) from changes)
      when d.field in ('authors','year','publication','doi','tags') then coalesce(fc.count_24h,0) end as improved,
    case when d.key in ('verified','screened','duplicate_screened','review') and to_regclass('private.verification_items') is null
      then 'Formal assurance telemetry is unavailable.'
      when d.key in ('country','language','translation') and coalesce(r.complete,0)=0
      and not exists(select from confirmed where facts ? case d.key when 'country' then 'research_country'
        when 'language' then 'research_language' else 'translation' end)
      then 'No usable evidence is recorded for this measure.' end as unavailable,
    1 as source_order
  from research_definitions d left join research_counts r using(key) left join field_changes fc on fc.field=d.field
  union all
  select d.key,'Sources and organisations',d.label,d.tone,d.meaning||' Eligibility is all published sources.',d.origin,
    false,coalesce(s.eligible,0),coalesce(s.complete,0),s.latest,null,null,2
  from source_definitions d left join source_counts s using(key)
),
windows as (
  select w.days,
    greatest(c.hourly_since,c.doi_since) as combined_since,c.hourly_since,
    count(*) filter(where a.phase='attempt' or a.origin='hourly') as logged_attempts,
    count(distinct a.record_id) filter(where a.phase='attempt' or a.origin='hourly') as distinct_attempted,
    count(distinct a.record_id) filter(where a.phase='outcome') as distinct_processed,
    count(distinct a.record_id) filter(where a.phase='outcome' and cardinality(a.fields)>0) as improved,
    count(*) filter(where a.phase='outcome' and a.status='verified') as successful,
    count(*) filter(where a.phase='outcome' and a.status in ('error','blocked','broken_link')) as failed,
    count(*) filter(where a.phase='outcome') as outcomes,
    count(*) filter(where a.phase='outcome' and a.status in ('pending','queued')) as deferred,
    max(a.at) as latest,
    count(distinct a.record_id) filter(where a.origin='hourly') as hourly_distinct
  from (values (1),(7),(30)) w(days) cross join clock c
  left join activity a on a.at>c.at-make_interval(days=>w.days)
  group by w.days,c.at,c.hourly_since,c.doi_since
),
recent as (
  select b.id,b.status,b.target,b.started_at,b.finished_at,b.lease_until,b.chunk_until,
    b.attempted,b.verified,b.updated,b.failed,b.deferred,b.exceptions,b.remaining,left(b.error,300) as error,
    cp.latest,coalesce(cp.distinct_records,0) as distinct_records,coalesce(cp.deferred,0) as retry_dispositions,
    case when b.finished_at>b.started_at then round(b.attempted*60.0/extract(epoch from b.finished_at-b.started_at),1) end as per_minute
  from (select * from private.enrichment_hourly_batches order by started_at desc limit 16) b
  cross join lateral (
    select max(checked_at) as latest,count(*) as distinct_records,
      count(*) filter(where status in ('pending','queued')) as deferred
    from private.enrichment_hourly_results where batch_id=b.id
  ) cp
),
latest as (select * from recent order by started_at desc limit 1),
throughput as (
  select count(*) as finished,count(*) filter(where b.attempted>0) as productive,
    count(*) filter(where b.attempted=b.target) as at_target,
    max(b.finished_at) as last_success,
    min(b.started_at) as sample_start,max(b.finished_at) as sample_end,
    (array_agg(b.remaining order by b.started_at) filter (where b.remaining is not null))[1]
      - (array_agg(b.remaining order by b.started_at desc) filter(where b.remaining is not null))[1] as net_reduction
  from private.enrichment_hourly_batches b,clock c
  where b.status='complete' and b.finished_at>c.at-interval '7 days'
),
error_rows as (
  select h.record_id,h.batch_id,h.method,h.status,left(h.note,300) as note,h.checked_at as at
  from (
    select * from hourly where status in ('error','blocked','broken_link') order by checked_at desc limit 16
  ) h
  union all
  select null,r.id,'hourly worker','failed',r.error,r.finished_at from recent r where r.error is not null
  union all
  select null,null,p.provider,'provider',left(p.last_error,300),p.updated_at
  from private.enrichment_provider_state p where p.last_error is not null
)
select jsonb_build_object(
  'calculatedAt',c.at,'doiCoverageSince',c.doi_since,'hourlyCoverageSince',c.hourly_since,
  'totals',to_jsonb(t)||jsonb_build_object('assurance_available',to_regclass('private.verification_items') is not null),
  'metrics',coalesce((select jsonb_agg(to_jsonb(m)-'source_order' order by m.source_order) from display_metrics m),'[]'),
  'windows',(select jsonb_agg(to_jsonb(w) order by days) from windows w),
  'batches',coalesce((select jsonb_agg(to_jsonb(r) order by started_at desc) from recent r),'[]'),
  'errors',coalesce((select jsonb_agg(to_jsonb(e) order by e.at desc) from error_rows e),'[]'),
  'checkpoints',coalesce((select jsonb_agg(to_jsonb(cp) order by cp.as_of desc) from (
    select * from private.enrichment_daily_checkpoint order by as_of desc limit 30
  ) cp),'[]'),
  'pipeline',jsonb_build_object(
    'state',case
      when l.status='running' and l.lease_until>c.at then 'active'
      when l.status='running' or (s.dispatch_status='failed' and s.dispatch_at>=coalesce(l.started_at,'-infinity'))
        or (l.status='failed' and l.started_at>=coalesce(s.prior_tick,'infinity')-interval '5 minutes') then 'failing'
      when not coalesce(s.active,false) then case when s.jobid is null then 'unavailable' else 'idle' end
      when s.prior_tick is not null and c.at>s.prior_tick+interval '12 minutes'
        and coalesce(l.started_at,'-infinity')<s.prior_tick-interval '5 minutes'
        and exists (
          select from private.non_doi_enrichment_queue q
          left join private.doi_enrichment_queue dq on dq.record_id=q.record_id
          where dq.status is distinct from 'verified' and q.status not in ('verified','processing')
            and ((q.publisher_status='pending' and q.publisher_next_attempt_at<=c.at)
            or (q.status='queued' and q.next_attempt_at<=c.at
              and q.publisher_status not in ('verified','processing','pending')
              and not exists(select from private.enrichment_provider_state p where p.provider='openalex' and p.retry_after>c.at)))
        ) then 'overdue'
      else 'idle' end,
    'schedule',s.schedule,'scheduleActive',s.active,'lastDispatch',s.dispatch_at,'lastDispatchStatus',s.dispatch_status,
    'nextRun',s.prior_tick+interval '1 hour','hourlyQueue',t.hourly_queue,
    'doiQueue',(select count(*) from private.doi_enrichment_queue where status in ('queued','processing')
      or (status in ('not_found','error') and datacite_status in ('pending','processing'))),
    'latestBatch',to_jsonb(l),'lastSuccess',th.last_success,'completedBatches',th.finished,
    'batchesAtTarget',th.at_target,
    'batchRuns',(select count(*) from private.enrichment_hourly_batches b
      where b.started_at>c.at-interval '7 days' and b.status in ('complete','failed')),
    'netPerHour',case when th.productive>=6 and th.net_reduction>0 and th.sample_end-th.sample_start>=interval '5 hours'
      then round(th.net_reduction*3600.0/extract(epoch from th.sample_end-th.sample_start),1) end,
    'etaHours',case when t.hourly_queue>0 and th.productive>=6 and th.net_reduction>0 and th.sample_end-th.sample_start>=interval '5 hours'
      then ceil(t.hourly_queue * extract(epoch from th.sample_end-th.sample_start)/(3600.0*th.net_reduction)) end,
    'providerRetryAfter',(select max(retry_after) from private.enrichment_provider_state where retry_after>c.at)
  )
) from clock c cross join totals t cross join schedule s cross join throughput th
left join latest l on true;
$$;
revoke all on function private.live_enrichment_report() from public, anon, authenticated;
