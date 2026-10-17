import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/worker.mjs';
import {boundedBody,directoryEndpoint,timedOperation,runDirectoryTasks,serveSourceMedia} from '../backend/maintenance.mjs';

const proxyEnv=()=>({DIRECTORY_API_URL:'https://fixture.supabase.co/functions/v1/directory-api',DIRECTORY_PROXY_SECRET:'isolated-fixture-proxy'});
const community=()=>({authoritative:true,sources:{live:{profile:{name:'Public fixture',about:'A public summary.',url:'https://fixture.org',country:'GB',types:['University'],topics:[],contentTypes:[]}}}});
const post=(path,body,headers={})=>new Request('https://www.id-ebp.org'+path,{method:'POST',headers:{Origin:'https://www.id-ebp.org','Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});

test('200 simultaneous public reads share one anonymous upstream request, with no stale cache after withdrawal',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);const calls=[],env=proxyEnv();let published=true;
 globalThis.fetch=async(url,options)=>{calls.push({url,headers:options.headers});await new Promise(resolve=>setTimeout(resolve,10));return Response.json(published?community():{authoritative:true,sources:{}});};
 const started=performance.now();
 const responses=await Promise.all(Array.from({length:200},(_,i)=>worker.fetch(new Request('https://www.id-ebp.org'+(i%2?'/source/live':'/api/community'),{headers:{Cookie:'member-'+i}}),env)));
 assert.equal(calls.length,1);assert.equal(new Headers(calls[0].headers).get('Cookie'),null);
 for(const response of responses){assert.equal(response.status,200);assert.equal(response.headers.get('Set-Cookie'),null);await response.text();}
 t.diagnostic(`Isolated in-memory concurrency check: 200 responses, one upstream read, ${Math.round(performance.now()-started)} ms. This is not a production capacity benchmark.`);
 published=false;assert.equal((await worker.fetch(new Request('https://www.id-ebp.org/source/live'),env)).status,404);assert.equal(calls.length,2);
});

test('100 concurrent account requests keep each reply and session cookie separate and uncached',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let calls=0;const env=proxyEnv();
 globalThis.fetch=async request=>{calls++;const {email}=await request.json();await new Promise(resolve=>setTimeout(resolve,Number(email.split('@')[0])%4));return Response.json({user:{email}},{headers:{'Set-Cookie':`session=${email}; Secure; HttpOnly`,'Cache-Control':'public, max-age=3600'}});};
 const responses=await Promise.all(Array.from({length:100},(_,i)=>worker.fetch(post('/api/auth/password',{email:i+'@fixture.test',password:'fixture'}),env)));
 for(const [i,response] of responses.entries()){assert.equal(response.status,200);assert.equal((await response.json()).user.email,i+'@fixture.test');assert.match(response.headers.get('Set-Cookie'),new RegExp('^session='+i+'@'));assert.match(response.headers.get('Cache-Control'),/private, no-store/);}
 assert.equal(calls,100);
});

test('proxy rejects oversize bodies before contacting the backend and bounds upstream responses',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({ok:true});};
 let response=await worker.fetch(post('/api/auth/password','x'.repeat(16385)),proxyEnv());assert.equal(response.status,413);assert.equal(calls,0);
 globalThis.fetch=async()=>new Response('x'.repeat(4194305));response=await worker.fetch(new Request('https://www.id-ebp.org/api/session'),proxyEnv());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/xxxx/);
});

test('proxy strips client authentication overrides and strips secret delivery data on every response',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let sent=0;const env={...proxyEnv(),AUTH_EMAIL_ENABLED:'true',EMAIL:{send:async()=>sent++}};
 globalThis.fetch=async request=>{
  assert.equal(request.headers.get('X-IDEBP-Internal'),null);assert.equal(request.headers.get('Authorization'),null);
  assert.equal(request.headers.get('X-IDEBP-Proxy-Key'),env.DIRECTORY_PROXY_SECRET);assert.equal(request.headers.get('X-IDEBP-Client-IP'),'192.0.2.7');
  return Response.json({error:{code:'fixture'},internalDelivery:{email:'secret@fixture.test',code:'123456'}},{status:400});
 };
 const response=await worker.fetch(post('/api/auth/request',{}, {'X-IDEBP-Internal':'scheduled',Authorization:'Bearer attacker','X-IDEBP-Proxy-Key':'attacker','X-IDEBP-Client-IP':'spoofed','CF-Connecting-IP':'192.0.2.7'}),env);
 assert.equal(response.status,400);assert.doesNotMatch(await response.text(),/internalDelivery|123456|secret@/);assert.equal(sent,0);
});

test('direct backend transport delivers codes internally without returning them to the caller',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);const sent=[];
 globalThis.fetch=async url=>Response.json(String(url).endsWith('/admin/generate_link')?{email_otp:'123456',verification_type:'recovery'}:{allowed:true});
 const env={SUPABASE_URL:'https://direct-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture-public',SUPABASE_SECRET_KEY:'fixture-private',SESSION_SECRET:'fixture-long-session-secret-used-only-for-tests',AUTH_EMAIL_ENABLED:'true',AUTH_MAIL_TRANSPORT:'worker',EMAIL:{send:async message=>sent.push(message)}};
 const response=await worker.fetch(post('/api/auth/request',{email:'member@fixture.test',purpose:'reset'}),env);
 assert.equal(response.status,200);assert.doesNotMatch(await response.text(),/internalDelivery|123456/);assert.equal(sent.length,1);assert.match(sent[0].text,/123456/);assert.match(response.headers.get('Set-Cookie'),/HttpOnly/);
});

test('trusted backend validation rejects credentials, ports, queries and external hosts before sending a proxy secret',async t=>{
 for(const value of ['https://fixture.supabase.co:444/functions/v1/directory-api','https://user:pass@fixture.supabase.co/functions/v1/directory-api','https://fixture.supabase.co/functions/v1/directory-api?extra=1','https://untrusted.org/functions/v1/directory-api'])assert.throws(()=>directoryEndpoint(value));
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Must not fetch');};
 const response=await worker.fetch(new Request('https://www.id-ebp.org/directory'),{...proxyEnv(),DIRECTORY_API_URL:'https://untrusted.org/functions/v1/directory-api'});assert.equal(response.status,503);assert.equal(calls,0);
});

test('deadlines cancel stalled response streams, and body limits cancel oversized streams',async()=>{
 let cancelled=false;
 const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1]));},cancel(){cancelled=true;}}));
 await assert.rejects(timedOperation(signal=>boundedBody(response,100,signal),15),/timed out/);assert.equal(cancelled,true);
 let oversizedCancelled=false;const oversized=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(11));},cancel(){oversizedCancelled=true;}}));
 await assert.rejects(boundedBody(oversized,10),/too large/);assert.equal(oversizedCancelled,true);
});

test('background failures do not strand later jobs or notifications and never retry a send',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);const acknowledgements=[],sent=[];
 globalThis.fetch=async(url,options)=>{
  if(!url.includes('/api/internal/'))return new Response('<title>Fixture</title>',{headers:{'Content-Type':'text/html'}});
  const action=url.split('/').at(-1),body=JSON.parse(options.body);
  if(action==='maintenance-take')return Response.json({jobs:[{id:'first',lease:'one',url:'https://fixture.org'},{id:'second',lease:'two',url:'https://fixture.org'}]});
  if(action==='outbox-take')return Response.json({messages:[{id:'mail-one',lease:'one',to:'one@fixture.test'},{id:'mail-two',lease:'two',to:'two@fixture.test'}]});
  acknowledgements.push({action,...body});return Response.json({updated:true},{status:body.id==='first'||body.id==='mail-one'?503:200});
 };
 await assert.rejects(runDirectoryTasks({...proxyEnv(),WORKFLOW_NOTIFICATIONS_ENABLED:'true',EMAIL:{send:async message=>{sent.push(message.to);return {id:'accepted'};}}}),AggregateError);
 assert.deepEqual(acknowledgements.filter(x=>x.action==='maintenance-complete').map(x=>x.id),['first','second']);assert.deepEqual(acknowledgements.filter(x=>x.action==='outbox-complete').map(x=>x.id),['mail-one','mail-two']);assert.deepEqual(sent,['one@fixture.test','two@fixture.test']);
});


test('a lost email lease acknowledgement is reported without sending the message again',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let sends=0;
 globalThis.fetch=async url=>Response.json(url.endsWith('maintenance-take')?{jobs:[]}:url.endsWith('outbox-take')?{messages:[{id:'mail',lease:'lease',to:'fixture@fixture.test'}]}:{updated:false});
 await assert.rejects(runDirectoryTasks({...proxyEnv(),WORKFLOW_NOTIFICATIONS_ENABLED:'true',EMAIL:{send:async()=>{sends++;return {id:'accepted'};}}}),AggregateError);
 assert.equal(sends,1);
});

test('malformed stored media URLs return a controlled 404 instead of throwing',async()=>{
 for(const logoUrl of ['not a URL','https://127.0.0.1/private','javascript:alert(1)'])assert.equal((await serveSourceMedia('fixture','logo',{sources:{fixture:{profile:{publicDetails:{logoUrl}}}}})).status,404);
});

test('HEAD responses omit bodies on machine-readable routes',async()=>{
 for(const path of ['/robots.txt','/sitemap.xml','/catalogue.json','/llms.txt']){const response=await worker.fetch(new Request('https://www.id-ebp.org'+path,{method:'HEAD'}));assert.equal(response.status,200);assert.equal(await response.text(),'');}
});

test('Cloudflare-compatible manual redirects keep proxy credentials on the configured upstream',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let redirect=false,calls=0;
 globalThis.fetch=async(input,options)=>{calls++;assert.equal(input instanceof Request?input.redirect:options.redirect,'manual');return redirect?new Response(null,{status:302,headers:{Location:'https://untrusted.org/'}}):Response.json({authoritative:true,sources:{},user:null});};
 for(const path of ['/api/community','/api/session','/directory'])assert.equal((await worker.fetch(new Request('https://www.id-ebp.org'+path),proxyEnv())).status,200);
 redirect=true;
 for(const path of ['/api/community','/api/session','/directory'])assert.equal((await worker.fetch(new Request('https://www.id-ebp.org'+path),proxyEnv())).status,503);
 assert.equal(calls,6);
});
