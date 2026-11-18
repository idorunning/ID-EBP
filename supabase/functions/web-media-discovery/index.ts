import postgres from "npm:postgres@3.4.4";
const sql=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:3});
const RELEVANT=/\b(police|policing|law enforcement|criminolog|criminal justice|crime prevention|study|studies|research|researchers|trial|evaluation|evidence|procedural justice|domestic abuse|victim)\b/i;
function publicArticle(value:any){
 try{const u=new URL(String(value||""));
 if(!["https:","http:"].includes(u.protocol)||u.username||u.password)return null;
 const h=u.hostname.toLowerCase().replace(/^www\./,"");
 if(!h.includes(".")||h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".invalid")||h.endsWith(".example")||h.endsWith(".test")||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.startsWith("["))return null;
 return {url:u.toString(),host:h}
 }catch{return null}
}
Deno.serve(async req=>{
 const [secret]=await sql`select decrypted_secret from vault.decrypted_secrets where name='news_cron_token' limit 1`;
 if(req.method!=="POST"||!secret||req.headers.get("x-cron-token")!==secret.decrypted_secret)return new Response("Forbidden",{status:403});
 const claimed=await sql`with next as(select id from staging.web_source_searches where stream='media' and active and next_search_at<=now() order by next_search_at,id limit 1 for update skip locked)
 update staging.web_source_searches s set next_search_at=now()+interval '2 hours' from next where s.id=next.id returning s.id,s.term,s.consecutive_errors`;
 if(!claimed.length)return Response.json({status:"idle"});
 const item=claimed[0];const [{id:runId}]=await sql`insert into staging.web_source_search_runs(search_id) values(${item.id}) returning id`;
 let status="passed",seen=0,added=0,error="";
 try{
  const args=new URLSearchParams({query:item.term+" sourcelang:english",mode:"ArtList",format:"json",maxrecords:"20",timespan:"7d",sort:"DateDesc"});
  const control=new AbortController(),timer=setTimeout(()=>control.abort(),25000);let response:Response;
  try{response=await fetch("https://api.gdeltproject.org/api/v2/doc/doc?"+args,{signal:control.signal,headers:{"User-Agent":"ID-EBP (https://id-ebp.org); source discovery"}})}
  finally{clearTimeout(timer)}
  if(response.status===429)throw Error("RATE_LIMIT_429");
  if(!response.ok)throw Error("GDELT HTTP "+response.status);
  const raw=(await response.text()).slice(0,500000);
  if(!raw.trim().startsWith("{"))throw Error("GDELT response not JSON");
  const articles=(JSON.parse(raw).articles??[]).slice(0,20),unique=new Set<string>();
  for(const a of articles){
    if(!a.title||!RELEVANT.test(String(a.title)))continue;
    const page=publicArticle(a.url);if(!page||unique.has(page.host))continue;unique.add(page.host);
    if(/(^|\.)(x\.com|youtube\.com|facebook\.com|tiktok\.com|reddit\.com|instagram\.com)$/i.test(page.host))continue;
    const externalId="gdelt-domain:"+page.host, name=String(a.domain??page.host).slice(0,180);
    const listed=await sql`select id from public.sources where canonical_domain=${page.host} limit 1`;
    const previous=await sql`select provider_id from staging.web_source_candidates where provider_id=${externalId} limit 1`;
    const meta={evidence_article_url:page.url,headline:String(a.title).slice(0,350),article_date:a.seendate??null,source_country:a.sourcecountry??null,language:a.language??null,source:"GDELT Project",attribution_url:"https://www.gdeltproject.org/",query:item.term};
    // An outlet domain is only a lead. No automatic classification as research or public promotion.
    await sql`insert into staging.web_source_candidates(provider_id,entity_type,suggested_category,name,website_url,canonical_domain,country_code,works_count,evidence_url,first_query,provider,raw_metadata,review_status,notes)
    values(${externalId},'media','media_or_news_outlet',${name},null,${page.host},null,null,${page.url},${"media:"+item.term},'GDELT',${sql.json(meta)},${listed.length?"already_listed":"needs_identity_check"},'News or magazine outlet domain found through GDELT; verify outlet identity, homepage and research relevance before publishing')
    on conflict(provider_id) do update set last_seen_at=now(),seen_count=staging.web_source_candidates.seen_count+1,raw_metadata=excluded.raw_metadata`;
    seen++;if(!previous.length)added++;
  }
  status=seen?"passed":"empty";
  await sql`update staging.web_source_searches set last_searched_at=now(),next_search_at=now()+interval '10 days',consecutive_errors=0,last_error=null,total_results=total_results+${seen} where id=${item.id}`;
 }catch(e){
  error=String(e).slice(0,220);const limited=error.includes("RATE_LIMIT"),delay=limited?72:Math.min(120,12*(item.consecutive_errors+1));
  status=limited?"rate_limited":"failed";
  await sql`update staging.web_source_searches set last_searched_at=now(),consecutive_errors=consecutive_errors+1,last_error=${error},next_search_at=now()+(${delay}*interval '1 hour') where id=${item.id}`;
  if(limited)await sql`update staging.web_source_searches set next_search_at=greatest(next_search_at,now()+interval '36 hours') where stream='media' and id<>${item.id}`;
 }
 await sql`update staging.web_source_search_runs set finished_at=now(),result_status=${status},candidates_seen=${seen},candidates_new=${added},error_detail=${error||null} where id=${runId}`;
 return Response.json({status,term:item.term,seen,added,error:error||undefined});
});