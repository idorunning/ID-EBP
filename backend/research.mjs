import {planSearch,topicSuggestions} from '../public/search-topics.js';
// Public catalogue reads use only a publishable key and invoker/RLS functions.
const RESEARCH_ORIGIN='https://hvwmystbqlocjixvwgfl.supabase.co';
const RESEARCH_KEY='sb_publishable_0fhRn9kYUd8Ur7g9TuCzJQ_Zdu5aIRk';
export const EMBEDDING_MODEL='@cf/baai/bge-small-en-v1.5';
const embeddingCache=new Map(),aiRequests=new Map();
function boundedAiRequest(request){
 const key=request.headers.get('CF-Connecting-IP')||'local',now=Date.now(),old=aiRequests.get(key);
 if(aiRequests.size>2000)aiRequests.clear();
 const entry=old&&now-old.since<60000?old:{since:now,count:0};entry.count++;aiRequests.set(key,entry);return entry.count<=20;
}
export async function embedSearch(env,text){
 if(!env.AI||!text)return null;
 const key=text.slice(0,600),cached=embeddingCache.get(key);
 if(cached&&Date.now()-cached.time<900000)return cached.value;
 let timer;
 try{
  const result=await Promise.race([env.AI.run(EMBEDDING_MODEL,{text:[key],pooling:'cls'}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Search meaning timed out')),2500);})]);
  const vector=result.data?.[0];if(!Array.isArray(vector)||vector.length!==384||!vector.every(Number.isFinite))return null;
  if(embeddingCache.size>=256)embeddingCache.delete(embeddingCache.keys().next().value);
  embeddingCache.set(key,{time:Date.now(),value:vector});return vector;
 }catch{return null;}finally{clearTimeout(timer);}
}
export function researchSearchBody(params){
 const q=params.get('q')||'',tags=params.getAll('tag'),plan=planSearch(q,{exact:params.get('exact')==='1'});
 const body={q,selected_tags:tags,page_number:Math.max(1,Math.min(1000000,parseInt(params.get('page'),10)||1)),source_filter:(params.get('source')||'').slice(0,120),exact_match:plan.exact,
 search_plan:{text:plan.text,topicGroups:plan.topicGroups,tagGroups:tags.map(t=>plan.exact?[]:planSearch(t).topicGroups.flat()),intentText:plan.intents.flatMap(i=>i.terms).join(' OR '),
 strictTopics:plan.topics.some(t=>t.id==='residential-burglary'),domesticTopic:plan.topicGroups.flat().includes('domestic-abuse'),burglaryTopic:plan.topicGroups.flat().includes('burglary')}};
 return {body,plan};
}
export async function handleResearch(request,security={},env={}){
 const u=new URL(request.url),p=u.searchParams;
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'Read-only endpoint'},{status:405,headers:{...security,Allow:'GET, HEAD'}});
 const tags=p.getAll('tag');
 if((p.get('q')||'').length>300||tags.length>10||tags.some(t=>t.length>150)||(p.get('source')||'').length>120)return Response.json({error:'Please shorten the search.'},{status:400,headers:security});
 const route=u.pathname==='/api/research/tags'?'research_tags':u.pathname==='/api/research/stats'?'research_stats':'search_research_v2';
 const {body:searchBody,plan}=researchSearchBody(p);
 const body=route==='research_stats'?{}:route==='research_tags'?{prefix:(p.get('q')||'').slice(0,100)}:searchBody;
 if(route==='search_research_v2'&&!plan.exact&&plan.semanticText&&boundedAiRequest(request))body.query_embedding=await embedSearch(env,plan.semanticText);
 try{
  const reply=await fetch(RESEARCH_ORIGIN+'/rest/v1/rpc/'+route,{method:'POST',headers:{apikey:RESEARCH_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  if(!reply.ok)throw Error('Catalogue unavailable');
  let data=await reply.json();
  if(route==='search_research_v2')data={...data,interpretation:{exact:plan.exact,corrected:plan.corrected,corrections:plan.corrections,topics:plan.topics.map(({id,label})=>({id,label})),intents:plan.intents.map(({id,label})=>({id,label})),related:plan.related,suggestions:plan.suggestions},semanticAvailable:Boolean(body.query_embedding)&&data.semanticAvailable===true};
  if(route==='research_tags')data=[...new Map([...topicSuggestions(p.get('q')||''),...data].map(t=>[t.tag.toLowerCase(),t])).values()].slice(0,12);
  return new Response(request.method==='HEAD'?null:JSON.stringify(data),{headers:{...security,'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60'}});
 }catch{return Response.json({error:'Research search is temporarily unavailable. Please try again.'},{status:503,headers:{...security,'Cache-Control':'no-store'}});}
}
// Only scheduled work or a temporary authenticated maintenance request can run this.
export async function runResearchIndex(env,{batches=2}={}){
 if(!env.AI||!env.DIRECTORY_API_URL||!env.DIRECTORY_PROXY_SECRET)return {enabled:false,completed:0};
 const origin=new URL(env.DIRECTORY_API_URL);
 if(origin.protocol!=='https:'||origin.hostname!=='hvwmystbqlocjixvwgfl.supabase.co'||origin.pathname!=='/functions/v1/directory-api')throw Error('Invalid indexing service');
 const endpoint=origin.href.replace(/directory-api$/,'research-indexer');
 const task=async(action,items)=>{
  const response=await fetch(endpoint,{method:'POST',headers:{'X-IDEBP-Proxy-Key':env.DIRECTORY_PROXY_SECRET,'Content-Type':'application/json'},body:JSON.stringify({action,...(items?{items}:{})}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Indexing service unavailable');return response.json();
 };
 let completed=0;
 for(let n=0;n<Math.min(Math.max(batches,1),4);n++){
  const {jobs}=await task('take');if(!Array.isArray(jobs)||jobs.length>64)throw Error('Invalid indexing batch');if(!jobs.length)break;
  let timer,result;
  try{result=await Promise.race([env.AI.run(EMBEDDING_MODEL,{text:jobs.map(j=>j.text),pooling:'cls'}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Indexing timed out')),30000);})]);}finally{clearTimeout(timer);}
  if(result.data?.length!==jobs.length||result.data.some(v=>v.length!==384||!v.every(Number.isFinite)))throw Error('Invalid embeddings');
  const saved=await task('complete',jobs.map((j,i)=>({id:j.id,hash:j.hash,lease:j.lease,embedding:result.data[i]})));completed+=saved.completed||0;
 }
 return {enabled:true,completed};
}
export async function authorisedResearchIndex(request,env){
 if(request.method!=='POST'||!env.RESEARCH_INDEX_TOKEN||env.RESEARCH_INDEX_TOKEN.length<32)return false;
 const supplied=request.headers.get('Authorization')||'';if(supplied.length>256)return false;
 const hashes=await Promise.all([supplied,'Bearer '+env.RESEARCH_INDEX_TOKEN].map(t=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))));
 const a=new Uint8Array(hashes[0]),b=new Uint8Array(hashes[1]);return a.reduce((d,v,i)=>d|(v^b[i]),0)===0;
}
