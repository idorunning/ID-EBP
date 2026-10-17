import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('email reservations enforce independent rolling provider budgets',async t=>{
 const db=new PGlite();await db.waitReady;t.after(()=>db.close());
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
  create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,created_at timestamptz default now(),last_sign_in_at timestamptz);
  create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
  grant usage on schema public,auth to anon,authenticated,service_role;
  create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
  alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
 const folder=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(folder)).filter(file=>file.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
 const call=async(action,payload={})=>{
  await db.exec('savepoint rpc;set local role service_role;');
  try{const result=(await db.query('select public.directory_api($1,$2) as result',[action,JSON.stringify(payload)])).rows[0].result;await db.exec('reset role;release savepoint rpc;');return result;}
  catch(error){await db.exec('rollback to savepoint rpc;release savepoint rpc;');throw error;}
 };
 const scenario=async run=>{await db.exec('begin');try{await run();}finally{await db.exec('rollback');}};
 const seed=async count=>db.query("insert into private.workflow_outbox(event_key,recipient,subject,body) select 'budget-fixture:'||n,'local@fixture.test','Fixture','Synthetic local message' from generate_series(1,$1::int) n",[count]);
 const used=async channel=>Number((await db.query('select coalesce(sum(amount),0) as used from private.email_delivery_reservations where channel=$1',[channel])).rows[0].used);

 await t.test('150 authentication attempts reserve capacity; attempt151 and an enlarged ceiling are rejected',()=>scenario(async()=>{
  for(let n=0;n<150;n++)assert.equal((await call('reserve_auth_email',{limit:150})).allowed,true);
  await assert.rejects(call('reserve_auth_email',{limit:150}),error=>error.code==='P0001'&&error.message==='rate_limited');
  await assert.rejects(call('reserve_auth_email',{limit:151}),{code:'22023'});assert.equal(await used('auth'),150);
  assert.equal((await db.query("select exists(select 1 from pg_locks where locktype='advisory' and classid=652828 and objid=1 and granted) as held")).rows[0].held,true);
 }));

 await t.test('smaller configured authentication allowance cannot consume the separate workflow reserve',()=>scenario(async()=>{
  for(let n=0;n<25;n++)await call('reserve_auth_email',{limit:25});
  await assert.rejects(call('reserve_auth_email',{limit:25}),error=>error.message==='rate_limited');
  await seed(10);assert.equal((await call('outbox_take')).messages.length,10);assert.equal(await used('auth'),25);assert.equal(await used('workflow'),10);
 }));

 await t.test('50 workflow attempts leave excess messages pending and report the deferred backlog',()=>scenario(async()=>{
  await seed(65);const ids=[];
  for(let n=0;n<5;n++){const batch=await call('outbox_take');assert.equal(batch.messages.length,10);ids.push(...batch.messages.map(message=>message.id));}
  const blocked=await call('outbox_take');assert.equal(blocked.messages.length,0);assert.equal(blocked.budget.used,50);assert.equal(blocked.budget.remaining,0);assert.equal(blocked.health.pending,15);assert.ok(blocked.budget.nextAvailableAt);assert.ok(blocked.health.oldestPendingAt);
  assert.equal(new Set(ids).size,50);assert.equal(await used('workflow'),50);
  const untouched=(await db.query("select count(*)::int as n from private.workflow_outbox where state='pending' and attempts=0 and lease is null and leased_at is null")).rows[0].n;assert.equal(untouched,15);
  assert.equal((await db.query("select exists(select 1 from pg_locks where locktype='advisory' and classid=652828 and objid=2 and granted) as held")).rows[0].held,true);
 }));

 await t.test('partial capacity claims only that many records and failures do not refund reservations',()=>scenario(async()=>{
  await db.exec("insert into private.email_delivery_reservations(channel,amount) values('workflow',46)");await seed(10);
  const batch=await call('outbox_take');assert.equal(batch.messages.length,4);assert.equal(batch.health.pending,6);assert.equal(batch.budget.remaining,0);
  for(const message of batch.messages)await call('outbox_complete',{id:message.id,lease:message.lease,sent:false});
  const blocked=await call('outbox_take');assert.equal(blocked.messages.length,0);assert.equal(blocked.health.held,4);assert.equal(blocked.health.pending,6);assert.equal(await used('workflow'),50);
  await db.exec("delete from private.workflow_outbox where state='uncertain'");assert.equal((await call('outbox_take')).messages.length,0);assert.equal(await used('workflow'),50);
 }));

 await t.test('capacity does not reset at calendar midnight and returns only after reservations age24hours',()=>scenario(async()=>{
  await db.exec("insert into private.email_delivery_reservations(channel,amount,reserved_at) values('auth',150,(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')-interval '1 microsecond'),('workflow',50,(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')-interval '1 microsecond')");await seed(10);
  await assert.rejects(call('reserve_auth_email',{limit:150}),error=>error.message==='rate_limited');assert.equal((await call('outbox_take')).messages.length,0);
  await db.exec("update private.email_delivery_reservations set reserved_at=clock_timestamp()-interval '24 hours 1 second'");
  assert.equal((await call('reserve_auth_email',{limit:150})).allowed,true);const available=await call('outbox_take');assert.equal(available.messages.length,10);assert.equal(available.budget.remaining,40);
 }));

 await t.test('empty queue reserves nothing and browser roles cannot inspect or alter the ledger',()=>scenario(async()=>{
  const empty=await call('outbox_take');assert.equal(empty.messages.length,0);assert.equal(empty.budget.remaining,50);assert.equal(await used('workflow'),0);
  for(const role of ['anon','authenticated']){
   assert.equal((await db.query("select has_table_privilege($1,'private.email_delivery_reservations','SELECT') as allowed",[role])).rows[0].allowed,false);
   assert.equal((await db.query("select has_function_privilege($1,'public.directory_api(text,jsonb,uuid,uuid,text)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
  }
  assert.equal((await db.query("select has_table_privilege('service_role','private.email_delivery_reservations','UPDATE') or has_table_privilege('service_role','private.email_delivery_reservations','DELETE') as allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select relrowsecurity as enabled from pg_class where oid='private.email_delivery_reservations'::regclass")).rows[0].enabled,true);
 }));
});
