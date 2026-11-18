import postgres from "npm:postgres@3.4.4";
const db=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:3});
const norm=(s:string)=>String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const cleanDoi=(s:string)=>String(s??"").replace(/^https?:\/\/(dx\.)?doi\.org\//i,"").toLowerCase().trim();
function titleSame(a:string,b:string){const x=norm(a),y=norm(b);if(x===y&&x.length>0)return true;if(!x||!y)return false;const A=new Set(x.split(" ")),B=new Set(y.split(" "));const c=[...A].filter(w=>B.has(w)).length;return A.size>=5&&c/Math.max(A.size,B.size)>.92}
async function work(row:any){
 const id=row.record_id,d=cleanDoi(row.doi);
 try{
 const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);let res:Response;
 try{res=await fetch("https://api.datacite.org/dois/"+encodeURIComponent(d),{signal:c.signal,headers:{"Accept":"application/vnd.api+json","User-Agent":"ID-EBP metadata verification (https://id-ebp.org)"}})}
 finally{clearTimeout(t)}
 if(res.status===404){await set("not_found",null);return "not_found"}
 if(res.status===429)throw Error("RATE_LIMIT");
 if(!res.ok)throw Error("DataCite "+res.status);
 const a=(await res.json())?.data?.attributes??{};
 if(cleanDoi(a.doi)!==d)throw Error("DOI mismatch from DataCite");
 const title=String(a.titles?.[0]?.title??"");
 const people=(a.creators??[]).map((x:any)=>x.name??[x.givenName,x.familyName].filter(Boolean).join(" ")).filter(Boolean);
 const yr=Number(a.publicationYear)||null;
 const m={source:"DataCite",title,doi:d,authors:people,year:yr,publisher:a.publisher??null,type:a.types?.resourceTypeGeneral??null,landing_url:a.url??null,checked_at:new Date().toISOString()};
 const rec=await db`select title,authors,year,publication from public.research_records where id=${id}`;const r=rec[0];
 if(!r||!titleSame(r.title,title)){await set("conflict",m);return "conflict"}
 if(r.year&&yr&&Math.abs(Number(r.year)-yr)>1){await set("conflict",m);return "conflict"}
 const fillA=!String(r.authors??"").trim()&&people.length>0,fillY=r.year==null&&yr&&yr>=1800&&yr<=2027;
 const pub=String(a.publisher??"");
 await db.begin(async(tx:any)=>{
  await tx`update private.doi_enrichment_queue set datacite_status='verified',datacite_metadata=${tx.json(m)},status='verified',metadata=${tx.json(m)},evidence_url=${"https://api.datacite.org/dois/"+encodeURIComponent(d)},updated_fields=${[...(fillA?["authors"]:[]),...(fillY?["year"]:[])]},note='DOI and title confirmed via DataCite',processed_at=now() where record_id=${id}`;
  if(fillA||fillY||(!r.publication&&pub))await tx`update public.research_records set authors=case when btrim(authors)='' then ${people.join("; ")} else authors end,year=coalesce(year,${fillY?yr:null}),publication=case when btrim(publication)='' then ${pub} else publication end where id=${id}`;
 });
 return "verified";
 async function set(status:string,data:any){await db`update private.doi_enrichment_queue set datacite_status=${status},datacite_metadata=${data?db.json(data):null},datacite_claimed_at=now() where record_id=${id}`;}
 }catch(e){
 const err=String(e).slice(0,220),rate=err.includes("RATE_LIMIT");
 await db`update private.doi_enrichment_queue set datacite_status=case when ${rate} then 'pending' when datacite_attempts>=3 then 'error' else 'pending' end,datacite_next_attempt_at=now()+case when ${rate} then interval '1 hour' else interval '15 minutes' end,datacite_attempts=case when ${rate} then 0 else datacite_attempts end,note=${err} where record_id=${id}`;
 return "error";
 }
}
Deno.serve(async req=>{
 const secrets=await db`select decrypted_secret from vault.decrypted_secrets where name='doi_enrichment_cron_token' limit 1`;
 if(!secrets.length||req.headers.get("x-cron-token")!==secrets[0].decrypted_secret)return new Response("forbidden",{status:403});
 const batch=await db`with todo as(select record_id from private.doi_enrichment_queue where status in ('not_found','error') and datacite_status='pending' and datacite_next_attempt_at<=now() order by batch_no,record_id limit 10 for update skip locked)
 update private.doi_enrichment_queue q set datacite_status='processing',datacite_claimed_at=now(),datacite_attempts=datacite_attempts+1 from todo where q.record_id=todo.record_id returning q.record_id,q.doi,q.batch_no`;
 let cursor=0;const statuses:string[]=[];
 await Promise.all(Array.from({length:2},async()=>{while(cursor<batch.length){const i=cursor++;statuses[i]=await work(batch[i])}}));
 return Response.json({claimed:batch.length,outcomes:statuses.reduce((a:any,s)=>{a[s]=(a[s]??0)+1;return a},{})});
});