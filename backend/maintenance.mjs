// Bounded public-page checks. Never fetch a URL supplied in a request query.
export function publicWebUrl(value){
 try{const u=new URL(value);const h=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||u.port||!h.includes('.')||/^[\d.]+$/.test(h)||h.includes(':')||/(^|\.)(localhost|local|internal|test|invalid|example|arpa)$/.test(h)||/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h))return null;return u.href;}catch{return null;}
}
async function boundedBody(response,limit){
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('Response too large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function publicFetch(value,{fetcher=fetch,maxBytes=1048576}={}){
 let url=publicWebUrl(value);if(!url)throw Error('Unsupported public URL');let redirected=false;
 for(let n=0;n<4;n++){
  const response=await fetcher(url,{redirect:'manual',headers:{'User-Agent':'ID-EBP source-maintenance/1.0 (+https://id-ebp.org/about)','Accept':'text/html,image/png,image/jpeg,image/webp'},signal:AbortSignal.timeout(12000)});
  if([301,302,303,307,308].includes(response.status)){const next=publicWebUrl(new URL(response.headers.get('Location')||'',url).href);if(!next)throw Error('Unsafe redirect');await response.body?.cancel();url=next;redirected=true;continue;}
  return {response,url,redirected,bytes:await boundedBody(response,maxBytes)};
 }
 throw Error('Too many redirects');
}
function publicCandidate(value,base){try{return publicWebUrl(new URL(value,base).href);}catch{return null;}}
const stripHtml=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
function tagAttributes(tag){return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),m[2]]));}
export async function inspectSource(job,{fetcher=fetch,now=new Date()}={}){
 const base={checkedAt:now.toISOString(),duplicateCandidates:Number(job.duplicateUrls)||0,summaryPresent:Boolean(job.about?.trim()),suggestions:{},checks:['link','summary','public-contact','logo','duplicate']};
 try{
  const {response,url,redirected,bytes}=await publicFetch(job.url,{fetcher});const status=response.status;
  const result={...base,status:status>=200&&status<300?(redirected?'redirected':'working'):[401,403,429].includes(status)?'restricted':status===404?'not-found':'unreachable',httpStatus:status,finalUrl:url};
  if(!response.ok||!response.headers.get('Content-Type')?.includes('text/html'))return result;
  const html=new TextDecoder().decode(bytes),suggestions=result.suggestions;
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const a=tagAttributes(tag);if(['description','og:description'].includes((a.name||a.property||'').toLowerCase())&&a.content&&!suggestions.summary)suggestions.summary=stripHtml(a.content).slice(0,600);if((a.property||'').toLowerCase()==='og:image'&&a.content)suggestions.logoUrl=publicCandidate(a.content,url);}
  for(const tag of html.match(/<link\b[^>]*>/gi)||[]){const a=tagAttributes(tag);if(/(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(a.rel||'')&&a.href&&!suggestions.logoUrl)suggestions.logoUrl=publicCandidate(a.href,url);}
  const publicEmails=[...html.matchAll(/href\s*=\s*["']mailto:([^"'?\s]+)/gi)].map(m=>m[1]).filter(e=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)&&!/^no-?reply@/i.test(e));suggestions.publicEmails=[...new Set(publicEmails)].slice(0,10);
  for(const tag of html.match(/<a\b[^>]*>/gi)||[]){const a=tagAttributes(tag);if(a.href&&/contact|about/i.test(a.href)){try{const contact=publicCandidate(a.href,url);if(contact&&new URL(contact).hostname===new URL(url).hostname){suggestions.contactPage=contact;break;}}catch{}}}
  result.note='Automated checks suggest metadata for review. Suggestions do not change the published profile or establish ownership.';return result;
 }catch{return {...base,status:'unreachable',note:'The automated public-page check could not be completed. The listing has not been removed.'};}
}
async function directoryTask(env,action,payload={}){
 if(!env.DIRECTORY_API_URL||!env.DIRECTORY_PROXY_SECRET)throw Error('Task service not configured');
 const response=await fetch(env.DIRECTORY_API_URL+'/api/internal/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://id-ebp.org','X-IDEBP-Proxy-Key':env.DIRECTORY_PROXY_SECRET,'X-IDEBP-Internal':'scheduled'},body:JSON.stringify(payload)});
 if(!response.ok)throw Error('Task service unavailable');return response.json();
}
export async function runDirectoryTasks(env){
 const tasks=await directoryTask(env,'maintenance-take');
 for(const job of tasks.jobs||[]){const result=await inspectSource(job);await directoryTask(env,'maintenance-complete',{id:job.id,lease:job.lease,result});}
 if(env.WORKFLOW_NOTIFICATIONS_ENABLED==='true'&&env.EMAIL){
  const batch=await directoryTask(env,'outbox-take');
  for(const message of batch.messages||[]){let sent=false,providerId='';try{const result=await env.EMAIL.send({to:message.to,from:{email:'sign-in@auth.id-ebp.org',name:'ID-EBP'},subject:message.subject,text:message.text});sent=true;providerId=result?.messageId||result?.id||'';}catch{}
   await directoryTask(env,'outbox-complete',{id:message.id,lease:message.lease,sent,providerId});
  }
 }
}
export async function serveSourceMedia(slug,kind,community){
 const details=community?.sources?.[slug]?.profile?.publicDetails,url=details?.[kind==='logo'?'logoUrl':'portraitUrl'];
 if(!url||new URL(url).hostname.replace(/^www\./,'')==='id-ebp.org')return new Response('Image not found',{status:404});
 try{const {response,bytes}=await publicFetch(url,{maxBytes:2097152});const type=response.headers.get('Content-Type')?.split(';')[0];if(!response.ok||!['image/png','image/jpeg','image/webp'].includes(type))throw Error();return new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});}catch{return new Response('Image unavailable',{status:404});}
}
