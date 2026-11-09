import test from 'node:test';import assert from 'node:assert/strict';import {handleApi} from '../backend/api.mjs';
test('provider password commit followed by failed acknowledgement returns success and supports a retry',async()=>{
 const origin='https://www.id-ebp.org',id='10000000-0000-4000-8000-000000000001',sid='20000000-0000-4000-8000-000000000001';
 const user={id,email:'fixture@example.test',email_confirmed_at:'2026-11-09T00:00:00Z',user_metadata:{}};
 const access=['fixture',btoa(JSON.stringify({sub:id,session_id:sid,aal:'aal1'})),'fixture'].join('.');
 const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture-public',SUPABASE_SECRET_KEY:'fixture-private',SESSION_SECRET:'isolated-password-fixture-secret-long-enough',AUTH_EMAIL_ENABLED:'true',AUTH_MAIL_TRANSPORT:'worker'};
 let stored='original fixture password',fail=false,acks=0;
 const fetch=async(url,init)=>{
  const path=new URL(url).pathname,b=init.body?JSON.parse(init.body):null;
  if(path==='/auth/v1/token')return Response.json({access_token:access,refresh_token:'fixture-refresh',expires_in:3600,user});
  if(path==='/auth/v1/user'){
   if(init.method==='PUT'){if(stored===b.password)return Response.json({code:'same_password'},{status:422});stored=b.password;}
   return Response.json(user);
  }
  if(path==='/rest/v1/rpc/directory_api'){
   if(b.p_action==='password_change_begin')return Response.json({reconciled:stored!=='original fixture password'});
   if(b.p_action==='password_changed'){acks++;if(fail)return Response.json({message:'Unavailable'},{status:503});}
   return Response.json(b.p_action==='session'?{admin:true,passwordChangeRequired:stored==='original fixture password'}:{allowed:true});
  }throw Error('Unexpected path');
 };
 const signIn=await handleApi(new Request(origin+'/api/auth/password',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:stored})}),env,{fetch});
 const session=await signIn.json(),cookie=signIn.headers.getSetCookie()[0].split(';')[0];fail=true;
 const attempt=()=>handleApi(new Request(origin+'/api/auth/password-change',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':session.csrfToken},body:JSON.stringify({password:'new unique fixture password'})}),env,{fetch});
 const first=await attempt();assert.equal(first.status,200);const result=await first.json();assert.equal(result.passwordUpdated,true);assert.equal(result.sessionRefreshPending,true);assert.equal(stored,'new unique fixture password');
 fail=false;const retry=await attempt();assert.equal(retry.status,200);assert.equal((await retry.json()).passwordUpdated,true);assert.equal(acks,2);
});
