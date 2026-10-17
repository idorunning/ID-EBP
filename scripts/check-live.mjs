import assert from 'node:assert/strict';

// Public, read-only checks. No credentials, sign-in attempts or mail are sent.
const origin='https://www.id-ebp.org';
async function get(path){
  const response=await fetch(origin+path,{signal:AbortSignal.timeout(20000),redirect:'manual'});
  assert.equal(response.status,200,`${path}: HTTP ${response.status}`);
  const hsts=/\bmax-age=(\d+)/.exec(response.headers.get('strict-transport-security')||'');
  assert.ok(hsts&&Number(hsts[1])>0,`${path}: HSTS is missing or disabled`);
  return response;
}
const started=Date.now();
const home=await get('/');
assert.match(await home.text(),/International Directory of Evidence-Based Policing/i);
const statusResponse=await get('/api/status');
assert.match(statusResponse.headers.get('cache-control')||'',/no-store/);
const status=await statusResponse.json();
assert.equal(status.databaseReady,true,'Database/API is not ready');
assert.equal(status.authentication,true,'Authentication service is not ready');
assert.equal(status.email,true,'Email binding is not enabled');
const community=await (await get('/api/community')).json();
assert.ok(Object.keys(community.sources||{}).length>0,'Public catalogue is empty');
const session=await (await get('/api/session')).json();
assert.equal(session.user,null,'Anonymous session exposed an account');
for(const url of ['http://id-ebp.org/','https://id-ebp.org/','http://www.id-ebp.org/']){
  const response=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:'manual'});
  assert.ok([301,302,307,308].includes(response.status),`${url}: canonical redirect missing`);
  assert.equal(response.headers.get('location'),origin+'/');
  await response.body?.cancel();
}
const denied=await fetch(origin+'/api/internal/outbox-take',{method:'POST',signal:AbortSignal.timeout(20000)});
assert.equal(denied.status,404,'Internal task endpoint is exposed');
await denied.body?.cancel();
console.log(JSON.stringify({event:'live_public_checks',ok:true,sources:Object.keys(community.sources).length,durationMs:Date.now()-started}));
