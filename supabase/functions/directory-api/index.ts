import {handleApi} from '../../../backend/api.mjs';
// Only the website Worker may call this API. The database stores a hash of the
// proxy secret, not its plaintext value. Platform service credentials stay here.
const origins=new Set(['https://www.id-ebp.org','https://id-ebp.org','https://idebp-preview.ntracey.workers.dev']);
const reject=(code,status)=>Response.json({error:{code}},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
Deno.serve(async incoming=>{
 const origin=incoming.headers.get('Origin');if(origin&&!origins.has(origin))return reject('origin_denied',403);
 const secret=incoming.headers.get('X-IDEBP-Proxy-Key')||'';
 if(secret.length<32||secret.length>256)return reject('proxy_required',403);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const baseUrl=Deno.env.get('SUPABASE_URL')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 let verified=false;
 try {
  const signal=AbortSignal.timeout(5000);
  const check=await fetch(baseUrl+'/rest/v1/rpc/directory_api',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_action:'proxy_check',p_payload:{hash}}),signal});
  if(!check.ok){check.body?.cancel().catch(()=>{});return reject('service_unavailable',503);}
  if(!/^application\/json(?:;|$)/i.test(check.headers.get('Content-Type')||'')){check.body?.cancel().catch(()=>{});throw Error('Invalid proxy response');}
  const reader=check.body?.getReader();let size=0,body='';const decoder=new TextDecoder();
  if(!reader)throw Error('Empty proxy response');
  const abort=()=>{reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
   signal.throwIfAborted();
   for(;;){const {done,value}=await reader.read();signal.throwIfAborted();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw Error('Oversized proxy response');}body+=decoder.decode(value,{stream:true});}
   body+=decoder.decode();verified=JSON.parse(body).valid===true;
  }finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
 }catch{return reject('service_unavailable',503);}
 if(!verified)return reject('proxy_required',403);
 const url=new URL(incoming.url),suffix=url.pathname.replace(/^(?:\/functions\/v1)?\/directory-api(?=\/|$)/,'');
 const request=new Request((origin||'https://id-ebp.org')+(suffix.startsWith('/api/')?suffix:'/api'+suffix)+url.search,incoming);
 return handleApi(request,{
  SUPABASE_URL:baseUrl,SUPABASE_ANON_KEY:Deno.env.get('SUPABASE_ANON_KEY'),SUPABASE_SERVICE_ROLE_KEY:service,SESSION_SECRET:Deno.env.get('SESSION_SECRET'),
  DIRECTORY_AUTH_SECRET_KEY:Deno.env.get('DIRECTORY_AUTH_SECRET_KEY'),SUPABASE_AUTH_SECRET_KEY:Deno.env.get('SUPABASE_AUTH_SECRET_KEY'),SUPABASE_SECRET_KEYS:Deno.env.get('SUPABASE_SECRET_KEYS'),AUTH_CLIENT_IP_FORWARDING_ENABLED:Deno.env.get('AUTH_CLIENT_IP_FORWARDING_ENABLED'),
  AUTH_PASSWORD_IP_LIMIT:Deno.env.get('AUTH_PASSWORD_IP_LIMIT'),AUTH_EMAIL_IP_LIMIT:Deno.env.get('AUTH_EMAIL_IP_LIMIT'),AUTH_EMAIL_GLOBAL_LIMIT:Deno.env.get('AUTH_EMAIL_GLOBAL_LIMIT'),AUTH_EMAIL_DAILY_LIMIT:Deno.env.get('AUTH_EMAIL_DAILY_LIMIT'),AUTH_VERIFY_IP_LIMIT:Deno.env.get('AUTH_VERIFY_IP_LIMIT'),
  AUTH_EMAIL_ENABLED:incoming.headers.get('X-IDEBP-Mail-Ready')==='true'?'true':'false',AUTH_MAIL_TRANSPORT:'worker'
 },{trustedTask:incoming.headers.get('X-IDEBP-Internal')==='scheduled',clientIp:incoming.headers.get('X-IDEBP-Client-IP')||'unknown',trustedClientIp:true});
});
