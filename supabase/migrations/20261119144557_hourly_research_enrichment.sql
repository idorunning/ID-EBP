create table private.enrichment_provider_state (
  provider text primary key,
  retry_after timestamptz not null default now(),
  consecutive_failures integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);
insert into private.enrichment_provider_state(provider) values ('openalex');

create table private.enrichment_hourly_batches (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  lease_until timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('running','complete','failed')),
  target integer not null check (target between 1 and 250),
  attempted integer not null default 0,
  verified integer not null default 0,
  updated integer not null default 0,
  deferred integer not null default 0,
  failed integer not null default 0,
  exceptions integer not null default 0,
  remaining integer,
  error text
);
create index enrichment_hourly_batches_started_idx on private.enrichment_hourly_batches(started_at desc);

create table private.enrichment_hourly_results (
  batch_id uuid not null references private.enrichment_hourly_batches(id),
  record_id text not null,
  method text not null check (method in ('publisher','openalex')),
  status text not null,
  note text not null,
  evidence_url text,
  updated_fields text[] not null,
  checked_at timestamptz not null default now(),
  primary key(batch_id, record_id)
);
alter table private.enrichment_provider_state enable row level security;
alter table private.enrichment_hourly_batches enable row level security;
alter table private.enrichment_hourly_results enable row level security;
revoke all on private.enrichment_provider_state, private.enrichment_hourly_batches,
  private.enrichment_hourly_results from public, anon, authenticated;

create function private.enrichment_hourly_remaining() returns integer
language sql stable set search_path='' as $$
  select count(*)::integer from private.non_doi_enrichment_queue q
  where q.status <> 'verified' and q.publisher_status <> 'verified'
    and (q.status in ('queued','processing') or q.publisher_status in ('pending','processing'))
    and not exists (select from private.doi_enrichment_queue d
      where d.record_id=q.record_id and d.status='verified');
$$;

create function private.start_enrichment_hourly_batch(target_count integer) returns uuid
language plpgsql set search_path='' as $$
declare batch uuid;
begin
  if not pg_try_advisory_xact_lock(68130920) then return null; end if;
  update private.enrichment_hourly_batches
  set status='failed',finished_at=now(),error='Worker lease expired before completion',
      remaining=private.enrichment_hourly_remaining()
  where status='running' and lease_until<=now();
  if exists (select from private.enrichment_hourly_batches where status='running')
     or not exists (
       select from private.non_doi_enrichment_queue q
       where q.status not in ('verified','processing') and (
         (q.publisher_status='pending' and q.publisher_next_attempt_at<=now()) or
         (q.status='queued' and q.next_attempt_at<=now()
          and q.publisher_status not in ('verified','processing','pending')
          and exists (select from private.enrichment_provider_state
            where provider='openalex' and retry_after<=now()))
       ) and not exists (select from private.doi_enrichment_queue d
         where d.record_id=q.record_id and d.status='verified')
     )
  then return null; end if;
  insert into private.enrichment_hourly_batches(status,target,lease_until)
  values ('running',target_count,now()+interval '4 minutes') returning id into batch;
  return batch;
end;
$$;

create function private.finish_enrichment_hourly_batch(batch uuid, failure text) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb;
begin
  perform pg_advisory_xact_lock(68130920);
  update private.enrichment_hourly_batches b
  set status=case when failure is null then 'complete' else 'failed' end,
      finished_at=now(),error=failure,remaining=private.enrichment_hourly_remaining()
  where id=batch and status='running'
  returning to_jsonb(b) into result;
  return result;
end;
$$;
revoke all on function private.enrichment_hourly_remaining(),
  private.start_enrichment_hourly_batch(integer),
  private.finish_enrichment_hourly_batch(uuid,text) from public,anon,authenticated;
