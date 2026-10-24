import {handleResearch} from '../backend/research.mjs';
import {runDirectoryTasks,serveSourceMedia,timedOperation,boundedBody,directoryEndpoint} from '../backend/maintenance.mjs';
import {ASSETS} from './assets.generated.mjs';
import {handleApi} from '../backend/api.mjs';
import {publicDocument,catalogueFromCommunity,sitemap} from '../backend/seo.mjs';
import {CATALOGUE} from './catalogue.generated.mjs';

// Share only simultaneous anonymous catalogue reads. No member response, cookie,
// or stale published record is retained after the upstream request finishes.
const communityReads=new WeakMap();
function readCommunity(env){
 if(communityReads.has(env))return communityReads.get(env);
 const reading=timedOperation(async signal=>{
  const endpoint=directoryEndpoint(env.DIRECTORY_API_URL);
  if(!env.DIRECTORY_PROXY_SECRET)throw Error('Account service proxy is not configured');
  const reply=await fetch(endpoint+'/api/community',{redirect:'manual',headers:{'X-IDEBP-Proxy-Key':env.DIRECTORY_PROXY_SECRET},signal});
  if(!reply.ok){await reply.body?.cancel();throw Error('Directory unavailable');}
  const data=JSON.parse(new TextDecoder().decode(await boundedBody(reply,4194304,signal)));
  if(!data||typeof data!=='object'||Array.isArray(data)||!data.sources||typeof data.sources!=='object'||Array.isArray(data.sources))throw Error('Invalid directory response');
  return data;
 },10000);
 communityReads.set(env,reading);
 void reading.finally(()=>{if(communityReads.get(env)===reading)communityReads.delete(env);}).catch(()=>{});
 return reading;
}
async function processApiResponse(response,request,env,signal){
 if([204,205,304].includes(response.status))return response;
 // All account endpoints return JSON. Validate and strip private delivery data
 // at the public boundary for both the proxied and direct backend paths.
 const data=JSON.parse(new TextDecoder().decode(await boundedBody(response,4194304,signal)));
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid account response');
 if(Object.hasOwn(data,'internalDelivery')){
  const delivery=data.internalDelivery;delete data.internalDelivery;
  const path=new URL(request.url).pathname;
  const deliveryRoute=path==='/api/auth/request'||path==='/api/account/verification'||/^\/api\/sources\/[a-z0-9-]+\/claim-code$/.test(path);
  if(response.ok&&request.method==='POST'&&deliveryRoute){
   const {email,code,purpose}=delivery||{};
   if(env.AUTH_EMAIL_ENABLED!=='true'||!env.EMAIL||typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof code!=='string'||!/^\d{6,10}$/.test(code))throw Error('Mail unavailable');
   const reset=purpose==='reset',claim=purpose==='claim',account=purpose==='account',label=account?'account verification':reset?'password-reset':claim?'source claim':'verification';
   const instruction=account?'Return to your account settings on id-ebp.org and enter this code for the action you requested.':reset?'Return to the password-reset screen to choose a new password.':claim?'Return to your claim form on id-ebp.org and enter this code, then press Send claim.':'Enter it on id-ebp.org to sign in.';
   await timedOperation(()=>env.EMAIL.send({to:email,from:{email:'sign-in@auth.id-ebp.org',name:'ID-EBP'},subject:`Your ID-EBP ${label} code`,text:`Your ID-EBP ${label} code is ${code}. ${instruction} This code expires in 10 minutes. Do not share it. If you did not request it, ignore this email.`,html:`<p>Your ID-EBP ${label} code is:</p><h2>${code}</h2><p>${instruction} This code expires in 10 minutes. Do not share it. If you did not request it, ignore this email.</p>`}));
  }
 }
 const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');
 return Response.json(data,{status:response.status,headers});
}

export default {
  async scheduled(controller,env,context){
    // Use the event's scheduled time, not delivery time, so a delayed trigger
    // cannot turn a five-minute notice run into an extra source-check batch.
    const scheduledAt=new Date(controller.scheduledTime),valid=Number.isFinite(scheduledAt.getTime());
    context.waitUntil(runDirectoryTasks(env,{maintenance:valid&&scheduledAt.getUTCMinutes()%30===0,scheduledTime:valid?scheduledAt.toISOString():null,report:summary=>console.log(JSON.stringify(summary))}));
  },
  async fetch(request,env={}) {
    const url=new URL(request.url);
    const security={
      'X-Content-Type-Options':'nosniff',
      ...(url.protocol==='https:'?{'Strict-Transport-Security':'max-age=31536000'}:{}),
      'Referrer-Policy':'strict-origin-when-cross-origin',
      'X-Frame-Options':'DENY',
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' https://cloudflareinsights.com; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
      'X-Robots-Tag':'noindex, nofollow',
    };
    // Keep the purchased domain canonical; leave the workers.dev preview usable.
    if(url.hostname==='id-ebp.org'||(url.hostname==='www.id-ebp.org'&&url.protocol!=='https:')){
      url.hostname='www.id-ebp.org';
      url.protocol='https:';
      url.port='';
      return new Response(null,{status:308,headers:{...security,Location:url.href,'Cache-Control':'public, max-age=3600'}});
    }
    if(['/api/research','/api/research/tags','/api/research/stats'].includes(url.pathname))return handleResearch(request,security);
    if(url.pathname.startsWith('/api/internal/'))return new Response('Not found',{status:404,headers:{...security,'Cache-Control':'no-store'}});
    if(url.pathname.startsWith('/api/')){
      try{
        let response;
        if(env.DIRECTORY_API_URL){
          if(url.pathname==='/api/community'&&request.method==='GET')response=Response.json(await readCommunity(env));
          else response=await timedOperation(async signal=>{
            const endpoint=directoryEndpoint(env.DIRECTORY_API_URL);
            if(!env.DIRECTORY_PROXY_SECRET)throw Error('Account service proxy is not configured');
            const headers=new Headers(request.headers);headers.delete('Host');headers.delete('Authorization');headers.delete('X-IDEBP-Internal');
            headers.set('X-IDEBP-Mail-Ready',env.AUTH_EMAIL_ENABLED==='true'&&env.EMAIL?'true':'false');
            headers.set('X-IDEBP-Proxy-Key',env.DIRECTORY_PROXY_SECRET);
            headers.set('X-IDEBP-Client-IP',request.headers.get('CF-Connecting-IP')||'unknown');
            let body;
            if(!['GET','HEAD'].includes(request.method)){
              if(Number(request.headers.get('Content-Length'))>16384)return Response.json({error:{code:'body_too_large',message:'The submitted details are too long.'}},{status:413});
              try{body=await boundedBody(request,16384,signal);}catch(error){if(signal.aborted)throw error;return Response.json({error:{code:'body_too_large',message:'The submitted details are too long.'}},{status:413});}
              headers.delete('Content-Length');
            }
            const upstream=await fetch(new Request(endpoint+url.pathname+url.search,{method:request.method,headers,body,redirect:'manual',signal}));
            if(upstream.status>=300&&upstream.status<400){await upstream.body?.cancel();throw Error('Account service redirect refused');}
            const bytes=await boundedBody(upstream,4194304,signal);
            const responseHeaders=new Headers(upstream.headers);responseHeaders.delete('Content-Length');responseHeaders.delete('Content-Encoding');
            return new Response([204,205,304].includes(upstream.status)?null:bytes,{status:upstream.status,headers:responseHeaders});
          },30000);
        }else{
          let directRequest=request;
          if(!['GET','HEAD'].includes(request.method)){
            let body;
            try{body=await timedOperation(signal=>boundedBody(request,16384,signal));}
            catch(error){if(error.message==='Response too large')response=Response.json({error:{code:'body_too_large',message:'The submitted details are too long.'}},{status:413});else throw error;}
            if(!response)directRequest=new Request(request.url,{method:request.method,headers:request.headers,body});
          }
          // Backend calls already have individual deadlines. Racing this entire
          // mutation would return failure while its database work kept running.
          if(!response)response=await handleApi(directRequest,env);
        }
        response=await timedOperation(signal=>processApiResponse(response,request,env,signal),20000);
        const headers=new Headers(response.headers);for(const [name,value] of Object.entries(security))headers.set(name,value);
        headers.set('Cache-Control','private, no-store, max-age=0');headers.set('Pragma','no-cache');headers.set('Vary','Cookie');
        return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
      }catch{return Response.json({error:{code:'service_unavailable',message:'The account service is temporarily unavailable. You can still browse the directory.'}},{status:503,headers:{...security,'Cache-Control':'no-store'}});}
    }
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...security,Allow:'GET, HEAD'}});
    const production=url.hostname==='www.id-ebp.org';
    if(url.pathname==='/robots.txt')return new Response(request.method==='HEAD'?null:production?'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://www.id-ebp.org/sitemap.xml\n':'User-agent: *\nDisallow: /\n',{headers:{...security,'Content-Type':'text/plain; charset=utf-8'}});
    if(url.pathname.endsWith('/')&&url.pathname!=='/')return Response.redirect(url.origin+url.pathname.replace(/\/+$/,'')+url.search,308);
    const mediaMatch=url.pathname.match(/^\/media\/sources\/([a-z0-9-]+)\/(logo|portrait)$/);
    const documentRoute=!url.pathname.split('/').pop().includes('.')||['/sitemap.xml','/catalogue.json','/llms.txt'].includes(url.pathname);
    if(documentRoute||mediaMatch){
      let community=null;
      if(env.DIRECTORY_API_URL){
        try{community=await readCommunity(env);}
        catch(error){console.error('directory_read_failed',error.name,error.message);return new Response('The directory is temporarily unavailable. Please try again shortly.',{status:503,headers:{...security,'Retry-After':'60'}});}
      }
      if(mediaMatch){const response=await serveSourceMedia(mediaMatch[1],mediaMatch[2],community);const headers=new Headers(response.headers);for(const [name,value] of Object.entries(security))if(!headers.has(name))headers.set(name,value);return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});}
      if(url.pathname.startsWith('/source/')&&community?.redirects?.[url.pathname.slice(8)])return Response.redirect(url.origin+'/source/'+community.redirects[url.pathname.slice(8)],308);
      const sources=catalogueFromCommunity(CATALOGUE,community);
      if(url.pathname==='/sitemap.xml')return new Response(request.method==='HEAD'?null:sitemap(sources),{headers:{...security,'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=60'}});
      if(url.pathname==='/catalogue.json')return new Response(request.method==='HEAD'?null:JSON.stringify({name:'ID-EBP public source catalogue',url:'https://www.id-ebp.org',summaryNotice:'Auto-generated source summaries; source ownership verification is not study-quality certification.',sources:sources.map(s=>({id:s.id,name:s.name,url:s.url,profileUrl:'https://www.id-ebp.org/source/'+s.id,summary:s.about,country:s.country,topics:s.topics,types:s.types,verifiedOwner:Boolean(s.signals?.organisationConfirmed),checked:s.checked}))}),{headers:{...security,'Content-Type':'application/json; charset=utf-8','X-Robots-Tag':production?'index, follow':'noindex, nofollow'}});
      if(url.pathname==='/llms.txt')return new Response(request.method==='HEAD'?null:'# International Directory of Evidence-Based Policing\n\nID-EBP signposts research sources; it does not certify individual studies. Source summaries are auto-generated and labelled.\n\n- [Directory](https://www.id-ebp.org/directory)\n- [Source guide](https://www.id-ebp.org/source-guide)\n- [Ranking and ownership verification](https://www.id-ebp.org/ranking)\n- [Public catalogue JSON](https://www.id-ebp.org/catalogue.json)\n- [Sitemap](https://www.id-ebp.org/sitemap.xml)\n\nContact: contact@id-ebp.org\n',{headers:{...security,'Content-Type':'text/plain; charset=utf-8'}});
      const page=publicDocument(ASSETS['/index.html'].body,url.pathname,url.searchParams,sources);
      const nonce=btoa(crypto.randomUUID());
      const html=page.html.replace('<script type="application/ld+json">',`<script type="application/ld+json" nonce="${nonce}">`);
      return new Response(request.method==='HEAD'?null:html,{status:page.status,headers:{...security,'X-Robots-Tag':production&&page.indexable?'index, follow, max-image-preview:large':(production?'noindex, follow':'noindex, nofollow'),'Content-Security-Policy':security['Content-Security-Policy'].replace("script-src 'self'",`script-src 'self' 'nonce-${nonce}'`),'Content-Type':'text/html; charset=utf-8','Cache-Control':page.indexable?'public, max-age=30':'private, no-store'}});
    }
    let path=url.pathname;
    if(path==='/')path='/index.html';
    const asset=ASSETS[path];
    if(!asset)return new Response('Not found',{status:404,headers:security});
    const body=asset.base64?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;
    return new Response(request.method==='HEAD'?null:body,{headers:{...security,'Content-Type':asset.type,'X-Robots-Tag':production&&['/favicon.png','/assets/brand/id-ebp-approved.webp'].includes(path)?'index, follow':security['X-Robots-Tag'],'Cache-Control':'public, max-age=60'}});
  }
};

