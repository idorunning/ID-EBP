alter table private.enrichment_hourly_batches add column chunk_until timestamptz;

create function private.claim_enrichment_chunk(batch uuid) returns integer
language sql set search_path='' as $$
  update private.enrichment_hourly_batches
  set chunk_until=now()+interval '2 minutes',lease_until=now()+interval '20 minutes'
  where id=batch and status='running' and lease_until>now()
    and (chunk_until is null or chunk_until<=now())
  returning greatest(target-attempted,0);
$$;

create function private.advance_enrichment_chunk(batch uuid) returns jsonb
language plpgsql set search_path='' as $$
declare info private.enrichment_hourly_batches%rowtype;
declare request_id bigint;
begin
  perform pg_advisory_xact_lock(68130920);
  update private.enrichment_hourly_batches set chunk_until=null
  where id=batch and status='running' returning * into info;
  if info.id is null then return null; end if;
  if info.attempted>=info.target or not exists (
    select from private.non_doi_enrichment_queue q
    where q.status not in ('verified','processing') and (
      (q.publisher_status='pending' and q.publisher_next_attempt_at<=now()) or
      (q.status='queued' and q.next_attempt_at<=now()
       and q.publisher_status not in ('verified','processing','pending')
       and (select count(*) from private.enrichment_hourly_results
             where batch_id=batch and method='openalex') < 35
       and exists (select from private.enrichment_provider_state
             where provider='openalex' and retry_after<=now()))
    ) and not exists (select from private.doi_enrichment_queue d
      where d.record_id=q.record_id and d.status='verified')
      and not exists (select from private.enrichment_hourly_results e
        where e.batch_id=batch and e.record_id=q.record_id)
  ) then
    return private.finish_enrichment_hourly_batch(batch,null);
  end if;
  request_id := net.http_post(
    url:='https://hvwmystbqlocjixvwgfl.supabase.co/functions/v1/non-doi-openalex',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-token',
      (select decrypted_secret from vault.decrypted_secrets where name='doi_enrichment_cron_token' limit 1)),
    body:=jsonb_build_object('batch',batch),timeout_milliseconds:=90000);
  return to_jsonb(info)||jsonb_build_object('continuation_request',request_id);
end;
$$;
revoke all on function private.claim_enrichment_chunk(uuid),private.advance_enrichment_chunk(uuid)
from public,anon,authenticated;
