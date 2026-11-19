import postgres from "npm:postgres@3.4.4";
import { coordinatedOpenAlexFetch } from "../_shared/openalex-policy.ts";
const sql=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:3});
const norm=(s:string)=>String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const matches=(a:string,b:string)=>{const x=norm(a),y=norm(b);if(!x||!y)return false;if(x===y)return true;const A=new Set(x.split(" ")),B=new Set(y.split(" "));const overlap=[...A].filter(v=>B.has(v)).length;return overlap>=Math.min(4,A.size,B.size)&&overlap/Math.max(A.size,B.size)>=.78};
const cleanDoi=(d:string)=>String(d??"").replace(/^https?:\/\/(dx\.)?doi\.org\//i,"").trim().toLowerCase();
Deno.serve(async(req)=>{
 const v=await sql`select name,decrypted_secret from vault.decrypted_secrets where name in ('doi_enrichment_cron_token','openalex_api_key')`;
 const secrets=Object.fromEntries(v.map((x:any)=>[x.name,x.decrypted_secret]));
 if(!secrets.doi_enrichment_cron_token||req.headers.get("x-cron-token")!==secrets.doi_enrichment_cron_token)return new Response("forbidden",{status:403});
 const claimed=await sql`with next as (select record_id from private.doi_enrichment_queue where status='queued' and next_attempt_at<=now() order by batch_no,record_id limit 50 for update skip locked)
 update private.doi_enrichment_queue q set status='processing',claimed_at=now(),attempts=attempts+1 from next where q.record_id=next.record_id returning q.record_id,q.doi,q.batch_no`;
 if(!claimed.length)return Response.json({claimed:0});
 try {
 const dois=claimed.map((x:any)=>cleanDoi(x.doi));
 const params=new URLSearchParams({filter:"doi:"+dois.map((x:string)=>"https://doi.org/"+x).join("|"),per_page:"100",select:"id,doi,title,publication_year,type,authorships,primary_location,open_access"});
 if(secrets.openalex_api_key)params.set("api_key",secrets.openalex_api_key);
 const response=await coordinatedOpenAlexFetch(sql,"https://api.openalex.org/works?"+params,
   "ID-EBP Directory (https://id-ebp.org)",12000);
 if(!response.ok)throw Error("OpenAlex HTTP "+response.status);
 const body=await response.json();
 const mapped=new Map((body.results??[]).map((x:any)=>[cleanDoi(x.doi??""),x]));
 let verified=0,conflicts=0,unmatched=0;
 for(const item of claimed){
 const doi=cleanDoi(item.doi),m:any=mapped.get(doi);
 if(!m){await sql`update private.doi_enrichment_queue set status='queued',next_attempt_at=now()+interval '12 hours',note='No OpenAlex match; Crossref/DataCite fallback',processed_at=now() where record_id=${item.record_id}`;unmatched++;continue}
 const recs=await sql`select title,authors,year,publication from public.research_records where id=${item.record_id}`;const r=recs[0];
 if(!r){await sql`update private.doi_enrichment_queue set status='error',note='Record missing' where record_id=${item.record_id}`;continue}
 const meta={source:"OpenAlex",doi,title:m.title??"",year:m.publication_year??null,authors:(m.authorships??[]).map((a:any)=>a.author?.display_name).filter(Boolean),publication:m.primary_location?.source?.display_name??null,type:m.type??null,open_access:m.open_access??null,evidence_url:m.id??null,checked_at:new Date().toISOString()};
 if(!matches(r.title,meta.title)){await sql`update private.doi_enrichment_queue set status='conflict',metadata=${sql.json(meta)},evidence_url=${meta.evidence_url},note='OpenAlex title mismatch; no automatic overwrite',processed_at=now() where record_id=${item.record_id}`;conflicts++;continue}
 const au=meta.authors.join("; "),yr=meta.year;const updated:string[]=[];
 if(!String(r.authors??"").trim()&&au)updated.push("authors");
 if(r.year==null&&Number.isInteger(yr)&&yr>=1800&&yr<=2027)updated.push("year");
 if(updated.length)await sql`update public.research_records set authors=case when btrim(authors)='' then ${au} else authors end,year=coalesce(year,${yr}) where id=${item.record_id}`;
 await sql`update private.doi_enrichment_queue set status='verified',metadata=${sql.json(meta)},evidence_url=${meta.evidence_url},updated_fields=${updated},note='DOI and title matched via OpenAlex; original values preserved',processed_at=now() where record_id=${item.record_id}`;verified++;
 }
 return Response.json({claimed:claimed.length,verified,conflicts,unmatched,api_key_used:!!secrets.openalex_api_key});
 }catch(e){
 const note=String(e).slice(0,300),rate=/429/.test(note);
 await sql`update private.doi_enrichment_queue set status='queued',next_attempt_at=now()+case when ${rate} then interval '1 hour' else interval '15 minutes' end,note=${note},attempts=case when ${rate} then 0 else attempts end where record_id=any(${claimed.map((x:any)=>x.record_id)}) and status='processing'`;
 return Response.json({claimed:claimed.length,error:note},{status:503})
 }
});