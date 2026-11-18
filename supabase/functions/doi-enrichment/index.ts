import postgres from "npm:postgres@3.4.4";
const sql=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:5});
const normal=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function matches(a:string,b:string){const x=normal(a),y=normal(b);if(!x||!y)return false;if(x===y)return true;const A=new Set(x.split(" ")),B=new Set(y.split(" "));const common=[...A].filter(z=>B.has(z)).length;return common/Math.max(A.size,B.size)>=.78 && common>=Math.min(4,A.size,B.size);}
function yearOf(m:any){for(const k of ["published","published-print","published-online","issued","created"]){const v=m[k]?.["date-parts"]?.[0]?.[0];if(Number.isInteger(v)&&v>=1800&&v<=2027)return v}return null}
async function handle(r:any){
 const id=r.record_id,doi=String(r.doi).trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i,"");
 try{
 const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),12000);
 let response:Response;
 try{response=await fetch("https://api.crossref.org/works/"+encodeURIComponent(doi),{signal:ctl.signal,headers:{"User-Agent":"ID-EBP research metadata enrichment (https://id-ebp.org; mailto:contact@id-ebp.org)"}})}finally{clearTimeout(t)}
 if(response.status===404){await sql`update private.doi_enrichment_queue set status='not_found',note='Crossref DOI not found',processed_at=now() where record_id=${id}`;return 'not_found'}
 if(response.status===429)throw Error('RATE_LIMITED'); if(!response.ok)throw Error("Crossref HTTP "+response.status);
 const m=(await response.json()).message;
 const found=String(m.DOI??"").toLowerCase(),requested=doi.toLowerCase();
 if(found!==requested)throw Error("Returned DOI mismatch");
 const recs=await sql`select title,authors,year,publication,kind_std from public.research_records where id=${id}`;
 if(!recs.length)throw Error("Record unavailable");
 const rec=recs[0],title=String(m.title?.[0]??"");
 const metadata={doi:found,title,authors:(m.author??[]).map((a:any)=>[a.given,a.family].filter(Boolean).join(" ")).filter(Boolean),year:yearOf(m),publisher:m.publisher??null,container_title:m["container-title"]?.[0]??null,type:m.type??null,issued:m.issued??null,link:m.URL??null,source:"Crossref",checked_at:new Date().toISOString()};
 const good=matches(rec.title,title);
 if(!good){await sql`update private.doi_enrichment_queue set status='conflict',metadata=${sql.json(metadata)},evidence_url=${"https://doi.org/"+doi},note='Title mismatch: requires manual verification',processed_at=now() where record_id=${id}`;return 'conflict'}
 const authors=metadata.authors.join("; "),year=metadata.year;
 // Only fill missing fields; never replace existing substantive values.
 const updated:string[]=[];
 if((!rec.authors||!String(rec.authors).trim())&&authors)updated.push("authors");
 if(rec.year==null&&year)updated.push("year");
 if(updated.length)await sql`update public.research_records set authors=case when btrim(authors)='' then ${authors} else authors end, year=coalesce(year,${year}) where id=${id}`;
 await sql`update private.doi_enrichment_queue set status='verified',metadata=${sql.json(metadata)},evidence_url=${"https://api.crossref.org/works/"+encodeURIComponent(doi)},note='DOI and title matched; missing values only filled',updated_fields=${updated},processed_at=now() where record_id=${id}`;
 return 'verified';
 }catch(e){
 await sql`update private.doi_enrichment_queue set status=case when ${String(e).includes('RATE_LIMITED')} then 'queued' when attempts>=3 then 'error' else 'queued' end, next_attempt_at=case when ${String(e).includes('RATE_LIMITED')} then now()+interval '30 minutes' else now()+interval '3 minutes' end, attempts=case when ${String(e).includes('RATE_LIMITED')} then 0 else attempts end,note=${String(e).slice(0,300)},processed_at=now() where record_id=${id}`;
 return 'error'
 }
}
Deno.serve(async(req)=>{
 const rows=await sql`select decrypted_secret from vault.decrypted_secrets where name='doi_enrichment_cron_token' limit 1`;
 if(!rows.length||req.headers.get("x-cron-token")!==rows[0].decrypted_secret)return new Response("forbidden",{status:403});
 const claimed=await sql`with next as (select record_id from private.doi_enrichment_queue where status='queued' and next_attempt_at<=now() order by batch_no,record_id limit 5 for update skip locked) update private.doi_enrichment_queue q set status='processing',claimed_at=now(),attempts=attempts+1 from next where q.record_id=next.record_id returning q.record_id,q.doi,q.batch_no`;
 let i=0;const results:string[]=[];
 await Promise.all(Array.from({length:1},async()=>{while(i<claimed.length){const k=i++;results[k]=await handle(claimed[k])}}));
 const counts=await sql`select status,count(*)::int n from private.doi_enrichment_queue group by status order by status`;
 return Response.json({claimed:claimed.length,batch:claimed[0]?.batch_no??null,results:results.reduce((a:any,v)=>{a[v]=(a[v]??0)+1;return a},{}),overall:counts});
});