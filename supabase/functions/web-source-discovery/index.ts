import postgres from "npm:postgres@3.4.4";
import { coordinatedOpenAlexFetch } from "../_shared/openalex-policy.ts";
const db=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:3});
const KEYWORD=/polic(?:e|ing)|criminolog|criminal|crime|victimolog|justice|law enforcement|public safety|community safety|forensic|correction|probation|evidence.based/i;
function publicUrl(value:any):string|null{
 try{
  const u=new URL(String(value||""));
  if(!["https:","http:"].includes(u.protocol)||u.username||u.password)return null;
  const h=u.hostname.toLowerCase();
  if(!h.includes(".")||h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".test")||h.endsWith(".invalid")||h.endsWith(".example")||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.startsWith("["))return null;
  u.hash="";return u.toString()
 }catch{return null}
}
function domain(url:string|null){if(!url)return null;try{return new URL(url).hostname.toLowerCase().replace(/^www\./,"")}catch{return null}}
function kindFor(stream:string,w:any){
 if(stream==="institutions")return /institute|centre|center|laborator|research unit/i.test(String(w.display_name))?"institute":"institution";
 if(stream==="publishers")return /society|association/i.test(String(w.display_name))?"society":"publisher";
 return ["journal","repository","conference"].includes(w.type)?w.type:"other";
}
Deno.serve(async(request)=>{
 const vault=await db`select name,decrypted_secret from vault.decrypted_secrets where name in ('openalex_cron_token','openalex_api_key')`;
 const secrets=Object.fromEntries(vault.map((r:any)=>[r.name,r.decrypted_secret]));
 if(request.method!=="POST"||!secrets.openalex_cron_token||request.headers.get("x-cron-token")!==secrets.openalex_cron_token)return new Response("Forbidden",{status:403});
 const claimed=await db`with next as (
 select id from staging.web_source_searches where active=true and next_search_at<=now()
 order by next_search_at,id limit 1 for update skip locked
 ) update staging.web_source_searches s set next_search_at=now()+interval '2 hours'
 from next where s.id=next.id returning s.id,s.stream,s.term,s.consecutive_errors`;
 if(!claimed.length)return Response.json({status:"idle",message:"No source query due"});
 const search=claimed[0];const [{id:runId}]=await db`insert into staging.web_source_search_runs(search_id)values(${search.id}) returning id`;
 let status="passed",msg="",newCount=0,accepted=0;
 try{
  const params=new URLSearchParams({search:search.term,per_page:"20",select:search.stream==="sources"?"id,display_name,homepage_url,type,country_code,works_count,host_organization_name":search.stream==="institutions"?"id,display_name,homepage_url,country_code,type,works_count,ror":"id,display_name,homepage_url,country_codes,works_count"});
  if(secrets.openalex_api_key)params.set("api_key",secrets.openalex_api_key);
  const response=await coordinatedOpenAlexFetch(db,"https://api.openalex.org/"+search.stream+"?"+params,
    "ID-EBP discovery catalogue (https://id-ebp.org)",12000);
  if(response.status===429||response.status===402)throw Error("RATE_LIMIT_"+response.status);
  if(!response.ok)throw Error("OpenAlex HTTP "+response.status);
  const body=await response.json();
  const items=(body.results??[]).filter((w:any)=>w.id && w.display_name && KEYWORD.test(String(w.display_name))).slice(0,20);
  for(const w of items){
   const name=String(w.display_name).trim().slice(0,250),externalId=String(w.id);
   if(!externalId.startsWith("https://openalex.org/"))continue;
   const homepage=publicUrl(w.homepage_url),cat=kindFor(search.stream,w);
   const country=(w.country_code??w.country_codes?.[0]??null);
   const known=await db`select id from public.sources where lower(name)=lower(${name}) or (${homepage}::text is not null and website_url=${homepage}::text) limit 1`;
   const state=known.length?"already_listed":homepage?"pending":"needs_identity_check";
   const previous=await db`select provider_id from staging.web_source_candidates where provider_id=${externalId} limit 1`;
   const evidence=publicUrl(externalId)??"https://openalex.org";
   const metadata={openalex_id:externalId,source_type:w.type??null,host_organisation:w.host_organization_name??null,ror:w.ror??null,term:search.term,stream:search.stream,checked_at:new Date().toISOString()};
   await db`insert into staging.web_source_candidates(provider_id,entity_type,suggested_category,name,website_url,canonical_domain,country_code,works_count,evidence_url,first_query,raw_metadata,review_status)
    values(${externalId},${cat},${search.stream},${name},${homepage},${domain(homepage)},${country},${Number(w.works_count)||0},${evidence},${search.stream+":"+search.term},${db.json(metadata)},${state})
    on conflict(provider_id) do update set last_seen_at=now(),seen_count=staging.web_source_candidates.seen_count+1,works_count=excluded.works_count,raw_metadata=excluded.raw_metadata`;
   accepted++;
   if(!previous.length)newCount++;
  }
  status=accepted?"passed":"empty";
  await db`update staging.web_source_searches set last_searched_at=now(),next_search_at=now()+interval '14 days',consecutive_errors=0,last_error=null,total_results=total_results+${accepted} where id=${search.id}`;
 }catch(e){
  msg=String(e).slice(0,240);
  const limited=msg.includes("RATE_LIMIT");
  status=limited?"rate_limited":"failed";
  const nextHours=limited?24:Math.min(48,6*(search.consecutive_errors+1));
  await db`update staging.web_source_searches set last_searched_at=now(),next_search_at=now()+(${nextHours}*interval '1 hour'),consecutive_errors=consecutive_errors+1,last_error=${msg} where id=${search.id}`;
 }
 await db`update staging.web_source_search_runs set finished_at=now(),result_status=${status},candidates_seen=${accepted},candidates_new=${newCount},error_detail=${msg||null} where id=${runId}`;
 return Response.json({status,stream:search.stream,term:search.term,seen:accepted,added:newCount,error:msg||undefined});
});