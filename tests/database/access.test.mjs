import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { SOURCES } from '../../public/data.js';
import { PGlite } from '@electric-sql/pglite';

// All identities and addresses below are disposable local fixtures, never seeds.
const users={member:'00000000-0000-4000-8000-000000000001',manager:'00000000-0000-4000-8000-000000000002',admin:'00000000-0000-4000-8000-000000000003',secondAdmin:'00000000-0000-4000-8000-000000000004'};

test('directory database permission and integrity checks',async t=>{
  const db=new PGlite();
  await db.waitReady;
  t.after(()=>db.close());
  // Mimic the Supabase roles and permissive default grants. Auth itself and the
  // signature validation performed by PostgREST are not simulated by this test.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,created_at timestamptz default now(),last_sign_in_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    grant usage on schema public,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
    $$;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
  `);
  const folder=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort()){
    const sql=await readFile(new URL(file,folder),'utf8');
    await db.exec(`begin;\n${sql}\ncommit;`);
  }
  const seed=await readFile(new URL('../../supabase/seed.sql',import.meta.url),'utf8');
  await db.exec(seed);
  for(const id of Object.values(users)) await db.query('insert into auth.users(id) values($1)',[id]);
  const listed=(await db.query("select id,slug from public.sources order by slug")).rows;
  const first=listed[0].id, second=listed[1].id;
  const hidden=(await db.query(`insert into public.sources(slug,name,website_url,canonical_domain,about,country_code,kinds,content_types,research_languages,access_type,status)
    values('private-fixture','Private fixture','https://example.test/','example.test','Local test only','GB',array['Academic'],array['Original research'],array['en'],'free','draft') returning id`)).rows[0].id;
  await db.query('insert into private.source_contacts(source_id,contact_email) values($1,$2)',[hidden,'private@example.test']);
  await db.query("insert into private.source_managers(source_id,user_id,role,verified_email) values($1,$2,$3,'manager@example.test')",[hidden,users.manager,'owner']);
  await db.query("insert into private.admin_roles(user_id,state,must_set_password) values($1,'active',false)",[users.admin]);
  await db.query('insert into public.source_signals(source_id,eligible_recommendations) values($1,999)',[hidden]);
  await db.query(`insert into public.source_links(source_id,kind,url,target_source_id) values
    ($1,'social','https://example.test/public-social',null),
    ($1,'reference','https://example.test/private-link',$2),
    ($2,'social','https://example.test/private-social',null)`,[first,hidden]);
  await db.query(`insert into public.source_translations(source_id,locale,about,origin,reviewed_at) values
    ($1,'fr','Reviewed public description','human_translation',now()),
    ($1,'es','Unreviewed description','source',null),
    ($1,'de','Machine draft even with a timestamp','machine_draft',now()),
    ($2,'it','Private description','human_translation',now())`,[first,hidden]);
  await db.query('insert into public.saved_sources(user_id,source_id) values($1,$2),($3,$4)',[users.member,first,users.manager,second]);

  async function as(role,user,run){
    assert.ok(['anon','authenticated','service_role','postgres'].includes(role));
    await db.exec(`begin; set local role ${role};`);
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(user?{sub:user,role}:{role})]);
    try{return await run(db);}finally{await db.exec('rollback');}
  }
  const denied=async(role,user,sql,values=[])=>assert.rejects(as(role,user,d=>d.query(sql,values)),{code:'42501'});

  await t.test('anonymous visitors see published sources and only public related records',async()=>{
    await as('anon',null,async d=>{
      assert.equal((await d.query('select * from public.sources')).rows.length,SOURCES.length);
      assert.equal((await d.query('select * from public.sources where id=$1',[hidden])).rows.length,0);
      assert.equal((await d.query('select * from public.source_links')).rows.length,1);
      assert.deepEqual((await d.query('select locale from public.source_translations')).rows,[{locale:'fr'}]);
      assert.equal((await d.query('select * from public.source_signals')).rows.length,SOURCES.length);
    });
  });

  await t.test('private contacts, claims, verification and account records are inaccessible to clients',async()=>{
    const tables=['source_contacts','source_managers','admin_roles','source_verifications','source_claims','source_revisions','recommendations','audit_events','communication_queue','newsletter_subscribers'];
    for(const table of tables){
      await denied('anon',null,`select * from private.${table}`);
      await denied('authenticated',users.member,`select * from private.${table}`);
    }
    await denied('anon',null,'select * from public.saved_sources');
  });

  await t.test('each member sees and removes only their own saved sources',async()=>{
    await as('authenticated',users.member,async d=>{
      assert.deepEqual((await d.query('select source_id from public.saved_sources')).rows,[{source_id:first}]);
      assert.equal((await d.query('delete from public.saved_sources where user_id=$1 returning source_id',[users.manager])).rows.length,0);
      assert.equal((await d.query('delete from public.saved_sources where user_id=$1 returning source_id',[users.member])).rows.length,1);
    });
    await as('authenticated',users.manager,async d=>assert.deepEqual((await d.query('select source_id from public.saved_sources')).rows,[{source_id:second}]));
  });

  await t.test('members can save published sources but cannot impersonate another user or save private drafts',async()=>{
    await as('authenticated',users.member,async d=>assert.equal((await d.query('insert into public.saved_sources(user_id,source_id) values($1,$2) returning source_id',[users.member,second])).rows.length,1));
    await denied('authenticated',users.member,'insert into public.saved_sources(user_id,source_id) values($1,$2)',[users.manager,first]);
    await denied('authenticated',users.member,'insert into public.saved_sources(user_id,source_id) values($1,$2)',[users.member,hidden]);
    await denied('authenticated',null,'insert into public.saved_sources(user_id,source_id) values($1,$2)',[users.member,second]);
  });

  await t.test('members, source managers and administrators cannot bypass the server workflows',async()=>{
    for(const user of [users.member,users.manager,users.admin]){
      await denied('authenticated',user,"update public.sources set status='published' where id=$1",[hidden]);
      await denied('authenticated',user,'update public.source_signals set eligible_recommendations=500 where source_id=$1',[first]);
      await denied('authenticated',user,"insert into private.admin_roles(user_id,state,must_set_password) values($1,'active',false)",[users.secondAdmin]);
      await denied('authenticated',user,"insert into private.recommendations(user_id,source_id,eligible) values($1,$2,true)",[user,first]);
      await as('authenticated',user,async d=>assert.equal((await d.query('select * from public.sources where id=$1',[hidden])).rows.length,0));
    }
  });

  await t.test('privileged service can manage source data and append audit records but cannot rewrite history',async()=>{
    await as('service_role',null,async d=>{
      assert.equal((await d.query('select * from private.source_contacts where source_id=$1',[hidden])).rows[0].contact_email,'private@example.test');
      assert.equal((await d.query("update public.sources set name='Edited privately' where id=$1 returning id",[hidden])).rows.length,1);
      await d.query("insert into private.audit_events(actor_id,action,target_id,reason) values($1,'source_edit',$2,'Local test')",[users.admin,hidden]);
    });
    for(const sql of ["update private.audit_events set reason='altered'",'delete from private.audit_events','truncate private.audit_events']) await denied('service_role',null,sql);
    await denied('service_role',null,'truncate public.sources cascade');
    await denied('service_role',null,'truncate public.source_signals');
    await denied('service_role',null,'truncate private.admin_roles');
  });

  await t.test('the last enabled administrator cannot be suspended, removed or deleted through Auth',async()=>{
    const mutations=[
      ["update private.admin_roles set state='suspended' where user_id=$1",'service_role'],
      ['update private.admin_roles set must_set_password=true where user_id=$1','service_role'],
      ['delete from private.admin_roles where user_id=$1','service_role'],
      ['delete from auth.users where id=$1','postgres']
    ];
    for(const [sql,role] of mutations) await assert.rejects(as(role,null,d=>d.query(sql,[users.admin])),{code:'23514'});
    await as('service_role',null,async d=>{
      await d.query("insert into private.admin_roles(user_id,state,must_set_password) values($1,'active',false)",[users.secondAdmin]);
      assert.equal((await d.query('delete from private.admin_roles where user_id=$1 returning user_id',[users.admin])).rows.length,1);
    });
  });

  await t.test('database guards reject invalid URLs, country codes, language tokens and public-contact shapes',async()=>{
    for(const [column,value] of [['website_url','javascript:alert(1)'],['website_url','https://user@example.test/'],['country_code','uk'],['canonical_domain','EXAMPLE.TEST']]){
      await assert.rejects(as('service_role',null,d=>d.query(`update public.sources set ${column}=$1 where id=$2`,[value,hidden])),{code:'23514'});
    }
    await assert.rejects(as('service_role',null,d=>d.query("update public.sources set research_languages=array['Mandarin Chinese'] where id=$1",[hidden])),{code:'23514'});
    await assert.rejects(as('service_role',null,d=>d.query("update public.sources set approved_public_contacts='{}'::jsonb where id=$1",[hidden])),{code:'23514'});
    await as('service_role',null,async d=>{
      await d.query("update public.sources set research_languages=array['en','fr-CA','zh-Hans'],summary_languages=array['es'],updated_at='2000-01-01' where id=$1",[hidden]);
      assert.ok(new Date((await d.query('select updated_at from public.sources where id=$1',[hidden])).rows[0].updated_at).getFullYear()>2000);
    });
  });

  await t.test('all application tables enable RLS and helper functions are not callable by client roles',async()=>{
    assert.deepEqual((await db.query("select c.relname from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity")).rows,[]);
    for(const role of ['anon','authenticated','service_role']){
      assert.deepEqual((await db.query("select p.proname from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='private' and (p.proname not in ('directory_core','directory_access','directory_reports','directory_saved') or $1<>'service_role') and has_function_privilege($1,p.oid,'EXECUTE')",[role])).rows,[]);
    }
  });

  await t.test('editorial seed is repeatable and preserves edits, with no invented ownership or recommendations',async()=>{
    await db.exec(seed);
    assert.equal((await db.query('select count(*)::int as count from public.sources')).rows[0].count,SOURCES.length+1);
    assert.equal((await db.query("select count(*)::int as count from public.source_signals ss join public.sources s on s.id=ss.source_id where s.provenance='editor_added' and (ss.domain_confirmed or ss.organisation_confirmed or ss.eligible_recommendations<>0)")).rows[0].count,0);
    await as('postgres',null,async d=>{
      await d.query("update public.sources set name='Reviewed and edited' where id=$1",[first]);
      await d.exec(seed);
      assert.equal((await d.query('select name from public.sources where id=$1',[first])).rows[0].name,'Reviewed and edited');
    });
  });
});
