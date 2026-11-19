export function norm(s:string){return String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim()}
function clean(s:string){return String(s??"").replace(/<[^>]*>/g," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g," ").trim().slice(0,900)}
function year(s:string){const m=String(s??"").match(/(?:18|19|20)\d{2}/);const y=m?Number(m[0]):null;return y&&y<=2027?y:null}
function metaAttr(tag:string,name:string){const re=new RegExp("(?:^|\\s)"+name+"\\s*=\\s*(?:\\\"([^\\\"]*)\\\"|'([^']*)'|([^\\s>]+))","i");const m=tag.match(re);return m?clean(m[1]??m[2]??m[3]):""}
function safeUrl(value:string){try{const u=new URL(value);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)return null;const h=u.hostname.toLowerCase();if(!h.includes(".")||h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".test")||h.endsWith(".invalid")||h.endsWith(".example")||/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.startsWith("[")||h==="metadata.google.internal")return null;return u.toString()}catch{return null}}
export function titleMatch(stored:string,remote:string){
 const a=norm(stored.replace(/&/g," and ")),b=norm(remote.replace(/&/g," and "));
 if(!a||!b)return false;if(a===b)return true;
 const words=a.split(" ");
 if(words.length>=3 && b.startsWith(a+" ") && b.length<=a.length*3.5)return true;
 const x=new Set(words),y=new Set(b.split(" "));
 const shared=[...x].filter(t=>y.has(t)).length;
 return x.size>=6 && b.startsWith(words.slice(0,2).join(" ")) && shared/x.size>=.92 && b.length<=a.length*3.5;
}
export async function fetchPage(original:string, { strict = false } = {}){
 let u=safeUrl(original);if(!u)throw Error("Invalid or non-public URL");
 const originalHost = new URL(u).hostname.replace(/^www\./, "");
 const signal = AbortSignal.timeout(7000);
 for(let n=0;n<3;n++){
  let res:Response;
  res=await fetch(u,{redirect:"manual",signal,headers:{"User-Agent":"ID-EBP research metadata checker (https://id-ebp.org)","Accept":"text/html,application/xhtml+xml,application/pdf;q=0.7"}});
  if([301,302,303,307,308].includes(res.status)){const target=safeUrl(new URL(res.headers.get("location")??"",u).toString());await res.body?.cancel();if(!target)throw Error("Unsafe or invalid redirect");if(strict && new URL(target).hostname.replace(/^www\./, "") !== originalHost)return {outcome:"blocked",url:u,html:"",note:"Cross-domain publisher redirect requires review"};u=target;continue}
  if(!res.ok)await res.body?.cancel();
  if([404,410].includes(res.status))return {outcome:"broken_link",url:u,html:"",note:"Publisher returned "+res.status};
  if([401,403,429].includes(res.status))return {outcome:"blocked",url:u,html:"",note:"Access restricted or rate limited: HTTP "+res.status,httpStatus:res.status,retryAfter:res.headers.get("Retry-After")};
  if(!res.ok)throw Error("Publisher HTTP "+res.status);
  const type=String(res.headers.get("content-type")??"");
  if(type.includes("pdf")||/\.pdf(?:$|\?)/i.test(u)){await res.body?.cancel();return {outcome:"pdf_manual",url:u,html:"",note:"PDF requires document-level extraction"};}
  if(type&&!/html|xml|text\/plain/i.test(type)){await res.body?.cancel();return {outcome:"no_metadata",url:u,html:"",note:"Unsupported content type: "+type.slice(0,60)};}
  const rd=res.body?.getReader();const dec=new TextDecoder();let html="",bytes=0;
  if(rd){while(bytes<360000){const r=await rd.read();if(r.done)break;bytes+=r.value.byteLength;html+=dec.decode(r.value,{stream:true})}await rd.cancel().catch(()=>{})}
  return {outcome:"html",url:u,html,note:"Publisher page fetched"};
 }
 throw Error("Too many redirects");
}
export function extract(html:string){
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
