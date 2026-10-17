import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../backend/api.mjs';

const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_security_fixture',SUPABASE_SECRET_KEY:'sb_secret_security_fixture',SESSION_SECRET:'isolated-security-fixture-not-a-production-secret',AUTH_EMAIL_ENABLED:'true',AUTH_MAIL_TRANSPORT:'worker'};
const identity={id:'10000000-0000-4000-8000-000000000001',email:'member@research.test',email_confirmed_at:'2026-10-17T00:00:00Z',user_metadata:{}};
const tokenFor=user=>['fixture',btoa(JSON.stringify({sub:user.id,session_id:user.id.replace(/^1/,'2'),aal:'aal1'})),'validated-by-local-auth-fixture'].join('.');
function fixture({shortExpiry=false,rejectCodes=false,identityFor=()=>identity,envOverrides={}}={}){
  const calls=[],limits=new Map(),members=new Map();let refreshFailure=0;
  const fetch=async(url,request)=>{
    const path=new URL(url).pathname,body=request.body?JSON.parse(request.body):null;calls.push({path,body,headers:request.headers});
    const bearer=request.headers.Authorization?.replace(/^Bearer /,'');
    if(path==='/auth/v1/token'){
      if(new URL(url).searchParams.get('grant_type')==='refresh_token'&&refreshFailure)return Response.json({message:'Fixture refresh failure'},{status:refreshFailure});
      const member=body.email?identityFor(body.email):members.get(body.refresh_token),access=tokenFor(member),refresh='refresh-for-'+member.id;
      members.set(access,member);members.set(refresh,member);
      return Response.json({access_token:access,refresh_token:refresh,expires_in:shortExpiry?1:3600,user:member});
    }
    if(path==='/auth/v1/user')return Response.json(members.get(bearer)||identity);
    if(path==='/auth/v1/admin/generate_link')return Response.json({email_otp:'123456',verification_type:body.type});
    if(path==='/auth/v1/verify')return rejectCodes?Response.json({message:'Invalid code'},{status:400}):Response.json({});
    if(path==='/rest/v1/rpc/directory_api'){
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
    const call=async(path,body,{method=body===undefined?'GET':'POST',clientIp='192.0.2.1',sendCsrf=true}={})=>{
      const headers={'Content-Type':'application/json',Origin:'https://id-ebp.org'};
      if(jar.size)headers.Cookie=[...jar].map(([k,v])=>k+'='+v).join('; ');
      if(csrf&&sendCsrf)headers['X-CSRF-Token']=csrf;
      const response=await handleApi(new Request('https://id-ebp.org'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),{...env,...envOverrides},{fetch,clientIp});
      for(const value of response.headers.getSetCookie()){const [pair]=value.split(';'),[key,entry]=pair.split(/=(.*)/s);if(entry)jar.set(key,entry);else jar.delete(key);}
      const result=await response.json();if(result.csrfToken)csrf=result.csrfToken;return {response,result};
    };
    return {call,jar,signIn:()=>call('/api/auth/password',{email:address,password:'Only a fixture password'}),get csrf(){return csrf;}};
  }
  return {calls,client,setRefreshFailure:value=>refreshFailure=value};
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

for(const [configuredLimit,expected] of [[undefined,12],['120',64],['999999',12],['12.5',12]])test('shared-IP batch honours bounded password configuration '+String(configuredLimit)+' (mocked Auth, enforced limiter)',async()=>{
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
    const result=await handleApi(new Request('https://id-ebp.org/api/community'),env,{fetch:async()=>new Response(body,{headers:{'Content-Type':'application/json'}})});
    assert.equal(result.status,503);assert.equal((await result.json()).error.code,'service_unavailable');
  }
});

test('upstream response streams are cancelled once they exceed the 4 MiB budget',async()=>{
  let cancelled=false,reads=0;
  const stream=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
  const result=await handleApi(new Request('https://id-ebp.org/api/community'),env,{fetch:async()=>new Response(stream,{headers:{'Content-Type':'application/json'}})});
  assert.equal(result.status,503);assert.equal(cancelled,true);assert.ok(reads<=6);
});

test('login and source-claim forms share one mailbox guessing budget',async()=>{
  const f=fixture({rejectCodes:true}),c=f.client();
  await c.call('/api/auth/request',{email:identity.email});await c.call('/api/sources/research/claim-code',{email:identity.email});
  for(let i=0;i<10;i++)assert.equal((await c.call(i%2?'/api/auth/verify':'/api/sources/research/claim',{email:identity.email,token:'999999'},{clientIp:'192.0.2.'+(i+1)})).response.status,400);
  assert.equal((await c.call('/api/auth/verify',{email:identity.email,token:'999999'},{clientIp:'198.51.100.7'})).response.status,429);
  assert.equal(f.calls.filter(x=>x.path==='/auth/v1/verify').length,10);
});
