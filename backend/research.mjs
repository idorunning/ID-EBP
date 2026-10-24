// Discovery only. This module never interprets findings or assigns evidence grades.
export function researchNormalise(value){return String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/&/g,' and ').replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
export function buildResearchIndex(records){
 const index=Object.create(null);
 records.forEach((record,i)=>{const text=[record.id,record.title,record.authors,record.source,record.publisher,record.setting,record.resourceType,record.topic,...record.recordedTags,...record.searchTerms].join(' ');for(const token of new Set(researchNormalise(text).split(' '))){if(!token)continue;(index[token]??=[]).push(i);}});
 return index;
}
export function searchResearch(data,index,params,visibleSlugs){
 const query=(params.get('query')||'').trim(),source=params.get('source')||'',kind=params.get('kind')||'',year=params.get('year')||'';
 const tags=[...new Set(params.getAll('tag').map(t=>t.trim()).filter(Boolean))];
 const pageText=params.get('page')||'1',page=Number(pageText);
 if(query.length>200||tags.length>8||tags.some(t=>t.length>100)||source.length>120||kind.length>40||year&&!/^\d{4}$/.test(year)||!/^\d{1,6}$/.test(pageText)||page<1)throw new RangeError('Please shorten your search or check the filters.');
 const words=[...new Set(researchNormalise(query).split(' ').filter(Boolean))];
 if(words.length>16)throw new RangeError('Please use no more than 16 search words.');
 let candidates=null;
 for(const word of words){
  const matches=new Set(index[word]||[]);
  // Prefix matching is explicit; do not silently drop short words or use OR.
  if(word.length>=4)for(const token of Object.keys(index))if(token!==word&&token.startsWith(word))for(const i of index[token])matches.add(i);
  candidates=candidates===null?matches:new Set([...candidates].filter(i=>matches.has(i)));
  if(!candidates.size)break;
 }
 const visible=data.records.filter(r=>visibleSlugs.has(r.sourceSlug));
 if(params.has('summary'))return {checkpoint:data.checkpoint,publicRecordCount:visible.length,sourceCount:new Set(visible.map(r=>r.sourceSlug)).size,independentAppraisals:0};
 const tagKeys=tags.map(researchNormalise);
 let matches=(candidates===null?visible:[...candidates].map(i=>data.records[i]).filter(r=>visibleSlugs.has(r.sourceSlug))).filter(r=>(!source||r.sourceSlug===source)&&(!kind||r.kind===kind)&&(!year||new RegExp('^'+year+'(?:$|[^0-9])').test(r.publicationDate))&&tagKeys.every(t=>[...r.recordedTags,...r.searchTerms].some(v=>researchNormalise(v)===t)));
 if(query){const phrase=researchNormalise(query);matches=matches.map(r=>({r,score:(researchNormalise(r.title).includes(phrase)?10:0)+(researchNormalise(r.id)===phrase?100:0)})).sort((a,b)=>b.score-a.score||a.r.title.localeCompare(b.r.title)||a.r.id.localeCompare(b.r.id)).map(x=>x.r);}
 // Otherwise preserve workbook order; no implication of quality or effectiveness.
 const sourceCounts=new Map();const kinds=new Map();const tagCounts=new Map();
 for(const r of visible){sourceCounts.set(r.sourceSlug,(sourceCounts.get(r.sourceSlug)||0)+1);kinds.set(r.kind,(kinds.get(r.kind)||0)+1);}
 for(const r of matches)for(const term of new Set([...r.recordedTags,...r.searchTerms]))if(term.length<=60)tagCounts.set(term,(tagCounts.get(term)||0)+1);
 const total=matches.length,pageSize=25,pages=Math.max(1,Math.ceil(total/pageSize)),actualPage=Math.min(page,pages);
 return {checkpoint:data.checkpoint,notice:data.notice,tagNotice:data.tagNotice,independentAppraisals:0,
  publicRecordCount:visible.length,sourceCount:sourceCounts.size,total,page:actualPage,pages,pageSize,
  sources:data.sources.filter(s=>sourceCounts.has(s.slug)).map(s=>({...s,count:sourceCounts.get(s.slug)})).sort((a,b)=>a.name.localeCompare(b.name)),
  kinds:[...kinds].map(([name,count])=>({name,count})),
  suggestedTerms:[...tagCounts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,16).map(([term,count])=>({term,count})),
  records:matches.slice((actualPage-1)*pageSize,actualPage*pageSize)};
}

export function suggestResearchTerms(data,params,visibleSlugs){
 const prefix=researchNormalise(params.get('suggest')||'');
 if(prefix.length>80)throw new RangeError('Please shorten the catalogue term.');
 if(prefix.length<2)return {terms:[]};
 const counts=new Map();
 for(const r of data.records){if(!visibleSlugs.has(r.sourceSlug))continue;for(const term of new Set([...r.recordedTags,...r.searchTerms])){if(term.length>60)continue;const key=researchNormalise(term);if(key.startsWith(prefix)||key.split(' ').some(w=>w.startsWith(prefix)))counts.set(term,(counts.get(term)||0)+1);}}
 return {terms:[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10).map(([term,count])=>({term,count}))};
}
