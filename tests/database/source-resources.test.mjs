import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '../helpers/database.mjs';

const manager='00000000-0000-4000-8000-000000000041';
const outsider='00000000-0000-4000-8000-000000000042';
const admin='00000000-0000-4000-8000-000000000043';

test('source resources require verified ownership and moderator approval',async t=>{
 const db=new PGlite();await db.waitReady;t.after(()=>db.close());
 await db.exec(`
 create role anon nologin;
 create role authenticated nologin;
 create role service_role nologin bypassrls;
 create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,created_at timestamptz default now(),last_sign_in_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 grant usage on schema public,auth to anon,authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
 const folder=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())
   await db.exec('begin;\n'+await readFile(new URL(file,folder),'utf8')+'\ncommit;');
 await db.exec(await readFile(new URL('../../supabase/seed.sql',import.meta.url),'utf8'));
 await db.query(`insert into auth.users(id,email,email_confirmed_at) values ($1,'owner@example.org',now()),($2,'outsider@example.org',now()),($3,'admin@example.org',now())`,[manager,outsider,admin]);
 const sources=(await db.query("select id,slug from public.sources where status='published' order by slug limit 2")).rows;
 assert.equal(sources.length,2);
 await db.query("insert into private.source_managers(source_id,user_id,role,verified_email) values($1,$2,'owner','owner@example.org')",[sources[0].id,manager]);
 await db.query("insert into private.admin_roles(user_id,state,must_set_password) values($1,'active',false)",[admin]);
 const rpc=(action,body,actor)=>db.query('select public.directory_api($1,$2::jsonb,$3,null,\'aal1\') as result',[action,JSON.stringify(body),actor]);
 const slug=sources[0].slug, item={slug,type:'annual_report',title:'Annual report 2025/26',url:'https://reports.example.org/2025-26',description:'Official annual report',year:'2025'};
 const submitted=(await rpc('resource_submit',item,manager)).rows[0].result;
 assert.equal(submitted.status,'pending');
 assert.equal((await rpc('resource_list',{slug},null)).rows[0].result.resources.length,0,'unapproved resource never appears to visitors');
 assert.equal((await rpc('resource_list',{slug},manager)).rows[0].result.resources.length,1,'submitter sees own pending item');
 await assert.rejects(rpc('resource_submit',{...item,slug:sources[1].slug,url:'https://reports.example.org/other'},manager),/Verified source manager required/);
 await assert.rejects(rpc('resource_submit',{...item,url:'https://reports.example.org/unsafe',title:'Unsafe source',type:'newsletter'},outsider),/Verified source manager required/);
 await assert.rejects(rpc('resource_submit',{...item,url:'javascript:alert(1)'},manager),/Invalid resource details/);
 await assert.rejects(rpc('resource_moderate',{id:submitted.id,decision:'approved'},manager),/Administrator required/);
 const pending=(await rpc('resource_review_queue',{},admin)).rows[0].result.resources;
 assert.equal(pending.length,1);
 assert.equal((await rpc('resource_moderate',{id:submitted.id,decision:'approved',reason:'Verified official report'},admin)).rows[0].result.status,'approved');
 assert.equal((await rpc('resource_list',{slug},null)).rows[0].result.resources[0].title,item.title);
 await assert.rejects(rpc('resource_submit',item,manager),/already_submitted/);
 await db.exec('begin; set local role anon;');
 try{await assert.rejects(db.query('select * from private.source_resources'),/permission denied/);}finally{await db.exec('rollback');}
});
