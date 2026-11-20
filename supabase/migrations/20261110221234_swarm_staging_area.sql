-- Additive only: new isolated schema for crawl swarm output. Touches no existing object.
create schema if not exists staging;
revoke all on schema staging from public, anon, authenticated;

create table staging.swarm_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  run_kind text not null,               -- scout | harvest | repair | verify
  shard text,                           -- e.g. region or source slug batch
  firecrawl_credits_used int default 0,
  status text not null default 'running' check (status in ('running','passed','failed','partial')),
  error_rate numeric,
  notes text
);

create table staging.candidate_sources (
  id bigint generated always as identity primary key,
  run_id bigint references staging.swarm_runs(id),
  existing_source_id uuid,              -- set when enriching an existing public.sources row
  name text not null,
  legal_name text,
  parent_body text,
  website_url text not null,
  canonical_domain text not null,
  country_code text,
  publications_url text,
  terms_url text,
  licence_note text,
  public_contact_email text,            -- organisational/generic only, never personal
  contact_page_url text,
  contact_seen_at_url text,
  contact_seen_on date,
  about text,                           -- own words, never copied
  evidence_urls text[] not null default '{}',
  completeness numeric,                 -- 0..1 against the source completeness standard
  verifier_status text not null default 'unchecked' check (verifier_status in ('unchecked','passed','failed')),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected','promoted')),
  injection_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_domain, existing_source_id)
);

create table staging.candidate_records (
  id bigint generated always as identity primary key,
  run_id bigint references staging.swarm_runs(id),
  existing_record_id text,              -- set when filling gaps in an existing public.research_records row
  source_slug text,
  candidate_source_id bigint references staging.candidate_sources(id),
  title text not null,
  url text not null,
  canonical_url text not null,
  doi text,
  year int,
  authors text,                         -- as listed, or 'none listed'
  publication text,
  kind text,
  access text,
  tags text[] not null default '{}',
  summary text,                         -- original short summary, never a copied abstract
  evidence_url text not null,
  completeness numeric,
  verifier_status text not null default 'unchecked' check (verifier_status in ('unchecked','passed','failed')),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected','promoted')),
  injection_flag boolean not null default false,
  created_at timestamptz not null default now(),
  unique (canonical_url, existing_record_id)
);
create index on staging.candidate_records (source_slug);
create index on staging.candidate_records (doi) where doi is not null;

create table staging.crawl_frontier (
  canonical_domain text primary key,
  seed_from text,                       -- existing_source | society | what_works | citation | scout
  region text,
  last_crawled_at timestamptz,
  pages_crawled int not null default 0,
  priority int not null default 5,
  blocked_reason text                   -- robots.txt, paywall, injection etc
);

-- Strict isolation: nothing in staging is reachable from the API roles.
revoke all on all tables in schema staging from public, anon, authenticated;
alter default privileges in schema staging revoke all on tables from public, anon, authenticated;
alter table staging.swarm_runs enable row level security;
alter table staging.candidate_sources enable row level security;
alter table staging.candidate_records enable row level security;
alter table staging.crawl_frontier enable row level security;
