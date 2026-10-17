// Real independent PostgreSQL sessions, always in a disposable local cluster.
// No DATABASE_URL, remote host, production credentials or paid service is used.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'test-results');
const report={startedAt:new Date().toISOString(),status:'running',scope:'Synthetic local PostgreSQL only; independent database sessions, not hosted Auth or HTTP capacity.',checks:[]};
const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')&&key!=='DATABASE_URL'));
const clients=new Set();let directory,bin,started=false,serial=0,cleanupFailed=false;
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const id=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sid=n=>`60000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const rpc=(action,payload={},actor=null)=>`select public.directory_api(${literal(action)},${literal(JSON.stringify(payload))}::jsonb,${actor?literal(id(actor))+'::uuid':'null'},${actor?literal(sid(actor))+'::uuid':'null'})`;
const database='id_ebp_test',restored='id_ebp_restored';
let connection;

async function binaryFolder(){
  const folders=[process.env.ID_EBP_POSTGRES_BIN];
  try{folders.push((await run('pg_config',['--bindir'],{env:environment})).stdout.trim());}catch{}
  try{for(const version of (await readdir('/usr/lib/postgresql')).sort().reverse())folders.push(`/usr/lib/postgresql/${version}/bin`);}catch{}
  for(const folder of folders.filter(Boolean)){
    try{await Promise.all(['initdb','pg_ctl','psql','pg_dump','pg_restore'].map(file=>access(path.join(folder,file),constants.X_OK)));return folder;}catch{}
  }
  throw new Error('PostgreSQL server/client binaries unavailable. Install PostgreSQL 16 and its client, or set ID_EBP_POSTGRES_BIN to their directory.');
}
async function command(name,args,options={}){
  return run(path.join(bin,name),args,{cwd:root,env:environment,timeout:60000,maxBuffer:8*1024*1024,...options});
}
async function query(sql,db=database){
  return (await command('psql',[...connection,'-d',db,'-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-c',sql])).stdout.trim();
}
const value=async(sql,db)=>JSON.parse(await query(sql,db));

class Session{
  constructor(label){
    this.label=`idebp-${label}-${++serial}`;this.pending=null;this.buffer='';this.errors='';this.closed=false;
    this.process=spawn(path.join(bin,'psql'),[...connection,'-d',database,'-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{env:{...environment,PGAPPNAME:this.label},stdio:['pipe','pipe','pipe']});
    clients.add(this);
    this.process.stdout.on('data',chunk=>{
      this.buffer+=chunk.toString();const pending=this.pending;if(!pending)return;
      const marker=this.buffer.indexOf(pending.marker);
      if(marker!==-1){const result=this.buffer.slice(0,marker).trim();this.buffer=this.buffer.slice(marker+pending.marker.length).replace(/^\r?\n/,'');this.pending=null;clearTimeout(pending.timer);pending.resolve(result);}
    });
    this.process.stderr.on('data',chunk=>{this.errors+=chunk.toString();});
    const ended=error=>{
      this.closed=true;clients.delete(this);
      if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error||new Error(this.errors||'PostgreSQL session ended unexpectedly'));this.pending=null;}
    };
    this.process.on('error',ended);this.process.on('exit',()=>ended());
    this.process.stdin.on('error',()=>{});
  }
  exec(sql){
    if(this.closed)return Promise.reject(new Error(this.errors||'Session already closed'));
    assert.equal(this.pending,null,'One command at a time per independent session');
    return new Promise((resolve,reject)=>{
      const marker=`__IDEBP_DONE_${++serial}__`;
      const timer=setTimeout(()=>{this.process.kill('SIGTERM');reject(new Error(`Session ${this.label} exceeded 20 seconds`));},20000);
      this.pending={resolve,reject,marker,timer};this.process.stdin.write(`${sql};\n\\echo ${marker}\n`);
    });
  }
  async close(){if(!this.closed){this.process.stdin.end('rollback;\n\\q\n');await new Promise(resolve=>this.process.once('exit',resolve));}}
}
async function locked(session){
  const until=Date.now()+8000;
  while(Date.now()<until){
    if(await query(`select exists(select 1 from pg_stat_activity where application_name=${literal(session.label)} and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0)`)==='t')return;
    if(session.closed)throw new Error(session.errors||'Competing session exited before reaching its lock');
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  throw new Error(`Expected a real PostgreSQL lock wait for ${session.label}`);
}
async function check(name,fn){
  const began=performance.now();
  try{const evidence=await fn();report.checks.push({name,status:'passed',milliseconds:Math.round(performance.now()-began),...evidence});console.log(`PASS ${name}`);}
  catch(error){report.checks.push({name,status:'failed',milliseconds:Math.round(performance.now()-began),error:error.message});throw error;}
}
async function fingerprint(db){
  const tables=await value("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth') and c.relkind='r'",db);
  const result={};
  for(const table of tables){
    assert.match(table.schema,/^[a-z_]+$/);assert.match(table.table,/^[a-z_]+$/);
    result[`${table.schema}.${table.table}`]=await value(`select jsonb_build_object('rows',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''))) from "${table.schema}"."${table.table}" t`,db);
  }
  return result;
}

try{
  await mkdir(output,{recursive:true});
  if(process.getuid?.()===0)throw new Error('Cannot initialise PostgreSQL as root. Run this isolated test as a normal OS user; this runner does not bypass PostgreSQL’s non-root requirement.');
  bin=await binaryFolder();report.version=(await command('postgres',['--version'])).stdout.trim();
  directory=await mkdtemp(path.join(tmpdir(),'id-ebp-pg-'));const socket=path.join(directory,'socket'),data=path.join(directory,'data');
  await mkdir(socket,{mode:0o700});
  await command('initdb',['-D',data,'--username=postgres','--auth-local=trust','--auth-host=reject','--encoding=UTF8','--no-locale']);
  // Private directory plus Unix socket only. No TCP listener or remote URL.
  await command('pg_ctl',['-D',data,'-l',path.join(directory,'postgres.log'),'-o',`-h '' -k '${socket}' -p 55432 -c max_connections=80 -c shared_buffers=32MB`,'-w','start']);started=true;
  connection=['-h',socket,'-p','55432','-U','postgres'];
  await query(`create database ${database}`,'postgres');
  await query(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,created_at timestamptz default now(),last_sign_in_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
    grant usage on schema public,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
  const migrations=path.join(root,'supabase/migrations');
  for(const file of (await readdir(migrations)).filter(file=>file.endsWith('.sql')).sort())await command('psql',[...connection,'-d',database,'-X','-q','-v','ON_ERROR_STOP=1','--single-transaction','-f',path.join(migrations,file)]);
  for(let n=1;n<=45;n++)await query(`insert into auth.users(id,email,email_confirmed_at) values(${literal(id(n))},'person${n}@fixture.test',now());insert into auth.sessions(id,user_id) values(${literal(sid(n))},${literal(id(n))});`);
  for(let n=1;n<=5;n++)await query(`insert into private.member_profiles(user_id) values(${literal(id(n))});`);
  for(const n of [1,2])await query(`insert into private.admin_roles(user_id,state,must_set_password) values(${literal(id(n))},'active',false);`);
  for(let n=1;n<=5;n++)await query(`insert into public.sources(slug,name,website_url,canonical_domain,about,country_code,kinds,content_types,research_languages,access_type,status) values('race-${n}','Synthetic research ${n}','https://race-${n}.test','race-${n}.test','Synthetic local policing research fixture.','GB',array['University'],array['Original research'],array['en'],'free','published');`);
  const claim=async(user,source)=>value(`begin;set local role service_role;${rpc('claim_source',{slug:`race-${source}`,mailboxVerified:true,contactEmail:`person${user}@fixture.test`},user)};commit;`);
  const decide=(claimId,admin)=>rpc('moderate',{kind:'claim',id:claimId,decision:'approve',independentCheck:true,verificationUrl:'https://fixture.test/team'},admin);
  const suspend=(user,admin)=>rpc('admin_manage',{operation:'suspend_member',userId:id(user),reason:'Synthetic concurrent suspension check'},admin);
  const claimA=(await claim(3,1)).claim.id,claimB=(await claim(4,2)).claim.id;

  await check('approval then concurrent suspension leaves no management access',async()=>{
    const a=new Session('approve-first'),b=new Session('suspend-second');
    try{
      await a.exec(`begin;set local role service_role;${decide(claimA,1)}`);
      const pending=b.exec(`begin;set local role service_role;${suspend(3,2)};commit`).then(result=>({result}),error=>({error}));
      await locked(b);await a.exec('commit');const done=await pending;if(done.error)throw done.error;
      assert.equal(await query(`select count(*) from private.source_managers where user_id=${literal(id(3))}`),'0');
      assert.equal(await query(`select state from private.member_profiles where user_id=${literal(id(3))}`),'suspended');
      return {observedLockWait:true};
    }finally{await a.close();await b.close();}
  });
  await check('suspension then concurrent approval rejects the grant',async()=>{
    const a=new Session('suspend-first'),b=new Session('approve-second');
    try{
      await a.exec(`begin;set local role service_role;${suspend(4,1)}`);
      const pending=b.exec(`begin;set local role service_role;${decide(claimB,2)};commit`).then(result=>({result}),error=>({error}));
      await locked(b);await a.exec('commit');const done=await pending;assert.ok(done.error);assert.match(done.error.message,/42501/);
      assert.equal(await query(`select count(*) from private.source_managers where user_id=${literal(id(4))}`),'0');
      assert.equal(await query(`select state from private.source_claims where id=${literal(claimB)}`),'review');
      return {observedLockWait:true};
    }finally{await a.close();await b.close();}
  });
  await check('competing owner insertions preserve one owner',async()=>{
    const a=new Session('owner-first'),b=new Session('owner-second');
    const insert=n=>`insert into private.source_managers(source_id,user_id,role,verified_email) select id,${literal(id(n))},'owner','person${n}@fixture.test' from public.sources where slug='race-3'`;
    try{
      await a.exec(`begin;set local role service_role;${insert(5)}`);
      const pending=b.exec(`begin;set local role service_role;${insert(6)};commit`).then(result=>({result}),error=>({error}));
      await locked(b);await a.exec('commit');const done=await pending;assert.ok(done.error);assert.match(done.error.message,/23505/);
      assert.equal(await query("select count(*) from private.source_managers m join public.sources s on s.id=m.source_id where s.slug='race-3' and m.role='owner'"),'1');
      return {observedLockWait:true};
    }finally{await a.close();await b.close();}
  });
  await check('independent workers lease disjoint outbox batches',async()=>{
    await query("delete from private.workflow_outbox;insert into private.workflow_outbox(event_key,recipient,subject,body) select 'synthetic:'||n,'synthetic@fixture.test','Synthetic','Local test only' from generate_series(1,25) n");
    const a=new Session('worker-a'),b=new Session('worker-b');
    try{
      const first=JSON.parse(await a.exec(`begin;set local role service_role;${rpc('outbox_take')}`));
      // A global delivery-budget lock may deliberately serialise the reservation;
      // dispatch from session B while A is open, then release A before awaiting B.
      const pending=b.exec(`begin;set local role service_role;${rpc('outbox_take')}`).then(result=>({result}),error=>({error}));
      await a.exec('commit');const done=await pending;if(done.error)throw done.error;
      const second=JSON.parse(done.result);
      assert.equal(first.messages.length,10);assert.equal(second.messages.length,10);
      assert.equal(new Set([...first.messages,...second.messages].map(message=>message.id)).size,20);
      await b.exec('commit');
      const third=await value(`begin;set local role service_role;${rpc('outbox_take')};commit`);assert.equal(third.messages.length,5);
      assert.equal(new Set([...first.messages,...second.messages,...third.messages].map(message=>message.id)).size,25);
      return {independentSessions:2,distinctMessages:25};
    }finally{await a.close();await b.close();}
  });
  await check('concurrent identical revisions reuse one pending decision',async()=>{
    const a=new Session('revision-a'),b=new Session('revision-b');
    const edit=rpc('edit_profile',{slug:'race-3',profile:{name:'Reviewed synthetic source',about:'The same public description is safely submitted twice.'}},5);
    try{
      const first=JSON.parse(await a.exec(`begin;set local role service_role;${edit}`));
      const pending=b.exec(`begin;set local role service_role;${edit};commit`).then(result=>({result}),error=>({error}));
      await locked(b);await a.exec('commit');const done=await pending;if(done.error)throw done.error;
      assert.equal(JSON.parse(done.result).revisionId,first.revisionId);
      assert.equal(await query(`select count(*) from private.source_revisions where submitted_by=${literal(id(5))}`),'1');
      assert.equal(await query(`select count(*) from private.audit_events where actor_id=${literal(id(5))} and action='edit_profile'`),'1');
      return {observedLockWait:true,revisions:1,auditEntries:1};
    }finally{await a.close();await b.close();}
  });
  await check('40 independent verified-account session requests complete',async()=>{
    const timings=await Promise.all(Array.from({length:40},async(_,offset)=>{
      const began=performance.now(),result=await value(`begin;set local role service_role;${rpc('session',{},offset+6)};commit`);
      assert.equal(result.admin,false);return performance.now()-began;
    }));
    timings.sort((a,b)=>a-b);
    assert.equal(await query(`select count(*) from private.member_profiles where user_id>=${literal(id(6))}`),'40');
    return {independentConnections:40,p50Milliseconds:Math.round(timings[19]),p95Milliseconds:Math.round(timings[37]),measurement:'Includes psql process/connection startup; excludes hosted Auth, HTTP and network latency.'};
  });
  await check('synthetic logical backup restores all rows and access restrictions',async()=>{
    const before=await fingerprint(database),archive=path.join(directory,'synthetic.dump');
    await command('pg_dump',[...connection,'-d',database,'--format=custom','--file',archive]);
    await query(`create database ${restored}`,'postgres');
    await command('pg_restore',[...connection,'-d',restored,'--exit-on-error',archive]);
    assert.deepEqual(await fingerprint(restored),before);
    assert.equal(await query("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity",restored),'0');
    assert.equal(await query("select has_function_privilege('anon','public.directory_api(text,jsonb,uuid,uuid,text)','EXECUTE')",restored),'f');
    assert.equal(await query("select has_function_privilege('authenticated','public.directory_api(text,jsonb,uuid,uuid,text)','EXECUTE')",restored),'f');
    assert.equal(await query("select count(*) from pg_indexes where schemaname='private' and indexname='source_one_owner'",restored),'1');
    assert.equal(await query("select nextval(pg_get_serial_sequence('private.source_revisions','id'))>coalesce((select max(id) from private.source_revisions),0)",restored),'t');
    const current=await value(`begin;set local role service_role;${rpc('session',{},6)};commit`,restored);assert.equal(current.admin,false);
    return {tablesCompared:Object.keys(before).length,allRowCountsAndDigestsMatch:true,rlsAndRpcRestrictionsRestored:true};
  });
  report.status='passed';
}catch(error){report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{
  for(const client of clients)await client.close().catch(()=>{});
  if(started)await command('pg_ctl',['-D',path.join(directory,'data'),'-m','immediate','-w','stop']).catch(error=>{cleanupFailed=true;report.status='failed';report.cleanupError=error.message;report.localClusterPath=directory;process.exitCode=1;});
  if(directory){try{await writeFile(path.join(output,'postgres-server.log'),await readFile(path.join(directory,'postgres.log')));}catch{}if(!cleanupFailed)await rm(directory,{recursive:true,force:true});}
  report.finishedAt=new Date().toISOString();await mkdir(output,{recursive:true});await writeFile(path.join(output,'postgres-integration.json'),JSON.stringify(report,null,2)+'\n');
}
