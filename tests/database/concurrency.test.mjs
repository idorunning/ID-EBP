import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// PGlite exercises real PostgreSQL transactions, constraints and procedures.
// It has one connection: these are deterministic overlap/idempotency regressions,
// not a claim to have measured independent PostgreSQL sessions or hosted Auth load.
const ids={member:'30000000-0000-4000-8000-000000000001',other:'30000000-0000-4000-8000-000000000002',admin:'30000000-0000-4000-8000-000000000003'};
const session=id=>id.replace(/^3/,'4');

test('database workflow isolation and repeat-request integrity',async t=>{
  const db=new PGlite();await db.waitReady;t.after(()=>db.close());
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,created_at timestamptz default now(),last_sign_in_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
    grant usage on schema public,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
  const folder=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
  for(const [name,id] of Object.entries(ids)){
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${name}@fixture.test`]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session(id),id]);
    await db.query('insert into private.member_profiles(user_id) values($1)',[id]);
  }
  await db.query("insert into private.admin_roles(user_id,state,must_set_password) values($1,'active',false)",[ids.admin]);
  for(let n=0;n<7;n++)await db.query(`insert into public.sources(slug,name,website_url,canonical_domain,about,country_code,kinds,content_types,research_languages,access_type,status)
    values($1,$2,$3,$4,'Public policing research fixture.','GB',array['University'],array['Original research'],array['en'],'free','published')`,[`fixture-${n}`,`Fixture ${n}`,`https://fixture-${n}.test`,`fixture-${n}.test`]);
  const source=(await db.query("select id from public.sources where slug='fixture-0'")).rows[0].id;
  const call=async(action,payload={},name=null)=>(await db.query('select public.directory_api($1,$2,$3,$4) as result',[action,JSON.stringify(payload),name?ids[name]:null,name?session(ids[name]):null])).rows[0].result;
  async function tx(run,{readOnly=false}={}){
    await db.exec(`begin${readOnly?' read only':''};set local role service_role;`);
    try{const result=await run();await db.exec('commit');return result;}catch(error){await db.exec('rollback');throw error;}
  }
  const rpc=(...args)=>tx(()=>call(...args));
  async function memberLocks(...names){
    // Inspect actual acquired locks. This verifies the cooperating procedures
    // use the same lock domain; multi-session waiting still needs PostgreSQL.
    for(const name of names)assert.equal((await db.query("select exists(select 1 from pg_locks where locktype='advisory' and classid=652827 and objid=(hashtext($1)::bigint & 4294967295) and granted) as held",[ids[name]])).rows[0].held,true);
  }

  await t.test('read-only public profile and community views do not lock writable rows',async()=>{
    await tx(async()=>{
      assert.equal((await call('profile',{slug:'fixture-0'})).profile.slug,'fixture-0');
      assert.equal((await call('source_community',{slug:'fixture-0'})).rating.count,0);
    },{readOnly:true});
  });

  await t.test('worker batches return exactly the records claimed by each call, even at one transaction timestamp',async()=>{
    for(let n=0;n<12;n++)await db.query("insert into private.workflow_outbox(event_key,recipient,subject,body) values($1,'test@fixture.test','Fixture','Local fixture only')",[`fixture:${n}`]);
    await tx(async()=>{
      const first=await call('outbox_take'),second=await call('outbox_take'),third=await call('outbox_take');
      assert.equal(first.messages.length,10);assert.equal(second.messages.length,2);assert.equal(third.messages.length,0);
      assert.equal(new Set([...first.messages,...second.messages].map(m=>m.id)).size,12);
      const a=await call('maintenance_take'),b=await call('maintenance_take'),c=await call('maintenance_take');
      assert.equal(a.jobs.length,5);assert.equal(b.jobs.length,2);assert.equal(c.jobs.length,0);
      assert.equal(new Set([...a.jobs,...b.jobs].map(j=>j.id)).size,7);
      assert.equal((await call('outbox_complete',{id:first.messages[0].id,lease:second.messages[0].lease,sent:true})).updated,false);
      assert.equal((await call('maintenance_complete',{id:a.jobs[0].id,lease:b.jobs[0].lease,result:{status:'working'}})).updated,false);
      assert.equal((await call('outbox_complete',{id:first.messages[0].id,lease:first.messages[0].lease,sent:true})).updated,true);
      assert.equal((await call('outbox_complete',{id:first.messages[0].id,lease:first.messages[0].lease,sent:true})).updated,false);
    });
  });

  await t.test('suspension prevents an outstanding claim from restoring management access',async()=>{
    const claim=await rpc('claim_source',{slug:'fixture-0',mailboxVerified:true,contactEmail:'member@fixture.test'},'member');
    await tx(async()=>{
      await call('admin_manage',{operation:'suspend_member',userId:ids.member,reason:'Suspended for local regression fixture'},'admin');
      await memberLocks('admin','member');
    });
    await assert.rejects(rpc('moderate',{kind:'claim',id:claim.claim.id,decision:'approve',independentCheck:true,verificationUrl:'https://fixture-0.test/about'},'admin'),{code:'42501'});
    assert.equal((await db.query('select state from private.source_claims where id=$1',[claim.claim.id])).rows[0].state,'review');
    assert.equal((await db.query('select count(*)::int as n from private.source_managers where user_id=$1',[ids.member])).rows[0].n,0);
    await rpc('admin_manage',{operation:'reinstate_member',userId:ids.member,reason:'Reinstated after local fixture review'},'admin');
    await tx(async()=>{
      await call('moderate',{kind:'claim',id:claim.claim.id,decision:'approve',independentCheck:true,verificationUrl:'https://fixture-0.test/about'},'admin');
      await memberLocks('admin','member');
    });
    assert.equal((await rpc('session',{},'member')).managedSources.length,1);
    await assert.rejects(rpc('moderate',{kind:'claim',id:claim.claim.id,decision:'approve',independentCheck:true,verificationUrl:'https://fixture-0.test/about'},'admin'),{code:'P0002'});
  });

  await t.test('the database prevents a second owner independently of application checks',async()=>{
    await assert.rejects(tx(()=>db.query("insert into private.source_managers(source_id,user_id,role,verified_email) values($1,$2,'owner','other@fixture.test')",[source,ids.other])),{code:'23505'});
  });

  await t.test('editor acceptance shares locks with suspension of the owner and recipient',async()=>{
    await rpc('invite_editor',{slug:'fixture-0',email:'other@fixture.test'},'member');
    const invitation=(await rpc('session',{},'other')).teamInvitations[0];
    await tx(async()=>{
      await call('accept_editor',{slug:'fixture-0',invitationId:invitation.id},'other');
      await memberLocks('member','other');
    });
    await tx(async()=>{
      await call('revoke_editor',{slug:'fixture-0',userId:ids.other},'member');
      await memberLocks('member','other');
    });
    assert.equal((await rpc('session',{},'other')).managedSources.length,0);
  });

  await t.test('repeated account/session requests and expired sessions preserve identity boundaries',async()=>{
    for(let n=0;n<30;n++)assert.equal((await rpc('session',{},'other')).admin,false);
    assert.equal((await db.query('select count(*)::int as n from private.member_profiles where user_id=$1',[ids.other])).rows[0].n,1);
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[session(ids.other)]);
    await assert.rejects(rpc('session',{},'other'),{code:'42501'});
    await db.query('update auth.sessions set not_after=null where id=$1',[session(ids.other)]);
  });

  await t.test('two revisions of one base cannot overwrite the first approved version',async()=>{
    const profile={name:'Revision A',about:'A reviewed public description for the first revision.'};
    const a=await rpc('edit_profile',{slug:'fixture-0',profile},'member');
    for(let n=0;n<4;n++)assert.equal((await rpc('edit_profile',{slug:'fixture-0',profile},'member')).revisionId,a.revisionId);
    assert.equal((await db.query("select count(*)::int as n from private.source_revisions where source_id=$1",[source])).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int as n from private.audit_events where actor_id=$1 and action='edit_profile'",[ids.member])).rows[0].n,1);
    await assert.rejects(tx(async()=>{
      await db.query('delete from private.source_managers where user_id=$1 and source_id=$2',[ids.member,source]);
      await call('edit_profile',{slug:'fixture-0',profile},'member');
    }),{code:'42501'});
    const b=await rpc('edit_profile',{slug:'fixture-0',profile:{...profile,name:'Revision B'}},'member');
    assert.notEqual(b.revisionId,a.revisionId);
    await tx(async()=>{
      await call('moderate',{kind:'revision',id:a.revisionId,decision:'approve'},'admin');
      await memberLocks('admin','member');
    });
    await assert.rejects(rpc('moderate',{kind:'revision',id:b.revisionId,decision:'approve'},'admin'),{code:'22023'});
    assert.equal((await rpc('profile',{slug:'fixture-0'})).profile.name,'Revision A');
    assert.equal((await db.query('select state from private.source_revisions where id=$1',[b.revisionId])).rows[0].state,'review');
  });

  await t.test('daily submission quotas persist across source URLs and acquire the member write lock',async()=>{
    const profile={name:'New research centre',about:'Public policing research from a test organisation.',country:'GB',languages:['en'],types:['University']};
    for(let n=0;n<5;n++)await tx(async()=>{
      await call('submit_source',{...profile,url:`https://new-${n}.test`},'other');
      await memberLocks('other');
    });
    await assert.rejects(rpc('submit_source',{...profile,url:'https://new-6.test'},'other'),error=>error.message==='rate_limited');
    assert.equal((await db.query('select count(*)::int as n from private.source_submissions where submitted_by=$1',[ids.other])).rows[0].n,5);
  });
});
