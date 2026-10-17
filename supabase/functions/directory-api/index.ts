import {handleApi} from '../../../backend/api.mjs';
// Only the website Worker may call this API. The database stores a hash of the
// proxy secret, not its plaintext value. Platform service credentials stay here.
const origins=new Set(['https://id-ebp.org','https://idebp-preview.ntracey.workers.dev']);
Deno.serve(async incoming=>{
 const secret=incoming.headers.get('X-IDEBP-Proxy-Key')||'';
 if(secret.length<32||secret.length>256)return Response.json({error:{code:'proxy_required'}},{status:403});
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const baseUrl=Deno.env.get('SUPABASE_URL')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 let verified=false;
 try {const check=await fetch(baseUrl+'/rest/v1/rpc/directory_api',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_action:'proxy_check',p_payload:{hash}})});verified=check.ok&&(await check.json()).valid===true;}catch{}
 if(!verified)return Response.json({error:{code:'proxy_required'}},{status:403});
 const origin=incoming.headers.get('Origin');if(origin&&!origins.has(origin))return Response.json({error:{code:'origin_denied'}},{status:403});
 const url=new URL(incoming.url),suffix=url.pathname.replace(/^(?:\/functions\/v1)?\/directory-api(?=\/|$)/,'');
 const request=new Request((origin||'https://id-ebp.org')+(suffix.startsWith('/api/')?suffix:'/api'+suffix)+url.search,incoming);
 return handleApi(request,{SUPABASE_URL:baseUrl,SUPABASE_ANON_KEY:Deno.env.get('SUPABASE_ANON_KEY'),SUPABASE_SERVICE_ROLE_KEY:service,SESSION_SECRET:Deno.env.get('SESSION_SECRET'),AUTH_EMAIL_ENABLED:incoming.headers.get('X-IDEBP-Mail-Ready')==='true'?'true':'false',AUTH_MAIL_TRANSPORT:'worker'},{trustedTask:incoming.headers.get('X-IDEBP-Internal')==='scheduled',clientIp:incoming.headers.get('X-IDEBP-Client-IP')||'unknown'});
});
