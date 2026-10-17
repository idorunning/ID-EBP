import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../supabase/functions/directory-api/index.ts',import.meta.url),'utf8')).replace("import {handleApi} from '../../../backend/api.mjs';",'');
function wrapper(valid=false){
 let serve;const calls=[];const Deno={env:{get:key=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-key'})[key]},serve:fn=>serve=fn};
 const fetch=async()=>Response.json({valid});
 new Function('Deno','handleApi','fetch',source)(Deno,async(request,env,context)=>{calls.push({request,env,context});return Response.json({ok:true});},fetch);
 return {serve,calls};
}
test('edge API rejects absent, wrong and unrecognised Worker credentials',async()=>{
 for(const secret of ['', 'short','a'.repeat(48)]){const e=wrapper();const r=await e.serve(new Request('https://fixture.supabase.co/directory-api/api/status',{headers:{'X-IDEBP-Proxy-Key':secret}}));assert.equal(r.status,403);assert.equal(e.calls.length,0);}
});
test('edge trusts only a checked Worker and forwards the authenticated origin and mail capability',async()=>{
 for(const prefix of ['/directory-api','/functions/v1/directory-api']){const e=wrapper(true);const r=await e.serve(new Request('https://fixture.supabase.co'+prefix+'/api/status',{headers:{Origin:'https://id-ebp.org','X-IDEBP-Proxy-Key':'a'.repeat(48),'X-IDEBP-Mail-Ready':'true','X-IDEBP-Client-IP':'192.0.2.1'}}));assert.equal(r.status,200);assert.equal(e.calls[0].env.AUTH_EMAIL_ENABLED,'true');assert.equal(e.calls[0].env.AUTH_MAIL_TRANSPORT,'worker');assert.equal(e.calls[0].request.url,'https://id-ebp.org/api/status');}
 const e=wrapper(true);const r=await e.serve(new Request('https://fixture.supabase.co/directory-api/api/status',{headers:{Origin:'https://attacker.test','X-IDEBP-Proxy-Key':'a'.repeat(48)}}));assert.equal(r.status,403);
});
