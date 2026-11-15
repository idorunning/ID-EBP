import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '../helpers/database.mjs';

const ids={member:'10000000-0000-4000-8000-000000000001',owner:'10000000-0000-4000-8000-000000000002',other:'10000000-0000-4000-8000-000000000003',admin:'10000000-0000-4000-8000-000000000004',unconfirmed:'10000000-0000-4000-8000-000000000005'};
const session=id=>id.replace(/^1/,'2');
test('security audit regression scenarios',async t=>{
  const db=new PGlite();await db.waitReady;t.after(()=>db.close());
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,created_at timestamptz default now(),last_sign_in_at timestamptz,encrypted_password text);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
    grant usage on schema public,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
  const folder=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
  for(const [name,id] of Object.entries(ids)){
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[id,name==='owner'?'researcher@university.test':name+'@mail.test',name==='unconfirmed'?null:new Date().toISOString()]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session(id),id]);
  }
  const source=(await db.query(`insert into public.sources(slug,name,website_url,canonical_domain,about,country_code,kinds,content_types,research_languages,access_type,status)
    values('university-fixture','University research','https://university.test/research','university.test','Published research from a test university.','GB',array['University'],array['Original research'],array['en'],'free','published') returning id`)).rows[0].id;
  await db.query('insert into public.source_signals(source_id) values($1)',[source]);
  await db.query("insert into private.admin_roles(user_id,state,must_set_password) values($1,'active',false)",[ids.admin]);
  const rpc=async(action,payload={},name='member',aal='aal1',overrideSession)=>{
    await db.exec('begin;set local role service_role;');
    try{const result=(await db.query('select public.directory_api($1,$2,$3,$4,$5) as result',[action,JSON.stringify(payload),name?ids[name]:null,name?(overrideSession||session(ids[name])):null,aal])).rows[0].result;await db.exec('commit');return result;}catch(error){await db.exec('rollback');throw error;}
  };
  await t.test('expired editor invitation can be replaced and accepted once',async()=>{
    await db.query("insert into private.source_managers(source_id,user_id,role,verified_email) values($1,$2,'owner','researcher@university.test')",[source,ids.owner]);
    await rpc('invite_editor',{slug:'university-fixture',email:'member@mail.test'},'owner');
    const old=(await db.query("select id from private.source_team_invitations where email='member@mail.test'")).rows[0];
    await db.query("update private.source_team_invitations set expires_at=now()-interval '1 day' where id=$1",[old.id]);
    await assert.rejects(rpc('accept_editor',{slug:'university-fixture',invitationId:old.id}),{code:'42501'});
    await rpc('invite_editor',{slug:'university-fixture',email:'member@mail.test'},'owner');
    const invite=(await rpc('team',{slug:'university-fixture'},'owner')).invitations.find(i=>i.email==='member@mail.test');assert.notEqual(invite.id,old.id);
    await rpc('accept_editor',{slug:'university-fixture',invitationId:invite.id});
    await assert.rejects(rpc('accept_editor',{slug:'university-fixture',invitationId:invite.id}),{code:'42501'});
  });
  const invite=()=>rpc('admin_manage',{operation:'invite_admin',email:'other@mail.test',reason:'Authorised fixture invitation'},'admin');
  await t.test('expired and cancelled admin invitations cannot grant access',async()=>{
    await invite();await db.query("update private.admin_invitations set expires_at=now()-interval '1 second' where email='other@mail.test'");
    assert.equal((await rpc('session',{},'other')).admin,false);
    await invite();await rpc('admin_manage',{operation:'revoke_admin_invitation',email:'other@mail.test',reason:'Cancel fixture invitation'},'admin');
    assert.equal((await rpc('session',{},'other')).admin,false);
  });
  await t.test('issuer removal or suspension prevents administrator grants',async()=>{
    await db.query("insert into private.admin_roles(user_id,state,must_set_password) values($1,'active',false)",[ids.member]);
    await invite();await db.query('delete from private.admin_roles where user_id=$1',[ids.admin]);
    assert.equal((await rpc('session',{},'other')).admin,false);
    assert.equal((await db.query("select state from private.admin_invitations where email='other@mail.test'")).rows[0].state,'revoked');
    await db.query("insert into private.admin_roles(user_id,state,must_set_password) values($1,'active',false)",[ids.admin]);
    await invite();await db.query("insert into private.member_profiles(user_id,state) values($1,'suspended') on conflict(user_id) do update set state='suspended'",[ids.admin]);
    assert.equal((await rpc('session',{},'other')).admin,false);
    await db.query("update private.member_profiles set state='active' where user_id=$1",[ids.admin]);
  });
  await t.test('an interrupted password acknowledgement reconciles without accepting uncommitted changes',async()=>{
    await invite();assert.equal((await rpc('session',{},'other')).passwordChangeRequired,true);
    await assert.rejects(rpc('password_changed',{},'other'),{code:'40001'});
    await rpc('password_change_begin',{},'other');await assert.rejects(rpc('password_changed',{},'other'),{code:'40001'});
    await db.query("update auth.users set encrypted_password='synthetic-auth-hash' where id=$1",[ids.other]);
    assert.equal((await rpc('session',{},'other')).passwordChangeRequired,false);
    assert.equal((await rpc('password_change_begin',{},'other')).reconciled,true);
    assert.equal((await rpc('password_changed',{},'other')).updated,true);
    assert.equal((await db.query("select count(*)::int as n from private.audit_events where actor_id=$1 and action='password_changed'",[ids.other])).rows[0].n,1);
  });
});
