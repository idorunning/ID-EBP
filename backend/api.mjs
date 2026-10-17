// Same-origin API. No key, access token or refresh token is returned to browser JS.
// This module runs unchanged in Cloudflare Workers or a Supabase Edge Function.
const SESSION_COOKIE='__Host-idebp_session', LOGIN_COOKIE='__Host-idebp_login', CLAIM_COOKIE='__Host-idebp_claim';
const encoder=new TextEncoder(), decoder=new TextDecoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
class ApiError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
function fail(status,code,message){throw new ApiError(status,code,message);}
function cookies(request){return Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(x=>x.trim().split(/=(.*)/s)).filter(x=>x[0]));}
async function key(secret){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode('ID-EBP session v1\0'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(data,secret){const iv=crypto.getRandomValues(new Uint8Array(12));const value=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),encoder.encode(JSON.stringify(data)));return b64(iv)+'.'+b64(new Uint8Array(value));}
async function open(value,secret){try{if(!value||value.length>7000)return null;const [iv,body]=value.split('.');const data=JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},await key(secret),unb64(body))));return data.until>Date.now()?data:null;}catch{return null;}}
function cookie(name,value,age=604800){return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;}
async function jsonBody(request){
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail(415,'json_required','Send a JSON request.');
  const reader=request.body?.getReader(),chunks=[];let size=0;
  if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();fail(413,'body_too_large','The submitted details are too long.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{const value=JSON.parse(decoder.decode(bytes));if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value;}catch{fail(400,'invalid_json','The submitted details must be a JSON object.');}
}
function email(value){if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))fail(400,'invalid_email','Enter a valid email address.');return value.trim().toLowerCase();}
function csrf(request,session){const submitted=request.headers.get('X-CSRF-Token')||'';if(submitted.length!==session.csrf.length||submitted!==session.csrf)fail(403,'csrf_failed','Refresh this page before submitting the change.');}
function sameOrigin(request){const origin=request.headers.get('Origin');if(origin!==new URL(request.url).origin)fail(403,'origin_denied','Submit changes from this website.');if(request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'origin_denied','Submit changes from this website.');}
function claims(token){try{return JSON.parse(decoder.decode(unb64(token.split('.')[1])));}catch{return {};}}
function settings(env){const base=String(env.SUPABASE_URL||'').replace(/\/$/,'');const publicKey=env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;const secret=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;return {base,publicKey,secret,sessionSecret:env.SESSION_SECRET||secret,configured:/^https:\/\/[^/]+\.supabase\.co$/.test(base)&&Boolean(publicKey)&&Boolean(secret),emailEnabled:env.AUTH_EMAIL_ENABLED==='true'};}

export async function handleApi(request,env={},context={}){
  const config=settings(env), url=new URL(request.url),path=url.pathname, method=request.method;
  const responseHeaders=new Headers({'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Vary':'Cookie','X-Content-Type-Options':'nosniff'});
  const reply=(data,status=200)=>Response.json(data,{status,headers:responseHeaders});
  const fetcher=context.fetch||fetch;
  let current=null, user=null;
  async function upstream(path,body,{token,service=false,method='POST'}={}){
    const credential=service?config.secret:config.publicKey;
    const headers={apikey:credential,'Content-Type':'application/json'};
    if(token)headers.Authorization='Bearer '+token;
    else if(service&&credential.split('.').length===3)headers.Authorization='Bearer '+credential;
    let response;
    try{response=await fetcher(config.base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});}catch{fail(503,'service_unavailable','The account service is temporarily unavailable. Please try again.');}
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(path==='/auth/v1/admin/generate_link'&&[400,404,422].includes(response.status))fail(400,'invalid_details','The account request could not be accepted.');
      if(data.code==='42501'||response.status===403){
        const reason=String(data.message||'');
        const code=reason==='password_change_required'?reason:/suspend/i.test(reason)?'account_suspended':/ownership conflict|email changed/i.test(reason)?'ownership_conflict':/admin/i.test(reason)?'admin_required':/cannot rate.*own|representatives cannot rate/i.test(reason)?'own_source_rating':/manager|source owner|representative/i.test(reason)?'source_access_required':'forbidden';
        fail(403,code,'You do not have permission to make this change.');
      }
      if(data.code==='P0001'&&data.message==='rate_limited'||response.status===429)fail(429,'rate_limited','Too many requests. Please wait before trying again.');
      if(response.status===401)fail(401,'sign_in_required','Please sign in again.');
      if(data.code==='P0002')fail(404,'not_found','This source could not be found.');
      if(data.code==='23505')fail(409,'already_submitted','This contribution has already been submitted.');
      if(path==='/auth/v1/verify'&&[400,422].includes(response.status))fail(400,'invalid_code','That code is invalid or has expired.');
      if(['23514','22023','22P02','23502'].includes(data.code)||response.status===400||response.status===422)fail(400,'invalid_details',path.startsWith('/auth/')?'The email or verification code could not be accepted.':'Check the submitted details and try again.');
      fail(503,'service_unavailable','The account service is temporarily unavailable. Please try again.');
    }
    return data;
  }
  const rpc=(action,payload={},actor=null)=>upstream('/rest/v1/rpc/directory_api',{p_action:action,p_payload:payload,p_actor:actor?.id||null,p_session:actor?claims(current.access).session_id||null:null,p_assurance:actor?claims(current.access).aal||'aal1':'aal1'},{service:true});
  async function rate(scope,identity,limit,seconds){const digest=await crypto.subtle.digest('SHA-256',encoder.encode('ID-EBP rate v1\0'+config.sessionSecret+'\0'+identity));await rpc('rate_limit',{key:scope+':'+b64(new Uint8Array(digest)),limit,seconds});}
  async function writeSession(data){
    current={access:data.access_token,refresh:data.refresh_token,expires:Date.now()+(data.expires_in||3600)*1000,csrf:random(),until:Date.now()+604800000};
    responseHeaders.append('Set-Cookie',cookie(SESSION_COOKIE,await seal(current,config.sessionSecret)));
  }
  async function authenticate(required=true){
    if(user)return user;
    current=current||await open(cookies(request)[SESSION_COOKIE],config.sessionSecret);
    if(!current){if(required)fail(401,'sign_in_required','Sign in to contribute.');return null;}
    if(current.expires<Date.now()+30000){
      try{const refreshed=await upstream('/auth/v1/token?grant_type=refresh_token',{refresh_token:current.refresh});const oldCsrf=current.csrf,recoveryUntil=current.recoveryUntil;await writeSession(refreshed);current.csrf=oldCsrf;current.recoveryUntil=recoveryUntil;responseHeaders.set('Set-Cookie',cookie(SESSION_COOKIE,await seal(current,config.sessionSecret)));}catch(error){responseHeaders.append('Set-Cookie',cookie(SESSION_COOKIE,'',0));throw error;}
    }
    const result=await upstream('/auth/v1/user',undefined,{token:current.access,method:'GET'});
    if(!result.id||!result.email_confirmed_at||result.is_anonymous)fail(403,'email_not_confirmed','Confirm your email before contributing.');
    user=result;return user;
  }
  async function sessionData(){
    const member=await authenticate(false);if(!member)return {user:null};
    const data=await rpc('session',{},member);
    return {...data,user:{id:member.id,email:member.email,displayName:data.displayName??member.user_metadata?.display_name??'',emailConfirmed:true,admin:data.admin===true},csrfToken:current.csrf,recoveryVerified:(current.recoveryUntil||0)>Date.now()};
  }
  // A committed write must not become an error because a subsequent read fails.
  async function sessionAfterWrite(fallbackUser=user){
    try{return {session:await sessionData()};}
    catch(error){if(error.code==='email_not_confirmed')throw error;return {session:{user:fallbackUser?.email_confirmed_at?{id:fallbackUser.id,email:fallbackUser.email,displayName:fallbackUser.user_metadata?.display_name||'',emailConfirmed:true,admin:false}:null,csrfToken:current?.csrf,recoveryVerified:(current?.recoveryUntil||0)>Date.now()},sessionRefreshPending:true};}
  }
  try{
    if(path.startsWith('/api/internal/')){
      if(context.trustedTask!==true||method!=='POST')fail(404,'not_found','This action is not available.');
      const action=path.slice('/api/internal/'.length).replaceAll('-','_');
      if(!['maintenance_take','maintenance_complete','outbox_take','outbox_complete'].includes(action))fail(404,'not_found','Unknown task.');
      return reply(await rpc(action,await jsonBody(request)));
    }
    if(path==='/api/status'&&method==='GET'){
      let ready=config.configured;
      if(ready){try{await rpc('community');}catch{ready=false;}}
      return reply({configured:ready,databaseReady:ready,mode:ready?'connected':'setup_required',authentication:ready,registrations:ready&&config.emailEnabled,email:ready&&config.emailEnabled,publicRecommendations:false,authenticatorRequired:false,passwordResets:ready&&config.emailEnabled,features:{savedSources:ready,accounts:ready,sourceManagement:ready,sourceSuggestions:ready,ratings:ready,tags:ready},message:ready?(config.emailEnabled?'Member accounts are available.':'Email sign-in is being connected. Existing members can continue to use their account.'):'Member accounts are being connected. You can browse every source.'});
    }
    if(!config.configured){if(path==='/api/session'&&method==='GET')return reply({user:null});if(path==='/api/community'&&method==='GET')return reply({sources:{}});fail(503,'setup_required','Member accounts are being connected. You can browse every source.');}
    if(!['GET','POST','PUT','PATCH','DELETE'].includes(method))fail(405,'method_not_allowed','This request method is not supported.');
    if(method!=='GET'){sameOrigin(request);if(Number(request.headers.get('Content-Length'))>16384)fail(413,'body_too_large','The submitted details are too long.');}
    if(path==='/api/session'&&method==='GET')return reply(await sessionData());
    if(path==='/api/community'&&method==='GET')return reply(await rpc('community'));
    if(path==='/api/auth/request'&&method==='POST'){
      if(!config.emailEnabled)fail(503,'auth_email_unavailable','Email sign-in is being connected. Please try again later.');
      const body=await jsonBody(request), address=email(body.email),recovery=body.purpose==='reset';
      await rate('otp-ip',context.clientIp||request.headers.get('CF-Connecting-IP')||'unknown',20,3600);
      await rate('otp-email',address,3,600);
      await rate('otp-global','directory',100,3600);
      const displayName=String(body.displayName||'').trim();if(displayName.length>120)fail(400,'invalid_details','Use a shorter display name.');
      // Supabase issues the one-time code; the trusted Worker delivers it.
      // This internal payload is consumed and stripped before the browser reply.
      let delivery=null,otpType=recovery?'recovery':'email';
      if(env.AUTH_MAIL_TRANSPORT==='worker') {
        let generated;
        try { generated=await upstream('/auth/v1/admin/generate_link',{type:recovery?'recovery':'magiclink',email:address},{service:true}); }
        catch(error) {
          if(error.status!==400)throw error;
          if(!recovery&&body.createAccount===true){generated=await upstream('/auth/v1/admin/generate_link',{type:'signup',email:address,password:random()+random(),data:{display_name:displayName}},{service:true});otpType='signup';}
        }
        if(generated){const code=generated.email_otp||generated.properties?.email_otp;if(!/^\d{6,10}$/.test(code||''))fail(503,'auth_email_unavailable','Email sign-in is temporarily unavailable.');delivery={email:address,code,purpose:recovery?'reset':'signin'};otpType=recovery?'recovery':generated.verification_type||generated.properties?.verification_type||otpType;}
      } else {
        try{if(recovery)await upstream('/auth/v1/recover',{email:address});else await upstream('/auth/v1/otp',{email:address,create_user:body.createAccount===true,data:{display_name:displayName}});}catch(error){if(!(error instanceof ApiError)||error.status!==400)throw error;}
      }
      responseHeaders.append('Set-Cookie',cookie(LOGIN_COOKIE,await seal({email:address,type:otpType,purpose:recovery?'reset':'signin',until:Date.now()+600000},config.sessionSecret),600));
      return reply({sent:true,message:recovery?'If this address has an account, a password-reset code is on its way. Check your email.':'If this address can sign in, a verification code is on its way. Check your email.',...(delivery?{internalDelivery:delivery}:{})});
    }
    if(path==='/api/auth/password'&&method==='POST'){
      const body=await jsonBody(request),address=email(body.email);
      await rate('password-ip',context.clientIp||request.headers.get('CF-Connecting-IP')||'unknown',12,600);
      await rate('password-email',address,8,600);
      if(typeof body.password!=='string'||body.password.length>200)fail(400,'invalid_details','Check your sign-in details.');
      const data=await upstream('/auth/v1/token?grant_type=password',{email:address,password:body.password});
      if(!data.access_token||!data.refresh_token)fail(401,'sign_in_required','Check your sign-in details.');
      await writeSession(data);user=null;const after=await sessionAfterWrite(data.user);return reply(after.session||{signedIn:true,sessionRefreshPending:true});
    }
    if(path==='/api/auth/verify'&&method==='POST'){
      const body=await jsonBody(request),address=email(body.email),login=await open(cookies(request)[LOGIN_COOKIE],config.sessionSecret);
      if(!login||login.email!==address)fail(400,'request_code_first','Request a new code from this browser first.');
      if(typeof body.token!=='string'||!/^\d{6,10}$/.test(body.token))fail(400,'invalid_code','Enter the verification code from your email.');
      await rate('otp-verify',context.clientIp||request.headers.get('CF-Connecting-IP')||'unknown',20,600);
      const data=await upstream('/auth/v1/verify',{type:login.type||'email',email:address,token:body.token});
      if(!data.access_token||!data.refresh_token)fail(401,'invalid_code','Request a new verification code.');
      await writeSession(data);user=null;
      if(login.purpose==='reset'){current.recoveryUntil=Date.now()+600000;responseHeaders.set('Set-Cookie',cookie(SESSION_COOKIE,await seal(current,config.sessionSecret)));}
      responseHeaders.append('Set-Cookie',cookie(LOGIN_COOKIE,'',0));
      const after=await sessionAfterWrite(data.user);return reply({...after.session,sessionRefreshPending:after.sessionRefreshPending===true,recovery:login.purpose==='reset'});
    }
    const sourceMatch=path.match(/^\/api\/sources\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(community|profile|rating|tags|claim|claim-code|team|invite-editor|accept-editor|revoke-editor)$/);
    if(sourceMatch&&method==='POST'&&['claim-code','claim'].includes(sourceMatch[2])){
      const [,slug,kind]=sourceMatch,body=await jsonBody(request),address=email(body.email);
      const member=await authenticate(false);if(member)csrf(request,current);
      if(kind==='claim-code'){
        if(!config.emailEnabled||env.AUTH_MAIL_TRANSPORT!=='worker')fail(503,'auth_email_unavailable','Email verification is temporarily unavailable.');
        await rpc('profile',{slug});
        await rate('claim-code-ip',context.clientIp||request.headers.get('CF-Connecting-IP')||'unknown',15,3600);
        await rate('claim-code-email',address,3,600);await rate('claim-code-global','directory',100,3600);
        let generated,otpType='email';
        try{generated=await upstream('/auth/v1/admin/generate_link',{type:'magiclink',email:address},{service:true});}
        catch(error){if(error.status!==400)throw error;generated=await upstream('/auth/v1/admin/generate_link',{type:'signup',email:address,password:random()+random()},{service:true});otpType='signup';}
        const code=generated.email_otp||generated.properties?.email_otp;
        if(!/^\d{6,10}$/.test(code||''))fail(503,'auth_email_unavailable','Email verification is temporarily unavailable.');
        otpType=generated.verification_type||generated.properties?.verification_type||otpType;
        responseHeaders.append('Set-Cookie',cookie(CLAIM_COOKIE,await seal({slug,email:address,actor:member?.id||null,type:otpType,until:Date.now()+600000},config.sessionSecret),600));
        return reply({sent:true,expiresIn:600,internalDelivery:{email:address,code,purpose:'claim'}});
      }
      const challenge=await open(cookies(request)[CLAIM_COOKIE],config.sessionSecret);
      if(!challenge||challenge.slug!==slug||challenge.email!==address||challenge.actor!==(member?.id||null))fail(400,'request_code_first','Request a code for this email and source. Your form details have been kept.');
      if(typeof body.token!=='string'||!/^\d{6,10}$/.test(body.token))fail(400,'invalid_code','Enter the code from your email.');
      const evidence=String(body.evidence||'').trim(),evidenceUrl=String(body.evidenceUrl||'').trim();
      if(evidence.length>2000||evidenceUrl.length>2048||evidenceUrl&&!/^https:\/\/[^\s@]+$/.test(evidenceUrl))fail(400,'invalid_details','Check the optional information.');
      await rate('claim-verify',context.clientIp||request.headers.get('CF-Connecting-IP')||'unknown',20,600);
      const verified=await upstream('/auth/v1/verify',{type:challenge.type,email:address,token:body.token});
      if(!verified.access_token||!verified.user?.email_confirmed_at||verified.user?.email?.toLowerCase()!==address)fail(400,'invalid_code','The verification code could not be accepted.');
      // Keep an existing administrator/member account when proving a different
      // source mailbox. Anonymous claimants join using the mailbox just proved.
      if(!member){await writeSession(verified);user=verified.user;}
      const result=await rpc('claim_source',{slug,evidence,evidenceUrl,contactEmail:address,mailboxVerified:true},user);
      responseHeaders.append('Set-Cookie',cookie(CLAIM_COOKIE,'',0));
      return reply({...result,...await sessionAfterWrite()},201);
    }
    if(sourceMatch&&method==='GET'&&['community','profile'].includes(sourceMatch[2])){
      await authenticate(false);return reply(await rpc(sourceMatch[2]==='profile'?'profile':'source_community',{slug:sourceMatch[1]},user));
    }
    const actor=await authenticate();
    if(method!=='GET'){csrf(request,current);await rate('member-write',actor.id,120,3600);}
    if(path.startsWith('/api/saved')&&request.headers.get('X-IDEBP-Account')!==actor.id)fail(409,'account_changed','Sign in again before synchronising this collection.');

    if(path==='/api/account'&&method==='PATCH')return reply(await rpc('account_update',await jsonBody(request),actor));
    if(path==='/api/account/export'&&method==='GET')return reply(await rpc('account_export',{},actor));
    async function accountCodeHash(kind,code){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode('ID-EBP account proof\0'+config.sessionSecret+'\0'+actor.id+'\0'+kind+'\0'+code)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
    async function verifyAccountCode(kind,token){
      if(typeof token!=='string'||!/^\d{6}$/.test(token))fail(400,'invalid_code','Enter the six-digit code.');
      const result=await rpc('account_verify',{kind,hash:await accountCodeHash(kind,token)},actor);
      if(!result.verified)fail(400,'invalid_code','That code is invalid or has expired.');
    }
    if(path==='/api/account/verification'&&method==='POST'){
      if(!config.emailEnabled||env.AUTH_MAIL_TRANSPORT!=='worker')fail(503,'auth_email_unavailable','Email verification is unavailable.');
      const body=await jsonBody(request),kind=body.kind;
      if(!['email_current','email_new','deletion'].includes(kind))fail(400,'invalid_details','Choose an account action.');
      const address=kind==='email_new'?email(body.email):actor.email.toLowerCase();
      await rate('account-code',actor.id+':'+kind,3,600);
      const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
      await rpc('account_challenge',{kind,targetEmail:address,hash:await accountCodeHash(kind,code)},actor);
      return reply({sent:true,internalDelivery:{email:address,code,purpose:'account'}});
    }
    if(path==='/api/account/email'&&method==='POST'){
      const body=await jsonBody(request);await verifyAccountCode('email_current',body.currentCode);await verifyAccountCode('email_new',body.newCode);
      const ready=await rpc('account_email_ready',{},actor);
      await upstream('/auth/v1/admin/users/'+encodeURIComponent(actor.id),{email:ready.email,email_confirm:true},{service:true,method:'PUT'});
      // The email update is committed; a failed follow-up must not invite reuse
      // of the already-consumed verification codes.
      let refreshPending=false;try{await rpc('account_email_finish',{},actor);}catch{refreshPending=true;}
      return reply({updated:true,email:ready.email,sessionRefreshPending:refreshPending});
    }
    if(path==='/api/account/deletion-request'&&method==='POST'){
      const body=await jsonBody(request);await verifyAccountCode('deletion',body.token);
      return reply(await rpc('account_delete_request',{},actor),202);
    }
    if(path==='/api/admin/workflows'&&method==='GET')return reply(await rpc('admin_workflows',{},actor));

    if(path==='/api/saved'&&method==='GET')return reply(await rpc('saved_sources',{},actor));
    if(path==='/api/saved/import'&&method==='POST')return reply(await rpc('import_saved_sources',await jsonBody(request),actor));
    const savedMatch=path.match(/^\/api\/saved\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if(savedMatch&&['PUT','DELETE'].includes(method))return reply(await rpc(method==='PUT'?'save_source':'remove_saved_source',{slug:savedMatch[1]},actor));
    if(path==='/api/auth/password-change'&&method==='POST'){
      const body=await jsonBody(request);
      if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)fail(400,'invalid_details','Use a password of at least 12 characters.');
      await upstream('/auth/v1/user',{password:body.password},{token:current.access,method:'PUT'});
      await rpc('password_changed',{},actor);current.recoveryUntil=0;responseHeaders.set('Set-Cookie',cookie(SESSION_COOKIE,await seal(current,config.sessionSecret)));user=null;const after=await sessionAfterWrite();return reply({...after.session,sessionRefreshPending:after.sessionRefreshPending===true});
    }
    if(path==='/api/auth/logout'&&method==='POST'){
      await upstream('/auth/v1/logout?scope=local',undefined,{token:current.access});
      responseHeaders.append('Set-Cookie',cookie(SESSION_COOKIE,'',0));return reply({user:null});
    }
    if(path==='/api/sources'&&method==='POST')return reply(await rpc('submit_source',await jsonBody(request),actor),201);
    if(sourceMatch){
      const [,slug,kind]=sourceMatch;
      if(kind==='rating'&&method==='PUT'){const body=await jsonBody(request);if(!Number.isInteger(body.stars)||body.stars<0||body.stars>5)fail(400,'invalid_rating','Choose a whole-star rating from 0 to 5.');return reply(await rpc('rate_source',{slug,stars:body.stars},actor));}
      if(kind==='rating'&&method==='DELETE')return reply(await rpc('remove_rating',{slug},actor));
      if(kind==='tags'&&method==='POST'){const body=await jsonBody(request);return reply(await rpc('suggest_tag',{slug,label:body.label},actor),201);}
      if(['team','invite-editor','accept-editor','revoke-editor'].includes(kind))return reply(await rpc(kind.replaceAll('-','_'),{...(['POST','DELETE'].includes(method)?await jsonBody(request):{}),slug},actor));
      if(kind==='profile'&&method==='PATCH')return reply(await rpc('edit_profile',{slug,profile:await jsonBody(request)},actor),202);
    }
    if(path==='/api/admin/people'&&method==='GET')return reply(await rpc('admin_people',{},actor));
    if(path==='/api/admin/sources'&&method==='GET')return reply(await rpc('admin_sources',{},actor));
    if(path==='/api/admin/analytics'&&method==='GET')return reply(await rpc('admin_analytics',{},actor));
    if(path==='/api/admin/manage'&&method==='POST')return reply(await rpc('admin_manage',await jsonBody(request),actor));
    if(path==='/api/admin/review-status'&&method==='GET')return reply(await rpc('review_status',{kind:url.searchParams.get('kind'),id:url.searchParams.get('id')},actor));
    if(path==='/api/admin/review'&&method==='GET')return reply(await rpc('admin_review',{},actor));
    if(path==='/api/admin/review'&&method==='POST')return reply(await rpc('moderate',await jsonBody(request),actor));
    fail(404,'not_found','This account action could not be found.');
  }catch(error){return reply({error:{code:error instanceof ApiError?error.code:'service_unavailable',message:error instanceof ApiError?error.message:'The account service is temporarily unavailable. Please try again.'}},error instanceof ApiError?error.status:503);}
}
