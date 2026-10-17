// Bounded public-page checks. Never fetch a URL supplied in a request query.
export function publicWebUrl(value){
 try{const u=new URL(value);const h=u.hostname.toLowerCase().replace(/\.+$/,'');if(u.protocol!=='https:'||u.username||u.password||u.port||!h.includes('.')||/^[\d.]+$/.test(h)||h.includes(':')||/(^|\.)(localhost|local|internal|home|lan|onion|test|invalid|example|arpa)$/.test(h)||/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h))return null;return u.href;}catch{return null;}
}
// Bound the whole operation, including response streaming. Aborting fetch also
// prevents a slow origin from keeping an isolate occupied after the deadline.
export async function timedOperation(operation,timeoutMs=15000){
 const controller=new AbortController();let timer;
 const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error('Operation timed out');controller.abort(error);reject(error);},timeoutMs);});
 try{return await Promise.race([Promise.resolve().then(()=>operation(controller.signal)),expired]);}finally{clearTimeout(timer);}
}
export async function boundedBody(response,limit,signal){
 if(Number(response.headers?.get('Content-Length'))>limit){await response.body?.cancel();throw Error('Response too large');}
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let size=0;
 const abort=()=>{void reader.cancel(signal.reason).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  for(;;){if(signal?.aborted)throw signal.reason;const {done,value}=await reader.read();if(signal?.aborted)throw signal.reason;if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('Response too large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
 }finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
}
export function directoryEndpoint(value){
 const endpoint=new URL(value);
 if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.supabase.co')||endpoint.username||endpoint.password||endpoint.port||endpoint.search||endpoint.hash||endpoint.pathname!=='/functions/v1/directory-api')throw Error('Invalid account service configuration');
 return endpoint.href;
}
async function publicFetch(value,{fetcher=fetch,maxBytes=1048576}={}){
 return timedOperation(async signal=>{
  let url=publicWebUrl(value);if(!url)throw Error('Unsupported public URL');let redirected=false;
  for(let n=0;n<4;n++){
   const response=await fetcher(url,{redirect:'manual',headers:{'User-Agent':'ID-EBP source-maintenance/1.0 (+https://www.id-ebp.org/about)','Accept':'text/html,image/png,image/jpeg,image/webp'},signal});
   if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();const location=response.headers.get('Location');if(!location)throw Error('Missing redirect destination');const next=publicWebUrl(new URL(location,url).href);if(!next)throw Error('Unsafe redirect');url=next;redirected=true;continue;}
   return {response,url,redirected,bytes:await boundedBody(response,maxBytes,signal)};
  }
  throw Error('Too many redirects');
 },12000);
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
 const endpoint=directoryEndpoint(env.DIRECTORY_API_URL);
 return timedOperation(async signal=>{
  const response=await fetch(endpoint+'/api/internal/'+action,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Origin:'https://www.id-ebp.org','X-IDEBP-Proxy-Key':env.DIRECTORY_PROXY_SECRET,'X-IDEBP-Internal':'scheduled'},body:JSON.stringify(payload),signal});
  if(!response.ok){await response.body?.cancel();throw Error('Task service unavailable');}
  const data=JSON.parse(new TextDecoder().decode(await boundedBody(response,2097152,signal)));
  if(action.endsWith('-complete')&&data.updated!==true)throw Error('Task lease was not acknowledged');
  return data;
 });
}
export async function runDirectoryTasks(env,{maintenance=true,scheduledTime=null,report=()=>{}}={}){
 const started=Date.now(),failures=[];
 // Aggregate operational data only: never log addresses, message bodies, source
 // identifiers, lease tokens or upstream error text.
 const summary={event:'directory_workflow_run',scheduledTime,status:'ok',durationMs:0,failureCount:0,
  maintenance:{enabled:maintenance,taken:0,completed:0,failed:0,fullBatch:false,unreachable:0},
  notifications:{enabled:env.WORKFLOW_NOTIFICATIONS_ENABLED==='true'&&Boolean(env.EMAIL),taken:0,accepted:0,held:0,acknowledgementFailed:0,fullBatch:false,quotaLimited:0,rateLimited:0,configurationError:false,budgetRemaining:null,budgetDeferred:false,pending:null,heldTotal:null,oldestPendingAgeSeconds:null,budgetNextExpiryAt:null}};
 if(env.WORKFLOW_NOTIFICATIONS_ENABLED==='true'&&!env.EMAIL){summary.notifications.configurationError=true;failures.push(new Error('Workflow email binding unavailable'));}
 const checkSources=async()=>{
  if(!maintenance)return;
  try{
   const tasks=await directoryTask(env,'maintenance-take'),jobs=(tasks.jobs||[]).slice(0,5);
   summary.maintenance.taken=jobs.length;summary.maintenance.fullBatch=jobs.length===5;
   // A failed acknowledgement must not prevent other leased work completing.
   for(const job of jobs){
    try{const result=await inspectSource(job);if(result.status==='unreachable')summary.maintenance.unreachable++;await directoryTask(env,'maintenance-complete',{id:job.id,lease:job.lease,result});summary.maintenance.completed++;}
    catch(error){summary.maintenance.failed++;failures.push(error);}
   }
  }catch(error){summary.maintenance.failed++;failures.push(error);}
 };
 const sendNotices=async()=>{
  if(!summary.notifications.enabled)return;
  try{
   const batch=await directoryTask(env,'outbox-take'),messages=(batch.messages||[]).slice(0,10);
   summary.notifications.taken=messages.length;summary.notifications.fullBatch=messages.length===10;
   // The protected task API exposes aggregate queue/budget health only. Reject
   // unexpected values rather than copying arbitrary backend data into logs.
   for(const [field,value] of [['budgetRemaining',batch.budget?.remaining],['pending',batch.health?.pending],['heldTotal',batch.health?.held]]){
    if(Number.isSafeInteger(value)&&value>=0)summary.notifications[field]=value;
   }
   const oldest=typeof batch.health?.oldestPendingAt==='string'?Date.parse(batch.health.oldestPendingAt):NaN;
   if(Number.isFinite(oldest))summary.notifications.oldestPendingAgeSeconds=Math.max(0,Math.floor((Date.now()-oldest)/1000));
   const expiry=typeof batch.budget?.nextAvailableAt==='string'?Date.parse(batch.budget.nextAvailableAt):NaN;
   if(Number.isFinite(expiry))summary.notifications.budgetNextExpiryAt=new Date(expiry).toISOString();
   summary.notifications.budgetDeferred=summary.notifications.budgetRemaining===0&&summary.notifications.pending>0;
   for(const message of messages){
    let sent=false,providerId='';
    // Sending is never retried automatically: a timeout may still have delivered
    // the email. The database holds it as uncertain for an administrator.
    try{const result=await timedOperation(()=>env.EMAIL.send({to:message.to,from:{email:'sign-in@auth.id-ebp.org',name:'ID-EBP'},subject:message.subject,text:message.text}));sent=true;providerId=result?.messageId||result?.id||'';summary.notifications.accepted++;}
    catch(error){summary.notifications.held++;if(error?.code==='E_DAILY_LIMIT_EXCEEDED')summary.notifications.quotaLimited++;if(error?.code==='E_RATE_LIMIT_EXCEEDED')summary.notifications.rateLimited++;}
    try{await directoryTask(env,'outbox-complete',{id:message.id,lease:message.lease,sent,providerId});}
    catch(error){summary.notifications.acknowledgementFailed++;failures.push(error);}
   }
  }catch(error){failures.push(error);}
 };
 // Notices should not wait behind slow source websites on half-hourly runs.
 await Promise.all([checkSources(),sendNotices()]);
 summary.durationMs=Date.now()-started;summary.failureCount=failures.length;
 summary.status=failures.length?'failed':summary.notifications.held||summary.notifications.fullBatch||summary.notifications.pending>0||summary.notifications.heldTotal>0||summary.maintenance.unreachable?'attention':'ok';
 report(summary);
 if(failures.length)throw new AggregateError(failures,'Some directory background tasks could not be completed');
 return summary;
}
export async function serveSourceMedia(slug,kind,community){
 const details=community?.sources?.[slug]?.profile?.publicDetails,url=publicWebUrl(details?.[kind==='logo'?'logoUrl':'portraitUrl']);
 if(!url||new URL(url).hostname.replace(/^www\./,'')==='id-ebp.org')return new Response('Image not found',{status:404});
 try{const {response,bytes}=await publicFetch(url,{maxBytes:2097152});const type=response.headers.get('Content-Type')?.split(';')[0].toLowerCase();if(!response.ok||!['image/png','image/jpeg','image/webp'].includes(type))throw Error();return new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});}catch{return new Response('Image unavailable',{status:404});}
}
