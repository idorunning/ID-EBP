import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../backend/api.mjs';

// Plain fixture labels, never credential-shaped strings or live service keys.
const env={SUPABASE_URL:'https://dedicated-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'local-fixture-public-key',SUPABASE_SECRET_KEY:'local-fixture-server-key',SESSION_SECRET:'local-fixture-with-more-than-thirty-two-characters',AUTH_EMAIL_ENABLED:'true'};
const id='10000000-0000-4000-8000-000000000001',sid='20000000-0000-4000-8000-000000000001';
const jwt=aal=>['fixture',btoa(JSON.stringify({sub:id,session_id:sid,aal})), 'signature-validated-by-the-auth-fixture'].join('.');
const user={id,email:'researcher@university.test',email_confirmed_at:'2026-10-14T00:00:00Z',user_metadata:{display_name:'Researcher',admin:true},factors:[]};
function fixture(options={}){
  const calls=[];let claimSaved=false;
  const fetch=async(address,request)=>{
    const url=new URL(address),body=request.body?JSON.parse(request.body):null;calls.push({url:url.pathname,query:url.search,body,headers:request.headers});
    const data=(value,status=200)=>Response.json(value,{status});
    if(url.pathname==='/auth/v1/admin/generate_link')return options.unknownAccount?data({message:'User not found'},404):data({email_otp:'123456',verification_type:body.type});
    if(url.pathname==='/auth/v1/admin/users/'+id)return data({...user,email:body.email});
    if(url.pathname==='/auth/v1/recover')return data({});
    if(url.pathname==='/auth/v1/user'&&request.method==='PUT')return data(user);
    if(url.pathname==='/auth/v1/otp')return options.otpError?data({message:'User not found'},400):data({});
    if(url.pathname==='/auth/v1/verify'||url.pathname==='/auth/v1/token')return data({access_token:jwt('aal1'),refresh_token:'private-refresh-token',expires_in:options.shortExpiry?1:3600,user:options.proofEmail&&url.pathname==='/auth/v1/verify'?{...user,email:body.email}:user});
    if(url.pathname==='/auth/v1/user')return data(options.unconfirmed?{...user,email_confirmed_at:null}:user);
    if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
    if(url.pathname==='/rest/v1/rpc/directory_api'){
      if(body.p_action==='account_verify')return data({verified:options.invalidAccountCode!==true});
      if(body.p_action==='account_email_ready')return data({email:'new@university.test'});
      if(body.p_action==='claim_source'){claimSaved=true;return data({claim:{id:'recorded-claim',state:'review'}});}
      if(body.p_action==='session'&&claimSaved&&options.postClaimRefreshError)return data({code:'42501',message:'Admin permission required'},403);
      if(body.p_action==='session'&&options.sessionRefreshError)return data({message:'Temporarily unavailable'},503);
      if(body.p_action==='session')return data({admin:false,managedSources:[],claims:[],tagSuggestions:[],submissions:[]});
      if(body.p_action==='rate_source')return data({rating:{average:body.p_payload.stars,count:1,own:body.p_payload.stars}});
      if(body.p_action==='community')return options.databaseError?data({message:'Function not available'},404):data({sources:{}});
      return data({allowed:true});
    }
    throw Error('Unexpected upstream '+address);
  };
  const jar=new Map();let csrfToken;
  const call=async(path,body,options={})=>{
    const headers={'Origin':'https://id-ebp.org','Content-Type':'application/json',...options.headers};
    if(jar.size)headers.Cookie=[...jar].map(([key,value])=>key+'='+value).join('; ');
    if(csrfToken&&!Object.hasOwn(headers,'X-CSRF-Token'))headers['X-CSRF-Token']=csrfToken;
    const response=await handleApi(new Request('https://id-ebp.org'+path,{method:options.method||(body===undefined?'GET':'POST'),headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),options.env||env,{fetch});
    for(const value of response.headers.getSetCookie()){const [pair]=value.split(';'),[key,valuePart]=pair.split(/=(.*)/s);if(valuePart)jar.set(key,valuePart);else jar.delete(key);}
    const result=await response.json();if(result.csrfToken)csrfToken=result.csrfToken;
    return {response,result};
  };
  const signIn=async()=>{await call('/api/auth/request',{email:user.email,createAccount:true});return call('/api/auth/verify',{email:user.email,token:'123456'});};
  return {call,calls,jar,signIn,get csrf(){return csrfToken;}};
}
test('unconfigured API reports availability accurately and accepts no account data',async()=>{
  const f=fixture();const {result}=await f.call('/api/status',undefined,{env:{}});assert.equal(result.configured,false);assert.equal(result.features.ratings,false);
  const blocked=await f.call('/api/auth/request',{email:user.email},{env:{}});assert.equal(blocked.response.status,503);assert.equal(blocked.result.error.code,'setup_required');assert.equal(f.calls.length,0);
});
test('email activation flag keeps requests closed until the provider and numeric template work',async()=>{
  const f=fixture();const disabled={...env,AUTH_EMAIL_ENABLED:'false'};
  const status=await f.call('/api/status',undefined,{env:disabled});assert.equal(status.result.configured,true);assert.equal(status.result.email,false);assert.equal(status.result.registrations,false);
  const response=await f.call('/api/auth/request',{email:user.email},{env:disabled});assert.equal(response.result.error.code,'auth_email_unavailable');assert.equal(f.calls.filter(c=>c.url==='/auth/v1/otp').length,0);
});
test('verified login uses encrypted HttpOnly cookies and fresh server Auth identity; metadata cannot grant admin',async()=>{
  const f=fixture();const {response,result}=await f.signIn();assert.equal(response.status,200);assert.equal(result.user.email,user.email);assert.equal(result.user.admin,false);
  assert.ok(f.calls.some(x=>x.url==='/auth/v1/user'));assert.ok(f.csrf);
  for(const value of response.headers.getSetCookie()){assert.match(value,/Secure; HttpOnly; SameSite=Lax/);assert.doesNotMatch(value,/private-refresh-token|signature-validated/);}
  assert.doesNotMatch(JSON.stringify(result),/private-refresh-token|sb_secret|access_token/);
  const action=f.calls.find(x=>x.body?.p_action==='session');assert.equal(action.body.p_actor,id);assert.equal(action.body.p_session,sid);assert.equal(action.headers.apikey,env.SUPABASE_SECRET_KEY);
  const logout=await f.call('/api/auth/logout',{});assert.equal(logout.result.user,null);assert.equal(f.jar.has('__Host-idebp_session'),false);
});
test('login code must match a code request made in this browser and unknown email does not leak membership',async()=>{
  const f=fixture({otpError:true});let response=await f.call('/api/auth/verify',{email:user.email,token:'123456'});assert.equal(response.result.error.code,'request_code_first');
  response=await f.call('/api/auth/request',{email:user.email,createAccount:false});assert.equal(response.response.status,200);assert.equal(response.result.sent,true);
  response=await f.call('/api/auth/verify',{email:'different@university.test',token:'123456'});assert.equal(response.result.error.code,'request_code_first');
});
test('unconfirmed email cannot create a member session',async()=>{
  const f=fixture({unconfirmed:true});const response=await f.signIn();assert.equal(response.response.status,403);assert.equal(response.result.error.code,'email_not_confirmed');
});
test('cross-site requests, absent CSRF and tampered cookies cannot mutate a rating',async()=>{
  const f=fixture();await f.signIn();
  let result=await f.call('/api/sources/fixture/rating',{stars:5},{method:'PUT',headers:{Origin:'https://attacker.test'}});assert.equal(result.response.status,403);assert.equal(result.result.error.code,'origin_denied');
  const raw=new Request('https://id-ebp.org/api/sources/fixture/rating',{method:'PUT',headers:{Origin:'https://id-ebp.org','Content-Type':'application/json',Cookie:[...f.jar].map(([k,v])=>k+'='+v).join('; ')},body:'{"stars":5}'});
  result=await handleApi(raw,env,{fetch:async()=>Response.json(user)});assert.equal(result.status,403);assert.equal((await result.json()).error.code,'csrf_failed');
  f.jar.set('__Host-idebp_session',f.jar.get('__Host-idebp_session')+'tampered');result=await f.call('/api/sources/fixture/rating',{stars:5},{method:'PUT'});assert.equal(result.response.status,401);
  assert.equal(f.calls.filter(x=>x.body?.p_action==='rate_source').length,0);
});
test('zero-star write is preserved and fractional/out-of-range ratings are rejected',async()=>{
  const f=fixture();await f.signIn();let response=await f.call('/api/sources/fixture/rating',{stars:0},{method:'PUT'});assert.equal(response.response.status,200);assert.equal(response.result.rating.own,0);
  for(const stars of [-1,6,2.5,'3',null]){response=await f.call('/api/sources/fixture/rating',{stars},{method:'PUT'});assert.equal(response.response.status,400);assert.equal(response.result.error.code,'invalid_rating');}
});
test('refresh preserves CSRF and remains private and uncacheable',async()=>{
  const f=fixture({shortExpiry:true});await f.signIn();const old=f.csrf;const response=await f.call('/api/session');assert.equal(response.result.csrfToken,old);assert.ok(f.calls.some(x=>x.url==='/auth/v1/token'));
  assert.match(response.response.headers.get('cache-control'),/private, no-store/);assert.equal(response.response.headers.get('vary'),'Cookie');
});
test('body parser refuses oversized submissions without retaining the full body',async()=>{
  const f=fixture();const response=await f.call('/api/auth/request',{email:user.email,displayName:'x'.repeat(20000)});assert.equal(response.response.status,413);assert.equal(response.result.error.code,'body_too_large');
});

test('environment configuration alone cannot announce accounts before the database migration is ready',async()=>{
 const f=fixture({databaseError:true});const {result}=await f.call('/api/status');
 assert.equal(result.configured,false);assert.equal(result.email,false);assert.equal(result.features.ratings,false);
});

test('password resets issue recovery codes to the account email and use the recovery verification type',async()=>{
 const f=fixture();const active={...env,AUTH_MAIL_TRANSPORT:'worker'};
 let r=await f.call('/api/auth/request',{email:user.email,purpose:'reset',createAccount:true},{env:active});
 assert.equal(r.response.status,200);assert.equal(r.result.internalDelivery.email,user.email);assert.equal(r.result.internalDelivery.purpose,'reset');
 assert.equal(f.calls.find(c=>c.url==='/auth/v1/admin/generate_link').body.type,'recovery');
 r=await f.call('/api/auth/verify',{email:user.email,token:'123456'},{env:active});assert.equal(r.result.recovery,true);
 assert.equal(f.calls.find(c=>c.url==='/auth/v1/verify').body.type,'recovery');
 r=await f.call('/api/auth/password-change',{password:'a-long-new-password'});assert.equal(r.response.status,200);
 assert.equal(f.calls.filter(c=>c.url==='/auth/v1/user'&&c.body?.password).length,1);
 r=await f.call('/api/auth/verify',{email:user.email,token:'123456'});assert.equal(r.response.status,400);
});
test('unknown reset addresses receive a neutral response and never create an account',async()=>{
 const f=fixture({unknownAccount:true});const r=await f.call('/api/auth/request',{email:'unknown@example.test',purpose:'reset',createAccount:true},{env:{...env,AUTH_MAIL_TRANSPORT:'worker'}});
 assert.equal(r.response.status,200);assert.equal(r.result.sent,true);assert.equal(r.result.internalDelivery,undefined);
 assert.equal(f.calls.filter(c=>c.url==='/auth/v1/admin/generate_link').length,1);
 assert.ok(!f.calls.some(c=>c.body?.type==='signup'));
});
test('removed authenticator routes cannot enrol a factor or block an approved session',async()=>{
 const f=fixture();await f.signIn();const r=await f.call('/api/auth/mfa/enrol',{});assert.equal(r.response.status,404);
 assert.ok(!f.calls.some(c=>c.url.includes('/factors')));
 const status=await f.call('/api/status');assert.equal(status.result.authenticatorRequired,false);assert.equal(status.result.passwordResets,true);
});

test('claim requires a fresh source-bound mailbox code and permits empty supporting details',async()=>{
 const f=fixture(),active={...env,AUTH_MAIL_TRANSPORT:'worker'};
 let r=await f.call('/api/sources/fixture/claim',{email:user.email,token:'123456'},{env:active});assert.equal(r.result.error.code,'request_code_first');
 r=await f.call('/api/sources/fixture/claim-code',{email:user.email},{env:active});assert.equal(r.result.sent,true);assert.equal(r.result.internalDelivery.purpose,'claim');assert.equal(f.jar.has('__Host-idebp_claim'),true);
 r=await f.call('/api/sources/another-source/claim',{email:user.email,token:'123456'},{env:active});assert.equal(r.result.error.code,'request_code_first');
 r=await f.call('/api/sources/fixture/claim',{email:user.email,token:'123456',evidence:'',evidenceUrl:''},{env:active});assert.equal(r.response.status,201);
 const claim=f.calls.find(c=>c.body?.p_action==='claim_source');assert.equal(claim.body.p_payload.contactEmail,user.email);assert.equal(claim.body.p_payload.mailboxVerified,true);assert.equal(claim.body.p_payload.evidence,'');assert.equal(f.jar.has('__Host-idebp_claim'),false);
 await f.call('/api/session');r=await f.call('/api/sources/fixture/claim',{email:user.email,token:'123456'},{env:active});assert.equal(r.result.error.code,'request_code_first');
});
test('a signed-in admin can prove a different source mailbox without switching their account',async()=>{
 const f=fixture({proofEmail:true}),active={...env,AUTH_MAIL_TRANSPORT:'worker'};await f.signIn();
 await f.call('/api/sources/fixture/claim-code',{email:'editor@source.test'},{env:active});
 const r=await f.call('/api/sources/fixture/claim',{email:'editor@source.test',token:'123456'},{env:active});assert.equal(r.response.status,201);assert.equal(r.result.session.user.email,user.email);
 assert.equal(f.calls.find(c=>c.body?.p_action==='claim_source').body.p_payload.contactEmail,'editor@source.test');
});

test('a recorded claim stays successful when its subsequent session read is forbidden',async()=>{
 const f=fixture({postClaimRefreshError:true}),active={...env,AUTH_MAIL_TRANSPORT:'worker'};await f.signIn();await f.call('/api/sources/fixture/claim-code',{email:user.email},{env:active});
 const r=await f.call('/api/sources/fixture/claim',{email:user.email,token:'123456'},{env:active});assert.equal(r.response.status,201);assert.equal(r.result.claim.id,'recorded-claim');assert.equal(r.result.sessionRefreshPending,true);assert.equal(r.result.error,undefined);
});
test('saved-source routes require a verified matching account and CSRF; identity is never supplied by the body',async()=>{
 const f=fixture();let r=await f.call('/api/saved');assert.equal(r.response.status,401);await f.signIn();
 r=await f.call('/api/saved/research',{userId:'another-user'},{method:'PUT',headers:{'X-IDEBP-Account':'another-user'}});assert.equal(r.response.status,409);
 r=await f.call('/api/saved/research',{}, {method:'PUT',headers:{'X-IDEBP-Account':id,'X-CSRF-Token':'wrong'}});assert.equal(r.response.status,403);
 r=await f.call('/api/saved/research',{userId:'another-user'},{method:'PUT',headers:{'X-IDEBP-Account':id}});assert.equal(r.response.status,200);
 const write=f.calls.find(c=>c.body?.p_action==='save_source');assert.equal(write.body.p_actor,id);assert.deepEqual(write.body.p_payload,{slug:'research'});
 r=await f.call('/api/saved',undefined,{headers:{'X-IDEBP-Account':id}});assert.equal(r.response.status,200);assert.match(r.response.headers.get('cache-control'),/no-store/);
});

test('a consumed recovery code keeps verified identity, CSRF and reset screen through session refresh failure',async()=>{
 const f=fixture({sessionRefreshError:true}),active={...env,AUTH_MAIL_TRANSPORT:'worker'};await f.call('/api/auth/request',{email:user.email,purpose:'reset'},{env:active});const verified=await f.call('/api/auth/verify',{email:user.email,token:'123456'},{env:active});assert.equal(verified.response.status,200);assert.equal(verified.result.sessionRefreshPending,true);assert.equal(verified.result.recoveryVerified,true);assert.equal(verified.result.user.id,id);assert.equal(verified.result.user.admin,false);assert.ok(verified.result.csrfToken);const reset=await f.call('/api/auth/password-change',{password:'A unique fixture password for testing'});assert.equal(reset.response.status,200);assert.equal(reset.result.recoveryVerified,false);assert.ok(f.calls.some(c=>c.url==='/auth/v1/user'&&c.body?.password));
});
test('public requests cannot execute internal maintenance or mail jobs',async()=>{
 const f=fixture();const r=await f.call('/api/internal/outbox-take',{});assert.equal(r.response.status,404);assert.equal(f.calls.length,0);
});

test('account email changes use scoped hashed proofs for both mailboxes and export/deletion stay authenticated',async()=>{
 const f=fixture(),active={...env,AUTH_MAIL_TRANSPORT:'worker'};let result=await f.call('/api/account/export');assert.equal(result.response.status,401);await f.signIn();
 result=await f.call('/api/account/verification',{kind:'email_new',email:'new@university.test'},{env:active});assert.equal(result.result.sent,true);assert.equal(result.result.internalDelivery.purpose,'account');const challenge=f.calls.find(c=>c.body?.p_action==='account_challenge').body;assert.equal(challenge.p_actor,id);assert.match(challenge.p_payload.hash,/^[a-f0-9]{64}$/);assert.equal(challenge.p_payload.code,undefined);
 result=await f.call('/api/account/email',{currentCode:'123456',newCode:'654321',userId:'other'});assert.equal(result.response.status,200);assert.equal(result.result.email,'new@university.test');const proofs=f.calls.filter(c=>c.body?.p_action==='account_verify');assert.deepEqual(proofs.map(c=>c.body.p_payload.kind),['email_current','email_new']);assert.ok(f.calls.some(c=>c.url==='/auth/v1/admin/users/'+id&&c.body.email_confirm===true));
 result=await f.call('/api/account/deletion-request',{token:'123456'});assert.equal(result.response.status,202);assert.equal(f.calls.at(-1).body.p_action,'account_delete_request');
 const rejected=fixture({invalidAccountCode:true});await rejected.signIn();result=await rejected.call('/api/account/email',{currentCode:'123456',newCode:'654321'});assert.equal(result.response.status,400);assert.ok(!rejected.calls.some(c=>c.url.startsWith('/auth/v1/admin/users/')));
});
