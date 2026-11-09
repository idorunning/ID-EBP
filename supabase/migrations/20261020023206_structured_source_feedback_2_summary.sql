create function private.feedback_summary(p_source uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with eligible as materialized (
  select f.* from private.source_feedback f join auth.users u on u.id=f.user_id where f.source_id=p_source and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
   and not exists(select 1 from private.member_profiles mp where mp.user_id=f.user_id and mp.state='suspended')
   and not exists(select 1 from private.source_managers m where m.source_id=f.source_id and m.user_id=f.user_id)
 ), totals as (
  select jsonb_build_object('schemaVersion',1,'contributors',count(*),'dimensions',jsonb_build_object(
   'usefulness',jsonb_build_object('answered',count(*) filter(where usefulness in ('very','somewhat','limited')),'unassessed',count(*) filter(where usefulness='unable'),'omitted',count(*) filter(where usefulness is null),'responses',jsonb_build_object('very',count(*) filter(where usefulness='very'),'somewhat',count(*) filter(where usefulness='somewhat'),'limited',count(*) filter(where usefulness='limited'))),
   'clarity',jsonb_build_object('answered',count(*) filter(where clarity in ('clear','mixed','unclear')),'unassessed',count(*) filter(where clarity='unable'),'omitted',count(*) filter(where clarity is null),'responses',jsonb_build_object('clear',count(*) filter(where clarity='clear'),'mixed',count(*) filter(where clarity='mixed'),'unclear',count(*) filter(where clarity='unclear'))),
   'traceability',jsonb_build_object('answered',count(*) filter(where traceability in ('easy','difficult','missing')),'unassessed',count(*) filter(where traceability='na'),'omitted',count(*) filter(where traceability is null),'responses',jsonb_build_object('easy',count(*) filter(where traceability='easy'),'difficult',count(*) filter(where traceability='difficult'),'missing',count(*) filter(where traceability='missing')))
  )) as data from eligible
 ), purpose_counts as (
  select p,(select count(*) from eligible e where p=any(e.purposes) and e.usefulness in ('very','somewhat')) as n from unnest(array['research','practice','teaching','policy','learning']) p
 ) select data||jsonb_build_object('purposes',(select jsonb_object_agg(p,n) from purpose_counts)) from totals;
$$;
revoke all on function private.feedback_summary(uuid) from public,anon,authenticated;
grant execute on function private.feedback_summary(uuid) to service_role;


