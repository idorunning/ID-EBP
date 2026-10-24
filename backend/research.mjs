// Public read-only catalogue API. The publishable key is subject to database RLS.
const RESEARCH_ORIGIN='https://hvwmystbqlocjixvwgfl.supabase.co';
const RESEARCH_KEY="sb_publishable_0fhRn9kYUd8Ur7g9TuCzJQ_Zdu5aIRk";
export async function handleResearch(request,security={}){
 const u=new URL(request.url),p=u.searchParams;
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'Read-only endpoint'},{status:405,headers:{...security,Allow:'GET, HEAD'}});
 const tags=p.getAll('tag');
 if((p.get('q')||'').length>300||tags.length>10||tags.some(t=>t.length>150))return Response.json({error:'Please shorten the search.'},{status:400,headers:security});
 const route=u.pathname==='/api/research/tags'?'research_tags':u.pathname==='/api/research/stats'?'research_stats':'search_research';
 const body=route==='research_stats'?{}:route==='research_tags'?{prefix:(p.get('q')||'').slice(0,100)}:{q:p.get('q')||'',selected_tags:tags,page_number:Math.min(1000,Math.max(1,parseInt(p.get('page'),10)||1)),source_filter:(p.get('source')||'').slice(0,120)};
 try{
 const reply=await fetch(RESEARCH_ORIGIN+'/rest/v1/rpc/'+route,{method:'POST',headers:{apikey:RESEARCH_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!reply.ok)throw Error('Catalogue unavailable');
 const data=await reply.json();
 return new Response(request.method==='HEAD'?null:JSON.stringify(data),{headers:{...security,'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60'}});
 }catch{return Response.json({error:'Research search is temporarily unavailable. Please try again.'},{status:503,headers:{...security,'Cache-Control':'no-store'}});}
}

