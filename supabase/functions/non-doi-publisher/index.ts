import postgres from "npm:postgres@3.4.4";
const db=postgres(Deno.env.get("SUPABASE_DB_URL")!,{prepare:false,max:4});
function norm(s:string){return String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
function clean(s:string){return String(s??"").replace(/<[^>]*>/g," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g," ").trim().slice(0,900)}
function year(s:string){const m=String(s??"").match(/(?:18|19|20)\d{2}/);const y=m?Number(m[0]):null;return y&&y<=2027?y:null}
function metaAttr(tag:string,name:string){const re=new RegExp("(?:^|\\s)"+name+"\\s*=\\s*(?:\\\"([^\\\"]*)\\\"|'([^']*)'|([^\\s>]+))","i");const m=tag.match(re);return m?clean(m[1]??m[2]??m[3]):""}
function safeUrl(value:string){try{const u=new URL(value);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)return null;const h=u.hostname.toLowerCase();if(!h.includes(".")||h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".test")||h.endsWith(".invalid")||h.endsWith(".example")||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.startsWith("[")||h==="metadata.google.internal")return null;return u.toString()}catch{return null}}
function titleMatch(stored:string,remote:string){
 const a=norm(stored.replace(/&/g," and ")),b=norm(remote.replace(/&/g," and "));
 if(!a||!b)return false;if(a===b)return true;
 const words=a.split(" ");
 if(words.length>=3 && b.startsWith(a+" ") && b.length<=a.length*3.5)return true;
 const x=new Set(words),y=new Set(b.split(" "));
 const shared=[...x].filter(t=>y.has(t)).length;
 return x.size>=6 && b.startsWith(words.slice(0,2).join(" ")) && shared/x.size>=.92 && b.length<=a.length*3.5;
}
async function fetchPage(original:string){
 let u=safeUrl(original);if(!u)throw Error("Invalid or non-public URL");
 for(let n=0;n<3;n++){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),13000);let res:Response;
  try{res=await fetch(u,{redirect:"manual",signal:c.signal,headers:{"User-Agent":"ID-EBP research metadata checker (https://id-ebp.org)","Accept":"text/html,application/xhtml+xml,application/pdf;q=0.7"}})}
  finally{clearTimeout(t)}
  if([301,302,303,307,308].includes(res.status)){const target=safeUrl(new URL(res.headers.get("location")??"",u).toString());if(!target)throw Error("Unsafe or invalid redirect");u=target;continue}
  if([404,410].includes(res.status))return {outcome:"broken_link",url:u,html:"",note:"Publisher returned "+res.status};
  if([401,403,429].includes(res.status))return {outcome:"blocked",url:u,html:"",note:"Access restricted or rate limited: HTTP "+res.status};
  if(!res.ok)throw Error("Publisher HTTP "+res.status);
  const type=String(res.headers.get("content-type")??"");
  if(type.includes("pdf")||/\.pdf(?:$|\?)/i.test(u))return {outcome:"pdf_manual",url:u,html:"",note:"PDF requires document-level extraction"};
  if(type&&!/html|xml|text\/plain/i.test(type))return {outcome:"no_metadata",url:u,html:"",note:"Unsupported content type: "+type.slice(0,60)};
  const rd=res.body?.getReader();const dec=new TextDecoder();let html="",bytes=0;
  if(rd){while(bytes<360000){const r=await rd.read();if(r.done)break;bytes+=r.value.byteLength;html+=dec.decode(r.value,{stream:true})}await rd.cancel().catch(()=>{})}
  return {outcome:"html",url:u,html,note:"Publisher page fetched"};
 }
 throw Error("Too many redirects");
}
function extract(html:string){
 const fields:Record<string,string[]>={};
 for(const m of html.matchAll(/<meta\b[^>]*>/gi)){
  const tag=m[0],name=(metaAttr(tag,"name")||metaAttr(tag,"property")||metaAttr(tag,"itemprop")).toLowerCase();
  const value=metaAttr(tag,"content");if(!name||!value)continue;
  if(!fields[name])fields[name]=[];if(fields[name].length<15)fields[name].push(value);
 }
 const first=(...names:string[])=>{for(const n of names)if(fields[n]?.length)return fields[n][0];return ""};
 const as=[...(fields.citation_author??[]),...(fields["dc.creator"]??[])].filter(Boolean);
 const tree:any[]=[];
 for(const mt of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const v=JSON.parse(mt[1]);const a=Array.isArray(v)?v:[v];for(const obj of a)tree.push(...(Array.isArray(obj?.["@graph"])?obj["@graph"]:[obj]))}catch{}
 }
 const works=tree.filter(v=>v&&typeof v==="object"&&/article|scholarly|report|book|creativework|thesis|dataset|webpage/i.test(String(v["@type"]??"")));
 const w=works.find(v=>v.headline||v.name)||works[0]||{};
 const byLine=(v:any)=>{const ar=Array.isArray(v)?v:v?[v]:[];return ar.map(x=>typeof x==="string"?x:x?.name).filter(Boolean)};
 const authors=as.length?as:byLine(w.author);
 let possibleTitle=first("citation_title","dc.title","dcterms.title","og:title","twitter:title")||clean(w.headline||w.name||"");
 if(!possibleTitle){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);possibleTitle=clean(m?.[1]??"")}
 const dat=first("citation_publication_date","citation_date","citation_online_date","article:published_time","dc.date","dc.date.issued","dcterms.issued","datepublished")||String(w.datePublished||w.dateCreated||"");
 const publication=first("citation_journal_title","citation_publisher","dc.publisher","dcterms.publisher","og:site_name")||clean(w.publisher?.name||w.publisher||"");
 const rawDoi=first("citation_doi","dc.identifier.doi","dc.identifier")||String(w.identifier?.value||"");
 const doiMatch=rawDoi.match(/10\.\d{4,9}\/[\w.()\-;/:+]+/i);
 const keywords=[...(fields["citation_keywords"]??[]),...(fields.keywords??[]),...(typeof w.keywords==="string"?[w.keywords]:Array.isArray(w.keywords)?w.keywords:[])].flatMap(x=>String(x).split(/[;,]/)).map(x=>clean(x)).filter(x=>x.length>=3&&x.length<=60).slice(0,5);
 return {title:possibleTitle,year:year(dat),date_raw:dat,authors:[...new Set(authors.map(x=>clean(x)).filter(Boolean))].slice(0,20),publication,doi:doiMatch?doiMatch[0].replace(/[.,;]$/,"").toLowerCase():null,keywords,description:first("description","dc.description","og:description")||clean(w.description||w.abstract||"")};
}
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