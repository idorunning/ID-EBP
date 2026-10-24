// A narrowly scoped maintenance API. Public users cannot invoke these RPCs.
export async function handleResearchIndexer(request,env){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const reject=(status)=>Response.json({error:'Indexing request unavailable'},{status,headers});
 if(request.method!=='POST')return reject(405);
 const secret=request.headers.get('X-IDEBP-Proxy-Key')||'';
 if(secret.length<32||secret.length>256)return reject(403);
 try{
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const rpc=async(name,body)=>{
   const response=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Index RPC failed');return response.json();
  };
  const verified=await rpc('directory_api',{p_action:'proxy_check',p_payload:{hash}});if(verified.valid!==true)return reject(403);
  if(Number(request.headers.get('Content-Length'))>1500000)return reject(413);
  const reader=request.body?.getReader();if(!reader)return reject(400);let size=0,body='';const decoder=new TextDecoder();
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1500000){await reader.cancel();return reject(413);}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}finally{reader.releaseLock();}
  const data=JSON.parse(body);let result;
  if(data.action==='take')result=await rpc('research_index_take',{batch_size:64});
  else if(data.action==='complete'){
   if(!Array.isArray(data.items)||data.items.length>64||data.items.some(i=>typeof i.id!=='string'||i.id.length>100||typeof i.hash!=='string'||!Array.isArray(i.embedding)||i.embedding.length!==384||!i.embedding.every(Number.isFinite)||typeof i.lease!=='string'))return reject(400);
   result=await rpc('research_index_complete',{items:data.items});
  }else return reject(400);
  return Response.json(result,{headers});
 }catch{return reject(503);}
}
