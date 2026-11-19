-- Aggregate registration/ownership funnel. No addresses, IPs, cookies, user IDs,
-- source IDs or verification codes are retained in analytics.
create table if not exists private.registration_funnel_daily (
  day date not null,
  event text not null check (event in (
    'verify_click','register_view','claim_view',
    'register_code_issued','claim_code_issued',
    'signin_code_verified','claim_submitted',
    'register_request_failed','claim_request_failed',
    'signin_verify_failed','claim_submit_failed'
  )),
  count bigint not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key(day,event)
);
alter table private.registration_funnel_daily enable row level security;
revoke all on private.registration_funnel_daily from public, anon, authenticated;
grant select, insert, update on private.registration_funnel_daily to service_role;

create or replace function public.directory_funnel_record(p_event text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
 if p_event not in (
   'verify_click','register_view','claim_view',
   'register_code_issued','claim_code_issued',
   'signin_code_verified','claim_submitted',
   'register_request_failed','claim_request_failed',
   'signin_verify_failed','claim_submit_failed'
 ) or p_event is null then
   raise exception 'Unsupported aggregate metric' using errcode='22023';
 end if;
 insert into private.registration_funnel_daily(day,event,count)
 values ((now() at time zone 'UTC')::date,p_event,1)
 on conflict(day,event) do update
 set count=private.registration_funnel_daily.count+1,updated_at=now();
 return jsonb_build_object('recorded',true);
end;
$$;
revoke all on function public.directory_funnel_record(text) from public, anon, authenticated;
grant execute on function public.directory_funnel_record(text) to service_role;

create or replace function public.directory_funnel_report(p_days integer default 28)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  days integer := greatest(1,least(90,coalesce(p_days,28)));
  today date := (now() at time zone 'UTC')::date;
  since_day date;
begin
  since_day:=today-days+1;
  return jsonb_build_object(
    'status','connected',
    'startDate',since_day,
    'endDate',today,
    'retrievedAt',now(),
    'totals',coalesce((
      select jsonb_object_agg(event,total) from (
        select event,sum(count) as total
        from private.registration_funnel_daily
        where day between since_day and today
        group by event
      ) event_totals
    ),'{}'::jsonb),
    'daily',coalesce((
      select jsonb_agg(jsonb_build_object('date',day,'event',event,'count',count) order by day,event)
      from private.registration_funnel_daily
      where day between since_day and today
    ),'[]'::jsonb),
    'newAccounts',(
      select count(*) from auth.users
      where created_at >= since_day::timestamp at time zone 'UTC'
        and created_at < (today+1)::timestamp at time zone 'UTC'
    ),
    'claimsSubmitted',(
      select count(*) from private.source_claims
      where created_at >= since_day::timestamp at time zone 'UTC'
        and created_at < (today+1)::timestamp at time zone 'UTC'
    ),
    'claimsApproved',(
      select count(*) from private.source_claims
      where state='accepted' and decided_at >= since_day::timestamp at time zone 'UTC'
        and decided_at < (today+1)::timestamp at time zone 'UTC'
    ),
    'claimsPending',(
      select count(*) from private.source_claims where state in ('review','pending')
    )
  );
end;
$$;
revoke all on function public.directory_funnel_report(integer) from public, anon, authenticated;
grant execute on function public.directory_funnel_report(integer) to service_role;
