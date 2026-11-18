import postgres from "npm:postgres@3.4.4";
const db=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:4});
const normal=(s:string)=>String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const canonical=(s:string)=>{try{const u=new URL(s);return u.hostname.toLowerCase()+u.pathname.replace(/\/$/,"").toLowerCase()}catch{return ""}};
const doi=(s:string)=>String(s??"").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i,"").toLowerCase();
const looksAuthor=(s:string)=>Boolean(s.trim()&&!/^(not stated|not specified|unknown|n\/a|responsible organisation:)/i.test(s.trim()));
const surnameMatch=(existing:string,authorships:any[])=>{const a=normal(existing);return authorships.some((v:any)=>{const person=v.author?.display_name??"";const family=normal(String(person).split(/[ ,]/).filter(Boolean).slice(-1)[0]??"");return family.length>=4&&a.split(" ").includes(family)})};
async function processOne(item:any,key:string){
 const rid=item.record_id;
 try {
 const recs=await db`select id,title,url,authors,year,publication,doi,tags,kind_std from public.research_records where id=${rid}`;
 const r=recs[0];
 if(!r)return await save("error","Record missing",null,null,[]);
 const q=String(r.title??"").trim();
 if(q.length<14)return await save("not_found","Title too short for reliable academic matching",null,null,[]);
 const params=new URLSearchParams({"search.title":q.slice(0,180),per_page:"10",select:"id,doi,title,publication_year,type,authorships,primary_location,primary_topic"});
 if(key)params.set("api_key",key);
 const ctrl=new AbortController();const tid=setTimeout(()=>ctrl.abort(),14000);
 let response:Response;
 try{response=await fetch("https://api.openalex.org/works?"+params.toString(),{signal:ctrl.signal,headers:{"User-Agent":"ID-EBP Directory https://id-ebp.org"}})}
 finally{clearTimeout(tid)}
 if(response.status===429)throw Error("RATE_LIMIT");
 if(!response.ok)throw Error("OpenAlex "+response.status);
 const obj=await response.json();
 const cand=(obj.results??[]).filter((w:any)=>normal(w.title)===normal(q));
 if(!cand.length)return await save("not_found","No exact-title OpenAlex match; publisher page fallback required",{search:q,results_count:(obj.results??[]).length},"https://openalex.org",[]);
 const yearOK=(w:any)=>r.year==null||(w.publication_year&&Math.abs(Number(w.publication_year)-Number(r.year))<=1);
 const autOK=(w:any)=>!looksAuthor(String(r.authors??""))||surnameMatch(String(r.authors??""),w.authorships??[]);
 const narrowed=cand.filter((w:any)=>yearOK(w)&&autOK(w));
 if(!narrowed.length)return await save("ambiguous","Title matched but known year or authors disagreed",{candidates:cand.map((w:any)=>({id:w.id,title:w.title,year:w.publication_year,doi:doi(w.doi)}))},cand[0]?.id??null,[]);
 const ids=new Set(narrowed.map((w:any)=>doi(w.doi)||String(w.id)));
 if(ids.size>1)return await save("ambiguous","Multiple publications share title and compatible metadata",{candidates:narrowed.slice(0,5).map((w:any)=>({id:w.id,title:w.title,year:w.publication_year,doi:doi(w.doi)}))},narrowed[0]?.id??null,[]);
 const w=narrowed[0];
 const mAuths=(w.authorships??[]).map((a:any)=>a.author?.display_name).filter(Boolean);
 const urlmatch=canonical(r.url)!==""&&[w.primary_location?.landing_page_url,w.primary_location?.pdf_url,w.doi].some((u:any)=>canonical(String(u??""))===canonical(r.url));
 const yearmatch=r.year!=null&&w.publication_year&&Math.abs(Number(w.publication_year)-Number(r.year))<=1;
 const authmatch=looksAuthor(String(r.authors??""))&&surnameMatch(String(r.authors??""),w.authorships??[]);
 const uniqueLong=normal(q).split(" ").length>=9 && cand.length===1 && !!w.publication_year && mAuths.length>0;
 if(!(urlmatch||yearmatch||authmatch||uniqueLong))return await save("ambiguous","Exact title found but insufficient independent identity evidence",{candidates:narrowed.map((x:any)=>({id:x.id,doi:doi(x.doi),title:x.title,year:x.publication_year}))},w.id,[]);
 const publisher=w.primary_location?.source?.display_name??"";
 const primary=w.primary_topic??null;
 const data={source:"OpenAlex",work_id:w.id,doi:doi(w.doi)||null,title:w.title,year:w.publication_year??null,authors:mAuths,publisher:publisher||null,type:w.type??null,topic:primary?.display_name??null,topic_id:primary?.id??null,affiliation_countries:[...new Set((w.authorships??[]).flatMap((a:any)=>a.countries??[]))],matched_on:{title_exact:true,url:urlmatch,year:Boolean(yearmatch),author:Boolean(authmatch),unique_long_title:Boolean(uniqueLong)},checked_at:new Date().toISOString()};
 const newDoi=data.doi;
 if(newDoi){
 const other=await db`select id,title from public.research_records where lower(doi)=${newDoi} and id<> ${rid} limit 1`;
 if(other.length && normal(other[0].title)!==normal(r.title))return await save("ambiguous","Candidate DOI already assigned to different research title",{candidate:data,existing_record_id:other[0].id},w.id,[]);
 }
 const upd:string[]=[];
 const authors=mAuths.join("; ");
 if(!looksAuthor(String(r.authors??""))&&authors)upd.push("authors");
 if(r.year==null&&Number.isInteger(w.publication_year)&&w.publication_year>1800&&w.publication_year<=2027)upd.push("year");
 if((!r.publication||!String(r.publication).trim())&&publisher)upd.push("publication");
 if(!r.doi&&newDoi)upd.push("doi");
 const label=primary?.display_name??null;
 if((r.tags??[]).length===0&&typeof label==="string"&&label.length>=3&&label.length<=60)upd.push("tags");
 // Preserve nonempty existing values; provenance stored before writing.
 await db.begin(async(tx:any)=>{
   await tx`update private.non_doi_enrichment_queue set status='verified',metadata=${tx.json(data)},evidence_url=${w.id},note='Exact-title OpenAlex match with corroboration; original values preserved',updated_fields=${upd},processed_at=now() where record_id=${rid}`;
   if(upd.length)await tx`update public.research_records set
     authors=case when btrim(authors)='' or authors ~* '^(Not stated|Not specified|Unknown|Responsible organisation:)' then ${authors} else authors end,
     year=coalesce(year,${Number.isInteger(w.publication_year)?w.publication_year:null}),
     publication=case when btrim(publication)='' then ${publisher} else publication end,
     doi=coalesce(doi,${newDoi||null}),
     tags=case when cardinality(tags)=0 and ${label??null}::text is not null then array[${label??null}::text]::text[] else tags end
     where id=${rid}`;
 });
 return "verified";
 async function save(status:string,note:string,metadata:any,evidence_url:string|null,updated:string[]){
  await db`update private.non_doi_enrichment_queue set status=${status},metadata=${metadata==null?null:db.json(metadata)},evidence_url=${evidence_url},note=${note},updated_fields=${updated},processed_at=now() where record_id=${rid}`;
  return status;
 }
 }catch(err){
 const msg=String(err).slice(0,350),rate=msg.includes("RATE_LIMIT"),delay=rate?60:5;
 await db`update private.non_doi_enrichment_queue set status=case when ${rate} then 'queued' when attempts>=3 then 'error' else 'queued' end,next_attempt_at=now()+(${delay} * interval '1 minute'),attempts=case when ${rate} then 0 else attempts end,note=${msg},processed_at=now() where record_id=${rid}`;
 return "error";
 }
}
Deno.serve(async(req)=>{
 const secrets=await db`select name,decrypted_secret from vault.decrypted_secrets where name in ('doi_enrichment_cron_token','openalex_api_key')`;
 const v=Object.fromEntries(secrets.map((x:any)=>[x.name,x.decrypted_secret]));
 if(!v.doi_enrichment_cron_token||req.headers.get("x-cron-token")!==v.doi_enrichment_cron_token)return new Response("forbidden",{status:403});
 const claimed=await db`with todo as (select record_id from private.non_doi_enrichment_queue where status='queued' and next_attempt_at<=now() order by batch_no,record_id limit 10 for update skip locked)
 update private.non_doi_enrichment_queue q set status='processing',claimed_at=now(),attempts=attempts+1 from todo where q.record_id=todo.record_id returning q.record_id,q.batch_no`;
 let cursor=0;const outcomes:string[]=[];
 await Promise.all(Array.from({length:2},async()=>{while(cursor<claimed.length){const n=cursor++;outcomes[n]=await processOne(claimed[n],v.openalex_api_key??"")}}));
 const tally=outcomes.reduce((a:any,s)=>{a[s]=(a[s]??0)+1;return a},{});
 if(claimed.length)await db`insert into private.enrichment_run_log(workflow,batch_no,attempted,verified,partial,conflicts,errors,notes)
 values ('non_doi_openalex',${claimed[0].batch_no},${claimed.length},${tally.verified??0},${tally.partial??0},${(tally.ambiguous??0)},${tally.error??0},'Automated exact-title matching; no unverified updates')`;
 return Response.json({claimed:claimed.length,batch:claimed[0]?.batch_no??null,outcomes:tally});
});