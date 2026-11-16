-- pg_cron/pg_net are installed on the live project; skipped where unavailable (local PGlite tests).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then create extension if not exists pg_cron; end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
end $$;

create table if not exists staging.openalex_state (
  term text primary key,
  cursor text not null default '*',
  done boolean not null default false,
  works_seen integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table staging.openalex_state enable row level security;

insert into staging.openalex_state(term) values
 ('police'),('policing'),('law enforcement'),('constabulary'),('police officers'),
 ('crime prevention evaluation'),('hot spots policing'),('procedural justice police'),
 ('body-worn cameras'),('stop and search'),('problem-oriented policing'),('community policing')
on conflict do nothing;

create index if not exists candidate_records_doi_idx on staging.candidate_records (lower(doi));
create index if not exists candidate_records_canon_idx on staging.candidate_records (canonical_url);
