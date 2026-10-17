import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../supabase/functions/directory-api/index.ts',import.meta.url),'utf8')).replace("import {handleApi} from '../../../backend/api.mjs';",'');
function wrapper(valid=false,options={}){
 let serve;const calls=[];const Deno={env:{get:key=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-key',...options.env})[key]},serve:fn=>serve=fn};
 const fetch=options.fetch|| (async()=>Response.json({valid}));
 new Function('Deno','handleApi','fetch','AbortSignal',source)(Deno,async(request,env,context)=>{calls.push({request,env,context});return Response.json({ok:true});},fetch,options.AbortSignal||AbortSignal);
 return {serve,calls};
}
test('edge API rejects absent, wrong and unrecognised Worker credentials',async()=>{
 for(const secret of ['', 'short','a'.repeat(48)]){const e=wrapper();const r=await e.serve(new Request('https://fixture.supabase.co/directory-api/api/status',{headers:{'X-IDEBP-Proxy-Key':secret}}));assert.equal(r.status,403);assert.equal(e.calls.length,0);}
});
test('edge fails closed on invalid, oversized or unavailable credential-check responses',async()=>{
 for(const response of [new Response('unavailable',{status:503}),new Response('<html>error</html>'),new Response('{broken',{headers:{'Content-Type':'application/json'}}),new Response(JSON.stringify({valid:true,padding:'x'.repeat(5000)}),{headers:{'Content-Type':'application/json'}})]){
  const e=wrapper(true,{fetch:async()=>response});
  const r=await e.serve(new Request('https://fixture.supabase.co/directory-api/api/status',{headers:{'X-IDEBP-Proxy-Key':'a'.repeat(48)}}));
  assert.equal(r.status,503);assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal(e.calls.length,0);
 }
});
test('credential check has a deadline covering a stalled response body',async()=>{
 let cancelled=false;const signal=new AbortController();
 const e=wrapper(true,{AbortSignal:{timeout:ms=>{assert.equal(ms,5000);setTimeout(()=>signal.abort(),10);return signal.signal;}},fetch:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json'}})});
 const r=await e.serve(new Request('https://fixture.supabase.co/directory-api/api/status',{headers:{'X-IDEBP-Proxy-Key':'a'.repeat(48)}}));
 assert.equal(r.status,503);assert.equal(e.calls.length,0);assert.equal(cancelled,true);
});
test('untrusted origins are rejected before any privileged database request',async()=>{
 let requests=0;const e=wrapper(true,{fetch:async()=>{requests++;return Response.json({valid:true});}});
 const r=await e.serve(new Request('https://fixture.supabase.co/directory-api/api/status',{headers:{Origin:'https://attacker.test','X-IDEBP-Proxy-Key':'a'.repeat(48)}}));
 assert.equal(r.status,403);assert.equal(requests,0);
});
test('edge trusts only a checked Worker and forwards the authenticated origin and mail capability',async()=>{
 for(const prefix of ['/directory-api','/functions/v1/directory-api']){const e=wrapper(true);const r=await e.serve(new Request('https://fixture.supabase.co'+prefix+'/api/status',{headers:{Origin:'https://www.id-ebp.org','X-IDEBP-Proxy-Key':'a'.repeat(48),'X-IDEBP-Mail-Ready':'true','X-IDEBP-Client-IP':'192.0.2.1'}}));assert.equal(r.status,200);assert.equal(e.calls[0].env.AUTH_EMAIL_ENABLED,'true');assert.equal(e.calls[0].env.AUTH_MAIL_TRANSPORT,'worker');assert.equal(e.calls[0].request.url,'https://www.id-ebp.org/api/status');}
 const e=wrapper(true);const r=await e.serve(new Request('https://fixture.supabase.co/directory-api/api/status',{headers:{Origin:'https://attacker.test','X-IDEBP-Proxy-Key':'a'.repeat(48)}}));assert.equal(r.status,403);
});
test('only a verified Worker supplies trusted client IP and server-owned Auth forwarding configuration',async()=>{
 const config={DIRECTORY_AUTH_SECRET_KEY:'sb_secret_fixture_auth_forwarding_key',SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_fixture_injected_default_key'}),AUTH_CLIENT_IP_FORWARDING_ENABLED:'true',AUTH_PASSWORD_IP_LIMIT:'120',AUTH_EMAIL_IP_LIMIT:'120',AUTH_EMAIL_GLOBAL_LIMIT:'150',AUTH_EMAIL_DAILY_LIMIT:'150',AUTH_VERIFY_IP_LIMIT:'120'};
 const headers={'X-IDEBP-Proxy-Key':'a'.repeat(48),'X-IDEBP-Client-IP':'192.0.2.1','Sb-Forwarded-For':'203.0.113.66','X-Forwarded-For':'203.0.113.66','CF-Connecting-IP':'203.0.113.66'};
 const rejected=wrapper(false,{env:config});assert.equal((await rejected.serve(new Request('https://fixture.supabase.co/directory-api/api/status',{headers}))).status,403);assert.equal(rejected.calls.length,0);
 const e=wrapper(true,{env:config});assert.equal((await e.serve(new Request('https://fixture.supabase.co/directory-api/api/status',{headers}))).status,200);
 assert.equal(e.calls[0].context.clientIp,'192.0.2.1');assert.equal(e.calls[0].context.trustedClientIp,true);
 for(const [key,value] of Object.entries(config))assert.equal(e.calls[0].env[key],value);
});
