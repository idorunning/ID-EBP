import {runDirectoryTasks,serveSourceMedia} from '../backend/maintenance.mjs';
import {ASSETS} from './assets.generated.mjs';
import {handleApi} from '../backend/api.mjs';
import {publicDocument,catalogueFromCommunity,sitemap} from '../backend/seo.mjs';
import {CATALOGUE} from './catalogue.generated.mjs';

export default {
  async scheduled(controller,env,context){context.waitUntil(runDirectoryTasks(env));},
  async fetch(request,env={}) {
    const url=new URL(request.url);
    const security={
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin',
      'X-Frame-Options':'DENY',
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' https://cloudflareinsights.com; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
      'X-Robots-Tag':'noindex, nofollow',
    };
    // Keep the purchased domain canonical; leave the workers.dev preview usable.
    if(url.hostname==='www.id-ebp.org'||(url.hostname==='id-ebp.org'&&url.protocol!=='https:')){
      url.hostname='id-ebp.org';
      url.protocol='https:';
      url.port='';
      return new Response(null,{status:308,headers:{...security,Location:url.href,'Cache-Control':'public, max-age=3600'}});
    }
    if(url.pathname.startsWith('/api/internal/'))return new Response('Not found',{status:404});
    if(url.pathname.startsWith('/api/')){
      let response;
      if(env.DIRECTORY_API_URL){
        try{
          const endpoint=new URL(env.DIRECTORY_API_URL);
          if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.supabase.co')||endpoint.pathname!=='/functions/v1/directory-api')throw Error('Invalid account service configuration');
          const headers=new Headers(request.headers);headers.delete('Host');headers.delete('Authorization');headers.delete('X-IDEBP-Internal');
          if(!env.DIRECTORY_PROXY_SECRET)throw Error('Account service proxy is not configured');
          headers.set('X-IDEBP-Mail-Ready',env.AUTH_EMAIL_ENABLED==='true'&&env.EMAIL?'true':'false');
          headers.set('X-IDEBP-Proxy-Key',env.DIRECTORY_PROXY_SECRET);
          headers.set('X-IDEBP-Client-IP',request.headers.get('CF-Connecting-IP')||'unknown');
          response=await fetch(new Request(endpoint.href+url.pathname+url.search,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual',duplex:'half'}));
          if((url.pathname==='/api/auth/request'||url.pathname==='/api/account/verification'||url.pathname.endsWith('/claim-code'))&&response.ok){
            const data=await response.json();
            if(data.internalDelivery){
              const {email,code,purpose}=data.internalDelivery;
              const reset=purpose==='reset',claim=purpose==='claim',account=purpose==='account',label=account?'account verification':reset?'password-reset':claim?'source claim':'verification';
              if(!env.EMAIL||!/^\d{6,10}$/.test(code))throw Error('Mail unavailable');
              const instruction=account?'Return to your account settings on id-ebp.org and enter this code for the action you requested.':reset?'Return to the password-reset screen to choose a new password.':claim?'Return to your claim form on id-ebp.org and enter this code, then press Send claim.':'Enter it on id-ebp.org to sign in.';
              await env.EMAIL.send({to:email,from:{email:'sign-in@auth.id-ebp.org',name:'ID-EBP'},subject:`Your ID-EBP ${label} code`,text:`Your ID-EBP ${label} code is ${code}. ${instruction} This code expires in 10 minutes. Do not share it. If you did not request it, ignore this email.`,html:`<p>Your ID-EBP ${label} code is:</p><h2>${code}</h2><p>${instruction} This code expires in 10 minutes. Do not share it. If you did not request it, ignore this email.</p>`});
              delete data.internalDelivery;
            }
            response=Response.json(data,{status:response.status,headers:response.headers});
          }
        }catch{return Response.json({error:{code:'service_unavailable',message:'The account service is temporarily unavailable. You can still browse the directory.'}},{status:503,headers:{...security,'Cache-Control':'no-store'}});}
      }else response=await handleApi(request,env);
      const headers=new Headers(response.headers);for(const [name,value] of Object.entries(security))headers.set(name,value);
      return new Response(response.body,{status:response.status,headers});
    }
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...security,Allow:'GET, HEAD'}});
    const production=url.hostname==='id-ebp.org';
    if(url.pathname==='/robots.txt')return new Response(production?'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://id-ebp.org/sitemap.xml\n':'User-agent: *\nDisallow: /\n',{headers:{...security,'Content-Type':'text/plain; charset=utf-8'}});
    if(url.pathname.endsWith('/')&&url.pathname!=='/')return Response.redirect(url.origin+url.pathname.replace(/\/+$/,'')+url.search,308);
    const mediaMatch=url.pathname.match(/^\/media\/sources\/([a-z0-9-]+)\/(logo|portrait)$/);
    const documentRoute=!url.pathname.split('/').pop().includes('.')||['/sitemap.xml','/catalogue.json','/llms.txt'].includes(url.pathname);
    if(documentRoute||mediaMatch){
      let community=null;
      if(env.DIRECTORY_API_URL){
        try{const reply=await fetch(env.DIRECTORY_API_URL+'/api/community',{headers:{'X-IDEBP-Proxy-Key':env.DIRECTORY_PROXY_SECRET||''},signal:AbortSignal.timeout(10000)});if(!reply.ok)throw Error();community=await reply.json();}
        catch{return new Response('The directory is temporarily unavailable. Please try again shortly.',{status:503,headers:{...security,'Retry-After':'60'}});}
      }
      if(mediaMatch)return serveSourceMedia(mediaMatch[1],mediaMatch[2],community);
      if(url.pathname.startsWith('/source/')&&community?.redirects?.[url.pathname.slice(8)])return Response.redirect(url.origin+'/source/'+community.redirects[url.pathname.slice(8)],308);
      const sources=catalogueFromCommunity(CATALOGUE,community);
      if(url.pathname==='/sitemap.xml')return new Response(request.method==='HEAD'?null:sitemap(sources),{headers:{...security,'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=60'}});
      if(url.pathname==='/catalogue.json')return Response.json({name:'ID-EBP public source catalogue',url:'https://id-ebp.org',summaryNotice:'Auto-generated source summaries; source ownership verification is not study-quality certification.',sources:sources.map(s=>({id:s.id,name:s.name,url:s.url,profileUrl:'https://id-ebp.org/source/'+s.id,summary:s.about,country:s.country,topics:s.topics,types:s.types,verifiedOwner:Boolean(s.signals?.organisationConfirmed),checked:s.checked}))},{headers:{...security,'X-Robots-Tag':production?'index, follow':'noindex, nofollow'}});
      if(url.pathname==='/llms.txt')return new Response('# International Directory of Evidence-Based Policing\n\nID-EBP signposts research sources; it does not certify individual studies. Source summaries are auto-generated and labelled.\n\n- [Directory](https://id-ebp.org/directory)\n- [Source guide](https://id-ebp.org/source-guide)\n- [Ranking and ownership verification](https://id-ebp.org/ranking)\n- [Public catalogue JSON](https://id-ebp.org/catalogue.json)\n- [Sitemap](https://id-ebp.org/sitemap.xml)\n\nContact: contact@id-ebp.org\n',{headers:{...security,'Content-Type':'text/plain; charset=utf-8'}});
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
    return new Response(request.method==='HEAD'?null:body,{headers:{...security,'Content-Type':asset.type,'Cache-Control':'public, max-age=60'}});
  }
};

