create schema if not exists staging;
-- Applied in production 18 November 2026. Staging-only background source discovery.
create table if not exists staging.web_source_searches(
 id bigint generated always as identity primary key,
 stream text not null check(stream in ('sources','institutions','publishers')),
 term text not null check(length(term) between 3 and 150),
 active boolean not null default true,
 last_searched_at timestamptz,
 next_search_at timestamptz not null default now(),
 consecutive_errors integer not null default 0,
 total_results integer not null default 0,
 last_error text,
 unique(stream,term)
);
create index if not exists web_source_searches_ready on staging.web_source_searches(active,next_search_at,id);
create table if not exists staging.web_source_candidates(
 provider_id text primary key,
 entity_type text not null check(entity_type in ('journal','repository','conference','institution','publisher','society','institute','other')),
 suggested_category text not null,
 name text not null,
 website_url text,
 canonical_domain text,
 country_code text,
 works_count integer,
 evidence_url text not null,
 first_query text not null,
 provider text not null default 'OpenAlex',
 raw_metadata jsonb not null default '{}'::jsonb,
 review_status text not null default 'pending' check(review_status in ('pending','already_listed','needs_identity_check','approved','rejected')),
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 seen_count integer not null default 1,
 notes text
);
create index if not exists web_source_candidates_review on staging.web_source_candidates(review_status,entity_type,last_seen_at);
create index if not exists web_source_candidates_domain on staging.web_source_candidates(canonical_domain);
create table if not exists staging.web_source_search_runs(
 id bigint generated always as identity primary key,
 search_id bigint references staging.web_source_searches(id),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 result_status text not null default 'running' check(result_status in ('running','passed','empty','rate_limited','failed')),
 candidates_seen integer not null default 0,
 candidates_new integer not null default 0,
 error_detail text
);
create table if not exists private.enrichment_daily_checkpoint(
 as_of date primary key,
 captured_at timestamptz not null default now(),
 catalogue_total integer not null,
 sources_published integer not null,
 search_documents integer not null,
 doi_verified integer not null,
 doi_queued integer not null,
 non_doi_verified integer not null,
 non_doi_queued integer not null,
 publisher_verified integer not null,
 pending_source_candidates integer not null
);
alter table staging.web_source_searches enable row level security;
alter table staging.web_source_candidates enable row level security;
alter table staging.web_source_search_runs enable row level security;
alter table private.enrichment_daily_checkpoint enable row level security;
revoke all on staging.web_source_searches,staging.web_source_candidates,staging.web_source_search_runs,private.enrichment_daily_checkpoint from anon,authenticated;
insert into staging.web_source_searches(stream,term) values
('sources','policing'),('sources','police science'),('sources','criminology'),('sources','criminal justice'),('sources','crime prevention'),('sources','law enforcement'),('sources','victimology'),('sources','community safety'),('sources','police research'),('sources','public safety'),('sources','evidence based policing'),
('institutions','policing'),('institutions','police research'),('institutions','criminology'),('institutions','criminal justice'),('institutions','crime prevention'),('institutions','public safety'),('institutions','law enforcement'),('institutions','policing research centre'),('institutions','criminal justice research'),
('publishers','policing'),('publishers','criminology'),('publishers','criminal justice'),('publishers','police'),('publishers','victimology')
on conflict(stream,term) do nothing;