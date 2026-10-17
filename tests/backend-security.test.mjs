import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../backend/api.mjs';

const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_security_fixture',SUPABASE_SECRET_KEY:'sb_secret_security_fixture',SESSION_SECRET:'isolated-security-fixture-not-a-production-secret',AUTH_EMAIL_ENABLED:'true',AUTH_MAIL_TRANSPORT:'worker'};
const identity={id:'10000000-0000-4000-8000-000000000001',email:'member@research.test',email_confirmed_at:'2026-10-17T00:00:00Z',user_metadata:{}};
const tokenFor=user=>['fixture',btoa(JSON.stringify({sub:user.id,session_id:user.id.replace(/^1/,'2'),aal:'aal1'})),'validated-by-local-auth-fixture'].join('.');
function fixture({shortExpiry=false,rejectCodes=false,identityFor=()=>identity,envOverrides={}}={}){
  const calls=[],limits=new Map(),members=new Map();let refreshFailure=0;
  const issuedSession=member=>{const access=tokenFor(member),refresh='refresh-for-'+member.id;members.set(access,member);members.set(refresh,member);return {access_token:access,refresh_token:refresh,expires_in:shortExpiry?1:3600,user:member};};
  const fetch=async(url,request)=>{
    const path=new URL(url).pathname,body=request.body?JSON.parse(request.body):null;calls.push({path,body,headers:request.headers});
    const bearer=request.headers.Authorization?.replace(/^Bearer /,'');
    if(path==='/auth/v1/token'){
      if(new URL(url).searchParams.get('grant_type')==='refresh_token'&&refreshFailure)return Response.json({message:'Fixture refresh failure'},{status:refreshFailure});
      return Response.json(issuedSession(body.email?identityFor(body.email):members.get(body.refresh_token)));
    }
    if(path==='/auth/v1/user')return Response.json(members.get(bearer)||identity);
    if(path==='/auth/v1/admin/generate_link')return Response.json({email_otp:'123456',verification_type:body.type});
    if(path==='/auth/v1/verify')return rejectCodes?Response.json({message:'Invalid code'},{status:400}):Response.json(issuedSession(identityFor(body.email)));
    if(path==='/rest/v1/rpc/directory_api'){
      if(body.p_action==='reserve_auth_email'){
        const count=(limits.get('auth-delivery-rolling')||0)+1;limits.set('auth-delivery-rolling',count);
        return count>body.p_payload.limit?Response.json({code:'P0001',message:'rate_limited'},{status:400}):Response.json({allowed:true});
      }
      if(body.p_action==='rate_limit'){
        const {key,limit}=body.p_payload,count=(limits.get(key)||0)+1;limits.set(key,count);
        if(count>limit)return Response.json({code:'P0001',message:'rate_limited'},{status:400});
        return Response.json({allowed:true});
      }
      if(body.p_action==='session')return Response.json({admin:false,managedSources:[]});
      return Response.json({updated:true});
    }
    throw Error('Unexpected security fixture path '+path);
  };
  function client(address=identity.email){
    const jar=new Map();let csrf;
    const call=async(path,body,{method=body===undefined?'GET':'POST',clientIp='192.0.2.1',sendCsrf=true,headers:extraHeaders={},trustedClientIp=false}={})=>{
      const headers={'Content-Type':'application/json',Origin:'https://www.id-ebp.org',...extraHeaders};
      if(jar.size)headers.Cookie=[...jar].map(([k,v])=>k+'='+v).join('; ');
      if(csrf&&sendCsrf)headers['X-CSRF-Token']=csrf;
      const response=await handleApi(new Request('https://www.id-ebp.org'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),{...env,...envOverrides},{fetch,clientIp,trustedClientIp});
      for(const value of response.headers.getSetCookie()){const [pair]=value.split(';'),[key,entry]=pair.split(/=(.*)/s);if(entry)jar.set(key,entry);else jar.delete(key);}
      const result=await response.json();if(result.csrfToken)csrf=result.csrfToken;return {response,result};
    };
    return {call,jar,signIn:()=>call('/api/auth/password',{email:address,password:'Only a fixture password'}),get csrf(){return csrf;}};
  }
  return {calls,client,setRefreshFailure:value=>refreshFailure=value,advanceHour:()=>{for(const key of limits.keys())if(key.startsWith('email-send-global:')||key.startsWith('email-send-ip:'))limits.delete(key);}};
}

test('team mutation endpoints reject GET before calling privileged RPCs',async()=>{
  const f=fixture(),c=f.client();await c.signIn();
  for(const action of ['invite-editor','accept-editor','revoke-editor']){
    const start=f.calls.length,{response,result}=await c.call('/api/sources/research/'+action,undefined,{sendCsrf:false});
    assert.equal(response.status,405,action+' must not accept GET');assert.equal(result.error.code,'method_not_allowed');
    assert.equal(f.calls.slice(start).some(x=>x.body?.p_action===action.replaceAll('-','_')),false);
  }
  const team=await c.call('/api/sources/research/team');assert.equal(team.response.status,200);
  const wrong=await c.call('/api/sources/research/team',{});assert.equal(wrong.response.status,405);
});

test('transient token refresh failures preserve the encrypted session for a successful retry',async()=>{
  const f=fixture({shortExpiry:true}),c=f.client();await c.signIn();const previous=c.jar.get('__Host-idebp_session');assert.ok(previous);
  f.setRefreshFailure(503);const failed=await c.call('/api/session');assert.equal(failed.response.status,503);
  assert.equal(c.jar.get('__Host-idebp_session'),previous,'a provider outage must not log the member out');
  f.setRefreshFailure(0);const retried=await c.call('/api/session');assert.equal(retried.response.status,200);assert.equal(retried.result.user.id,identity.id);
});

test('invalid refresh credentials still clear the unusable browser session',async()=>{
  const f=fixture({shortExpiry:true}),c=f.client();await c.signIn();f.setRefreshFailure(400);
  const result=await c.call('/api/session');assert.equal(result.response.status,400);assert.equal(c.jar.has('__Host-idebp_session'),false);
});

for(const kind of ['login','claim'])test(kind+' OTP guessing is bounded across changing client IP addresses',async()=>{
  const f=fixture({rejectCodes:true}),c=f.client(),requestPath=kind==='login'?'/api/auth/request':'/api/sources/research/claim-code',verifyPath=kind==='login'?'/api/auth/verify':'/api/sources/research/claim';
  assert.equal((await c.call(requestPath,{email:identity.email})).response.status,200);
  for(let attempt=0;attempt<10;attempt++)assert.equal((await c.call(verifyPath,{email:identity.email,token:'999999'},{clientIp:'192.0.2.'+(attempt+2)})).response.status,400);
  const blocked=await c.call(verifyPath,{email:identity.email,token:'999999'},{clientIp:'198.51.100.7'});assert.equal(blocked.response.status,429);
  assert.equal(f.calls.filter(x=>x.path==='/auth/v1/verify').length,10,'the exhausted mailbox must not reach Auth again');
});

test('64 simultaneous password sign-ins keep identity, CSRF and cookies isolated (mocked Auth)',async()=>{
  const identities=new Map(Array.from({length:64},(_,i)=>{const id='10000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),email='member'+i+'@research.test';return [email,{...identity,id,email}];}));
  const f=fixture({identityFor:address=>identities.get(address)}),clients=[...identities.keys()].map(address=>f.client(address));
  // Each independent visitor has a distinct IP; the shared mock still applies
  // the real API's per-IP and per-mailbox limiter calls.
  const signedIn=await Promise.all(clients.map((c,i)=>c.call('/api/auth/password',{email:[...identities.keys()][i],password:'Only a fixture password'},{clientIp:'192.0.2.'+(i+1)})));
  assert.equal(signedIn.every(({response})=>response.status===200),true);
  assert.equal(new Set(signedIn.map(({result})=>result.user.id)).size,64);assert.equal(new Set(clients.map(c=>c.csrf)).size,64);assert.equal(new Set(clients.map(c=>c.jar.get('__Host-idebp_session'))).size,64);
  const sessions=await Promise.all(clients.map(c=>c.call('/api/session')));
  sessions.forEach(({result,response},i)=>{assert.equal(response.status,200);assert.equal(result.user.email,[...identities.keys()][i]);assert.doesNotMatch(JSON.stringify(result),/access_token|refresh_token|sb_secret/);});
});

test('simultaneous refreshes preserve each member identity and CSRF (mocked Auth reuse window)',async()=>{
  const f=fixture({shortExpiry:true}),c=f.client();await c.signIn();const original=c.csrf;
  const results=await Promise.all(Array.from({length:16},()=>c.call('/api/session')));
  assert.equal(results.every(({response,result})=>response.status===200&&result.user.id===identity.id&&result.csrfToken===original),true);
  assert.equal((await c.call('/api/session')).result.user.id,identity.id);
});

for(const [configuredLimit,expected] of [[undefined,64],['12',12],['120',64],['999999',64],['12.5',64]])test('shared-IP batch honours bounded password configuration '+String(configuredLimit)+' (mocked Auth, enforced limiter)',async()=>{
  const addresses=Array.from({length:64},(_,i)=>'shared'+i+'@research.test');
  const f=fixture({envOverrides:{AUTH_PASSWORD_IP_LIMIT:configuredLimit},identityFor:email=>({...identity,email,id:'10000000-0000-4000-8000-'+String(addresses.indexOf(email)+1).padStart(12,'0')})});
  const results=await Promise.all(addresses.map(address=>f.client(address).signIn()));
  assert.equal(results.filter(x=>x.response.status===200).length,expected);assert.equal(results.filter(x=>x.response.status===429).length,64-expected);
  assert.equal(f.calls.filter(x=>x.path==='/auth/v1/token').length,expected);
});

test('increasing the shared-IP allowance does not weaken the per-mailbox password limit',async()=>{
  const f=fixture({envOverrides:{AUTH_PASSWORD_IP_LIMIT:'120'}});
  const results=await Promise.all(Array.from({length:12},()=>f.client().signIn()));
  assert.equal(results.filter(x=>x.response.status===200).length,8);assert.equal(results.filter(x=>x.response.status===429).length,4);
  assert.equal(f.calls.filter(x=>x.path==='/auth/v1/token').length,8);
});

test('successful malformed upstream JSON cannot be reported as an empty success',async()=>{
  for(const body of ['not JSON','{"incomplete":','null','[]','true','']){
    const result=await handleApi(new Request('https://www.id-ebp.org/api/community'),env,{fetch:async()=>new Response(body,{headers:{'Content-Type':'application/json'}})});
    assert.equal(result.status,503);assert.equal((await result.json()).error.code,'service_unavailable');
  }
});

test('upstream response streams are cancelled once they exceed the 4 MiB budget',async()=>{
  let cancelled=false,reads=0;
  const stream=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
  const result=await handleApi(new Request('https://www.id-ebp.org/api/community'),env,{fetch:async()=>new Response(stream,{headers:{'Content-Type':'application/json'}})});
  assert.equal(result.status,503);assert.equal(cancelled,true);assert.ok(reads<=6);
});

test('login and source-claim forms share one mailbox guessing budget',async()=>{
  const f=fixture({rejectCodes:true}),c=f.client();
  await c.call('/api/auth/request',{email:identity.email});await c.call('/api/sources/research/claim-code',{email:identity.email});
  for(let i=0;i<10;i++)assert.equal((await c.call(i%2?'/api/auth/verify':'/api/sources/research/claim',{email:identity.email,token:'999999'},{clientIp:'192.0.2.'+(i+1)})).response.status,400);
  assert.equal((await c.call('/api/auth/verify',{email:identity.email,token:'999999'},{clientIp:'198.51.100.7'})).response.status,429);
  assert.equal(f.calls.filter(x=>x.path==='/auth/v1/verify').length,10);
});

test('64 email-code sign-ins complete from one shared IP without identity crossover (mocked Auth)',async()=>{
  const identities=new Map(Array.from({length:64},(_,i)=>['mail'+i+'@research.test',{...identity,id:'10000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),email:'mail'+i+'@research.test'}]));
  const f=fixture({identityFor:email=>identities.get(email)}),clients=[...identities.keys()].map(email=>({email,client:f.client(email)}));
  const requests=await Promise.all(clients.map(({email,client})=>client.call('/api/auth/request',{email})));assert.equal(requests.every(x=>x.response.status===200),true);
  const verifications=await Promise.all(clients.map(({email,client})=>client.call('/api/auth/verify',{email,token:'123456'})));
  verifications.forEach(({response,result},i)=>{assert.equal(response.status,200);assert.equal(result.user.email,clients[i].email);});
  assert.equal(new Set(verifications.map(x=>x.result.csrfToken)).size,64);
});

test('email login and claim requests share the default 120 per-IP hourly budget',async()=>{
  const f=fixture();const results=await Promise.all(Array.from({length:121},(_,i)=>f.client().call(i%2?'/api/auth/request':'/api/sources/research/claim-code',{email:'request'+i+'@research.test'})));
  assert.equal(results.filter(x=>x.response.status===200).length,120);assert.equal(results.filter(x=>x.response.status===429).length,1);
  assert.equal(f.calls.filter(x=>x.path==='/auth/v1/admin/generate_link').length,120);
});

test('email login and claim requests share the default 150 global hourly budget across IPs',async()=>{
  const f=fixture();const results=await Promise.all(Array.from({length:151},(_,i)=>f.client().call(i%2?'/api/auth/request':'/api/sources/research/claim-code',{email:'global'+i+'@research.test'},{clientIp:'198.51.100.'+(i+1)})));
  assert.equal(results.filter(x=>x.response.status===200).length,150);assert.equal(results.filter(x=>x.response.status===429).length,1);
  assert.equal(f.calls.filter(x=>x.path==='/auth/v1/admin/generate_link').length,150);
});

test('all Auth email purposes reserve the shared rolling24-hour budget before code creation',async()=>{
  const f=fixture({envOverrides:{AUTH_EMAIL_DAILY_LIMIT:'1000'}}),member=f.client();await member.signIn();
  const requests=await Promise.all(Array.from({length:149},(_,i)=>f.client().call(i%2?'/api/auth/request':'/api/sources/research/claim-code',{email:'daily'+i+'@research.test'},{clientIp:'198.51.100.'+(i+1)})));
  assert.equal(requests.every(x=>x.response.status===200),true);
  // Simulate the hourly window expiring without removing the separate rolling
  // reservations; database tests cover the ledger's actual timestamp behaviour.
  f.advanceHour();
  assert.equal((await member.call('/api/account/verification',{kind:'deletion'})).response.status,200);
  assert.equal((await member.call('/api/account/verification',{kind:'email_current'})).response.status,429);
  assert.equal((await f.client().call('/api/auth/request',{email:'one-too-many@research.test'},{clientIp:'203.0.113.7'})).response.status,429);
  assert.equal(f.calls.filter(x=>x.path==='/auth/v1/admin/generate_link').length,149);
  assert.equal(f.calls.filter(x=>x.body?.p_action==='account_challenge').length,1);
  const daily=f.calls.filter(x=>x.body?.p_action==='reserve_auth_email');
  assert.ok(daily.length>150);assert.equal(daily.every(x=>x.body.p_payload.limit===150),true);
});

test('mailbox request caps remain three per ten minutes for sign-in and claims',async()=>{
  for(const path of ['/api/auth/request','/api/sources/research/claim-code']){
    const f=fixture(),c=f.client();const results=await Promise.all(Array.from({length:4},()=>c.call(path,{email:identity.email})));
    assert.equal(results.filter(x=>x.response.status===200).length,3);assert.equal(results.filter(x=>x.response.status===429).length,1);
  }
});

test('upstream Auth forwarding requires a modern key, opt-in and a trusted single IP',async()=>{
  const modern='sb_secret_only_a_local_forwarding_fixture_key';
  for(const [configuration,options,expected] of [
    [{DIRECTORY_AUTH_SECRET_KEY:modern,AUTH_CLIENT_IP_FORWARDING_ENABLED:'true'},{trustedClientIp:true,clientIp:'198.51.100.7'},'198.51.100.7'],
    [{SUPABASE_SECRET_KEYS:JSON.stringify({default:modern}),AUTH_CLIENT_IP_FORWARDING_ENABLED:'true'},{trustedClientIp:true,clientIp:'2001:db8::7'},'2001:db8::7'],
    [{DIRECTORY_AUTH_SECRET_KEY:modern,AUTH_CLIENT_IP_FORWARDING_ENABLED:'true'},{clientIp:'198.51.100.7'},undefined],
    [{DIRECTORY_AUTH_SECRET_KEY:modern},{trustedClientIp:true,clientIp:'198.51.100.7'},undefined],
    [{AUTH_CLIENT_IP_FORWARDING_ENABLED:'true'},{trustedClientIp:true,clientIp:'198.51.100.7'},undefined],
    [{DIRECTORY_AUTH_SECRET_KEY:'legacy.jwt.secret',AUTH_CLIENT_IP_FORWARDING_ENABLED:'true'},{trustedClientIp:true,clientIp:'198.51.100.7'},undefined],
    [{DIRECTORY_AUTH_SECRET_KEY:modern,AUTH_CLIENT_IP_FORWARDING_ENABLED:'true'},{trustedClientIp:true,clientIp:'198.51.100.7, 203.0.113.8'},undefined],
    [{DIRECTORY_AUTH_SECRET_KEY:modern,AUTH_CLIENT_IP_FORWARDING_ENABLED:'true'},{trustedClientIp:true,clientIp:'256.1.2.3'},undefined],
    [{DIRECTORY_AUTH_SECRET_KEY:modern,AUTH_CLIENT_IP_FORWARDING_ENABLED:'true'},{trustedClientIp:true,clientIp:'unknown'},undefined],
    [{SUPABASE_SECRET_KEYS:'invalid-json',AUTH_CLIENT_IP_FORWARDING_ENABLED:'true'},{trustedClientIp:true,clientIp:'198.51.100.7'},undefined],
  ]){
    const f=fixture({envOverrides:configuration}),c=f.client();const response=await c.call('/api/auth/password',{email:identity.email,password:'Only a fixture password'},{...options,headers:{'Sb-Forwarded-For':'203.0.113.66','X-Forwarded-For':'203.0.113.66','X-IDEBP-Client-IP':'203.0.113.66','CF-Connecting-IP':'203.0.113.66'}});
    assert.equal(response.response.status,200);
    for(const call of f.calls.filter(x=>x.path.startsWith('/auth/v1/')))assert.equal(call.headers['Sb-Forwarded-For'],expected);
    for(const call of f.calls.filter(x=>x.path.startsWith('/rest/'))){assert.equal(call.headers['Sb-Forwarded-For'],undefined);assert.equal(call.headers.apikey,env.SUPABASE_SECRET_KEY);}
    if(expected){assert.ok(f.calls.filter(x=>x.path.startsWith('/auth/v1/')).every(x=>x.headers.apikey===modern));assert.equal(f.calls.find(x=>x.path==='/auth/v1/token').headers.Authorization,undefined);}
  }
});
