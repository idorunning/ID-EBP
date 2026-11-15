import test from 'node:test';import assert from 'node:assert/strict';import worker from '../dist/worker.mjs';
const env={DIRECTORY_API_URL:'https://fixture.supabase.co/functions/v1/directory-api',DIRECTORY_PROXY_SECRET:'proxy-fixture',AUTH_HUMAN_CHECK_REQUIRED:'true',TURNSTILE_SITE_KEY:'public-fixture',TURNSTILE_SECRET:'secret-fixture'};
const request=(path,token,origin='https://www.id-ebp.org')=>new Request('https://www.id-ebp.org'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{'X-IDEBP-Human-Token':token}:{})},body:'{}'});
test('email entry points reject missing proof without contacting the backend',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let calls=0;globalThis.fetch=()=>{calls++;throw Error('Unexpected request');};
 for(const path of ['/api/auth/request','/api/account/verification','/api/sources/research/claim-code'])assert.equal((await worker.fetch(request(path),env)).status,400);
 assert.equal((await worker.fetch(request('/api/auth/request','fixture','https://attacker.test'),env)).status,403);assert.equal(calls,0);
});
test('proof must succeed with matching host and action and is stripped at the boundary',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let backend=0;
 for(const result of [{success:false},{success:true,hostname:'attacker.test',action:'auth_email'},{success:true,hostname:'www.id-ebp.org',action:'wrong'},{success:true,hostname:'www.id-ebp.org',action:'auth_email'}]){
 globalThis.fetch=async(url,options)=>{if(String(url).includes('siteverify')){assert.equal(JSON.parse(options.body).secret,env.TURNSTILE_SECRET);return Response.json(result);}backend++;assert.equal(url.headers.get('X-IDEBP-Human-Token'),null);return Response.json({sent:true});};
 assert.equal((await worker.fetch(request('/api/auth/request','fixture-proof'),env)).status,result.success&&result.hostname==='www.id-ebp.org'&&result.action==='auth_email'?200:400);
 }assert.equal(backend,1);
});
test('verification outage and absent configuration fail closed',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);globalThis.fetch=async()=>{throw Error('Unavailable');};
 assert.equal((await worker.fetch(request('/api/auth/request','proof'),env)).status,503);
 assert.equal((await worker.fetch(request('/api/auth/request','proof'),{...env,TURNSTILE_SECRET:''})).status,503);
});
