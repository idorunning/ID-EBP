-- Current provider allowance: 200 outbound messages/day. Reserve at most 150
-- authentication attempts and 50 workflow attempts in any rolling 24 hours.
-- Provider reset time is unknown, so calendar-midnight windows are unsafe.
-- Reservation history contains aggregate counts only and survives outbox edits.
create table private.email_delivery_reservations (
 id bigint generated always as identity primary key,
 channel text not null check(channel in ('auth','workflow')),
 reserved_at timestamptz not null default clock_timestamp(),
 amount integer not null check(amount between 1 and 150)
);
create index email_delivery_reservations_window on private.email_delivery_reservations(channel,reserved_at);
alter table private.email_delivery_reservations enable row level security;
revoke all on private.email_delivery_reservations from public,anon,authenticated,service_role;
grant select,insert on private.email_delivery_reservations to service_role;
revoke all on sequence private.email_delivery_reservations_id_seq from public,anon,authenticated,service_role;
grant usage,select on sequence private.email_delivery_reservations_id_seq to service_role;

-- Conservatively include recent workflow attempts from before this migration,
-- including uncertain/rejected deliveries. A later acknowledgement also counts.
insert into private.email_delivery_reservations(channel,reserved_at,amount)
 select 'workflow',greatest(leased_at,sent_at),1 from private.workflow_outbox
 where greatest(leased_at,sent_at)>=clock_timestamp()-interval '24 hours';

do $migration$
declare definition text; old_fragment text; new_fragment text;
begin
 select pg_get_functiondef('public.directory_api(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 old_fragment:=$old$ elsif p_action='outbox_take' then
$old$;
 new_fragment:=$new$ elsif p_action='reserve_auth_email' then
  count_rows:=coalesce((p_payload->>'limit')::integer,150);
  if count_rows not between 1 and 150 then raise exception 'Authentication email allowance exceeds provider budget' using errcode='22023';end if;
  -- Stable across session-secret rotation. Browser roles cannot execute this
  -- service-only RPC or access the ledger. Different channels are independent.
  perform pg_advisory_xact_lock(652828,1);
  if (select coalesce(sum(amount),0) from private.email_delivery_reservations where channel='auth' and reserved_at>=clock_timestamp()-interval '24 hours')>=count_rows then
   raise exception 'rate_limited' using errcode='P0001';
  end if;
  insert into private.email_delivery_reservations(channel,amount) values('auth',1);
  return jsonb_build_object('allowed',true);
 elsif p_action='outbox_take' then
  -- Lock before queue housekeeping and reservation, so competing cron events
  -- cannot both consume the same remaining allowance.
  perform pg_advisory_xact_lock(652828,2);
$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Email budget migration: expected outbox branch missing';end if;
 execute replace(definition,old_fragment,new_fragment);

 select pg_get_functiondef('public.directory_api(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 old_fragment:=$old$  with candidates as (
   select id from private.workflow_outbox where state='pending' and available_at<=now()
    order by available_at,created_at,id for update skip locked limit 10
  ), leased as (
   update private.workflow_outbox o set state='sending',lease=gen_random_uuid(),leased_at=now(),attempts=attempts+1
    from candidates c where o.id=c.id returning o.*
  )
  select jsonb_build_object('messages',coalesce(jsonb_agg(jsonb_build_object('id',id,'lease',lease,'to',recipient,'subject',subject,'text',body)),'[]'::jsonb)) into result from leased;
  return result;
$old$;
 new_fragment:=$new$  select greatest(0,least(10,50-coalesce(sum(amount),0)))::integer into count_rows
   from private.email_delivery_reservations where channel='workflow' and reserved_at>=clock_timestamp()-interval '24 hours';
  with candidates as (
   select id from private.workflow_outbox where state='pending' and available_at<=now()
    order by available_at,created_at,id for update skip locked limit count_rows
  ), leased as (
   update private.workflow_outbox o set state='sending',lease=gen_random_uuid(),leased_at=now(),attempts=attempts+1
    from candidates c where o.id=c.id returning o.*
  )
  select jsonb_build_object('messages',coalesce(jsonb_agg(jsonb_build_object('id',id,'lease',lease,'to',recipient,'subject',subject,'text',body)),'[]'::jsonb)) into result from leased;
  count_rows:=jsonb_array_length(result->'messages');
  if count_rows>0 then insert into private.email_delivery_reservations(channel,amount) values('workflow',count_rows);end if;
  -- Zero capacity leaves records pending with no lease/attempt increment. The
  -- five-minute scheduler picks them up once earlier reservations age out.
  -- These aggregates stay behind the existing internal service-only endpoint.
  select result||jsonb_build_object('budget',jsonb_build_object('limit',50,'windowHours',24,'used',coalesce(sum(amount),0),'remaining',greatest(0,50-coalesce(sum(amount),0)),
   'nextAvailableAt',case when coalesce(sum(amount),0)>=50 then min(reserved_at)+interval '24 hours' end)) into result
   from private.email_delivery_reservations where channel='workflow' and reserved_at>=clock_timestamp()-interval '24 hours';
  select result||jsonb_build_object('health',jsonb_build_object('pending',count(*) filter(where state='pending' and available_at<=now()),
   'held',count(*) filter(where state in ('uncertain','failed')),'oldestPendingAt',min(created_at) filter(where state='pending' and available_at<=now()))) into result
   from private.workflow_outbox;
  return result;
$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Email budget migration: expected bounded batch missing';end if;
 execute replace(definition,old_fragment,new_fragment);
end;
$migration$;
