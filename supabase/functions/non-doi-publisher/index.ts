import postgres from "npm:postgres@3.4.4";
const db=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:4});
import { extract, fetchPage, norm, titleMatch } from "../_shared/publisher-metadata.ts";
async function processOne(item:any){
 const rid=item.record_id;
 try{
 const rows=await db`select id,title,url,year,authors,publication,doi,tags from public.research_records where id=${rid}`;
 const r=rows[0];if(!r)throw Error("Missing record");
 const page=await fetchPage(r.url);
 if(page.outcome!=="html"){await store(page.outcome,page.note,{source:"publisher",url:page.url},page.url,[]);return page.outcome}
 const m=extract(page.html);
 const metadata={source:"original publisher page",...m,source_url:page.url,checked_at:new Date().toISOString()};
 if(!m.title){await store("no_metadata","Page did not supply a usable title",metadata,page.url,[]);return "no_metadata"}
 if(!titleMatch(r.title,m.title)){await store("mismatch","Publisher page title does not match catalogue record",metadata,page.url,[]);return "mismatch"}
 if(r.year&&m.year&&Math.abs(Number(r.year)-m.year)>1){await store("mismatch","Publisher year conflicts with recorded year",metadata,page.url,[]);return "mismatch"}
 const updated:string[]=[];
 const currentA=String(r.authors??"").trim();
 const emptyA=!currentA||/^(Not stated|Not specified|Unknown|Responsible organisation:)/i.test(currentA);
 const newA=m.authors.join("; ").slice(0,1200);
 if(emptyA&&newA)updated.push("authors");
 if(r.year==null&&m.year)updated.push("year");
 if(!String(r.publication??"").trim()&&m.publication)updated.push("publication");
 if(!r.doi&&m.doi)updated.push("doi");
 if((r.tags??[]).length===0&&m.keywords.length)updated.push("tags");
 if(m.doi){const existing=await db`select id,title from public.research_records where lower(doi)=${m.doi} and id<>${rid} limit 1`;if(existing.length&&norm(existing[0].title)!==norm(r.title)){await store("mismatch","Publisher DOI already assigned to a different title",metadata,page.url,[]);return "mismatch"}}
 await db.begin(async(tx:any)=>{
  await tx`update private.non_doi_enrichment_queue set publisher_status='verified',publisher_metadata=${tx.json(metadata)},publisher_evidence_url=${page.url},publisher_note='Original publisher title verified',publisher_updated_fields=${updated},publisher_attempted_at=now() where record_id=${rid}`;
  if(updated.length)await tx`update public.research_records set
  authors=case when ${newA}::text <> '' and (btrim(authors)='' or authors ~* '^(Not stated|Not specified|Unknown|Responsible organisation:)') then ${newA} else authors end,
  year=coalesce(year,${m.year}),
  publication=case when btrim(publication)='' then ${m.publication} else publication end,
  doi=coalesce(doi,${m.doi}),
  tags=case when cardinality(tags)=0 then ${m.keywords}::text[] else tags end
  where id=${rid}`;
 });
 return "verified";
 async function store(status:string,note:string,metadata:any,url:string|null,fields:string[]){
  await db`update private.non_doi_enrichment_queue set publisher_status=${status},publisher_metadata=${db.json(metadata)},publisher_evidence_url=${url},publisher_note=${note},publisher_updated_fields=${fields},publisher_attempted_at=now() where record_id=${rid}`;
 }
 }catch(err){
  const msg=String(err).slice(0,300);
  await db`update private.non_doi_enrichment_queue set publisher_status=case when publisher_attempts>=3 then 'error' else 'pending' end,publisher_next_attempt_at=now()+interval '2 hours',publisher_note=${msg},publisher_attempted_at=now() where record_id=${rid}`;
  return "error";
 }
}
Deno.serve(async req=>{
 const rows=await db`select decrypted_secret from vault.decrypted_secrets where name='doi_enrichment_cron_token' limit 1`;
 if(!rows.length||req.headers.get("x-cron-token")!==rows[0].decrypted_secret)return new Response("forbidden",{status:403});
 const claimed=await db`with todo as (
 select record_id from private.non_doi_enrichment_queue where status in ('not_found','ambiguous','error') and publisher_status='pending' and publisher_next_attempt_at<=now() order by batch_no,record_id limit 10 for update skip locked)
 update private.non_doi_enrichment_queue q set publisher_status='processing',publisher_attempted_at=now(),publisher_attempts=publisher_attempts+1 from todo where q.record_id=todo.record_id returning q.record_id,q.batch_no`;
 let cursor=0;const out:string[]=[];
 await Promise.all(Array.from({length:2},async()=>{while(cursor<claimed.length){const k=cursor++;out[k]=await processOne(claimed[k])}}));
 const stats=out.reduce((a:any,s)=>{a[s]=(a[s]??0)+1;return a},{});
 if(claimed.length)await db`insert into private.enrichment_run_log(workflow,batch_no,attempted,verified,conflicts,errors,notes)values('original_publisher',${claimed[0].batch_no},${claimed.length},${stats.verified??0},${(stats.mismatch??0)},${stats.error??0},'Link status and publisher metadata checked')`;
 return Response.json({claimed:claimed.length,batch:claimed[0]?.batch_no??null,outcomes:stats});
});