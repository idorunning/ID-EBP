import {topicSuggestions,planSearch} from './search-topics.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('en-GB');
function href(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?escape(u.href):'#';}catch{return '#';}}
export function researchForm(query='',home=false){return `<form class="research-form ${home?'research-form-home':''}" id="research-form" action="/research" method="get" role="search"><label class="sr-only" for="research-query">Search policing research by topic, question, title or author</label><div class="research-input-row"><span aria-hidden="true">⌕</span><input type="search" id="research-query" name="q" value="${escape(query)}" placeholder="Try burglary, DA, or ask a question…" maxlength="300" autocomplete="off" aria-describedby="research-help" aria-controls="research-suggestions"><button class="button" type="submit">Search</button></div>${home?'':`<div id="research-selected" class="research-chips" aria-label="Selected search topics"></div><div id="research-suggestions" class="research-chips" aria-label="Suggested topics"></div><div class="research-search-options"><label><input type="checkbox" id="research-exact"> Search only my words</label><button type="button" class="research-clear" data-clear-research>Clear search</button></div>`}<p class="research-help" id="research-help">${home?'Type a topic or question. Related terms and common abbreviations are included.':'Choose a suggested topic, or search in your own words.'}</p></form>`;}
export function researchPage(params,sources=[]){return `<section class="container research-head"><p class="eyebrow">THE ID-EBP CATALOGUE</p><h1>Search policing research</h1><p class="research-intro">Start with a topic. Ask a question.<br>Find research that helps.</p>${researchForm(params.get('q')||'')}<div id="research-interpretation" class="research-interpretation" aria-live="polite"></div><nav class="research-tabs" aria-label="Search collections"><a aria-current="page" href="/research">Research &amp; resources</a><a href="/directory?query=${encodeURIComponent(params.get('q')||'')}">Research sources</a></nav></section><section class="container research-layout"><div><div class="research-toolbar"><p id="research-count" role="status">Searching the catalogue…</p><label>Source<select id="research-source"><option value="">All sources</option>${sources.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<option value="${escape(s.id)}" ${params.get('source')===s.id?'selected':''}>${escape(s.name)}</option>`).join('')}</select></label></div><div id="research-results" aria-busy="true"></div><nav id="research-pagination" class="pagination" aria-label="Research result pages"></nav></div><aside class="research-aside"><div id="research-related-topics"></div><details><summary>About these results</summary><p>This growing catalogue includes research, evidence reviews, practical resources and collection pages.</p><p>Search matches indicate relevance, not research quality. Independent appraisal and some publication, tagging and full-text checks are still pending.</p><p>Search topics may be identified automatically from the available catalogue text. Access information describes what was recorded during cataloguing; check the original website for current availability.</p><p>Related results use the meaning of available titles and descriptions. Records with limited descriptions may be harder to find.</p></details><div id="research-source-matches"></div><a class="text-link" href="/directory">Browse all sources →</a></aside></section>`;}
function usefulSummary(text){return text&&!/Stage \d+ inventory record|Item.level review has not yet been performed|Login or Register for Access|Hit enter to search or ESC to close|^Publisher-listed resource\. Metadata recorded for discovery; independent evidence appraisal pending\.$|^Public repository metadata entry\. Eligibility and the underlying publication have not been verified\.$|^Resource identified in the official source listing\. Content and evidence have not yet been independently appraised\.$/i.test(text.trim());}
export function researchCard(r,sourceIds){return `<article class="research-result"><p class="research-origin">${escape(r.source)} <span>· ${escape(r.kind||'Resource')}</span></p><h2><a href="${href(r.url)}" target="_blank" rel="noopener noreferrer">${escape(r.title)} <span aria-hidden="true">↗</span></a></h2>${r.authors||r.publication?`<p class="research-byline">${escape(r.authors||'Author not yet recorded')}${r.publication?' · '+escape(r.publication):''}</p>`:''}${usefulSummary(r.summary)?`<p class="research-summary">${escape(r.summary)}</p>`:''}${r.match_type==='meaning'?'<p class="research-match-note">Related by meaning</p>':r.match_type==='similar-wording'?'<p class="research-match-note">Similar wording</p>':''}<div class="research-chips">${(r.tags||[]).slice(0,5).map(t=>`<button type="button" data-result-tag="${escape(t)}">${escape(t)}</button>`).join('')}</div><details><summary>Access and catalogue details</summary><p>${escape(r.access||'Full-text access not yet checked.')}</p><p>${escape(r.status)}</p>${r.search_topics?.length?`<p>Search topics identified from this record: ${escape(r.search_topics.join(', '))}.</p>`:''}<p>Record: ${escape(r.id)}${r.checked?' · Checked '+escape(r.checked):''}</p>${sourceIds.has(r.source_slug)?`<a href="/source/${encodeURIComponent(r.source_slug)}">View source profile →</a>`:''}</details></article>`;}
export function interpretationHtml(data,query){
 const i=data.interpretation;if(!i||!query)return '';
 const messages=[];
 if(i.corrections?.length)messages.push(`Showing results for <strong>${escape(i.corrected)}</strong>.`);
 if(i.topics?.length)messages.push(`Searching <strong>${i.topics.map(t=>escape(t.label)).join(' + ')}</strong>${i.intents?.length?' · '+i.intents.map(t=>escape(t.label)).join(', '):''}.`);
 if(i.exact)messages.push('Searching only the entered words.');
 if(!i.exact&&(i.topics?.length||i.corrections?.length))messages.push('<button type="button" class="text-link" data-use-exact>Use only my words</button>');
 if(i.suggestions?.length)messages.push('Explore: '+i.suggestions.map(t=>`<button type="button" class="research-topic-link" data-topic-query="${escape(t.label)}">${escape(t.label)}</button>`).join(' '));
 return messages.length?'<p>'+messages.join(' ')+'</p>':'';
}
export function queryAfterTopicSuggestion(query){
 const plan=planSearch(query);
 if(plan.exact)return query;
 if(plan.topics.length)return plan.intents.length||plan.terms.length?query:'';
 return topicSuggestions(query).length?'':query;
}
export function bindResearch({params,sources=[],searchSources}){
 const form=document.getElementById('research-form');if(!form)return ()=>{};
 if(!document.getElementById('research-results')){const submit=event=>{event.preventDefault();const q=form.querySelector('input[name="q"]').value.trim();const p=new URLSearchParams();if(q)p.set('q',q);window.location.assign('/research'+(p.size?'?'+p:''));};form.addEventListener('submit',submit);return ()=>form.removeEventListener('submit',submit);}
 const input=form.querySelector('input[name="q"]'),results=document.getElementById('research-results'),count=document.getElementById('research-count'),exact=document.getElementById('research-exact');
 const source=document.getElementById('research-source'),suggestions=document.getElementById('research-suggestions'),selected=document.getElementById('research-selected'),main=document.getElementById('main');
 let tags=[...new Set(params.getAll('tag'))].slice(0,10),page=Math.max(1,parseInt(params.get('page'),10)||1),controller,tagController,timer,disposed=false,sequence=0,suggestSequence=0;
 exact.checked=params.get('exact')==='1';
 const sourceIds=new Set(sources.map(s=>s.id));
 const urlParams=()=>{const p=new URLSearchParams();if(input.value.trim())p.set('q',input.value.trim());tags.forEach(t=>p.append('tag',t));if(source.value)p.set('source',source.value);if(exact.checked)p.set('exact','1');if(page>1)p.set('page',page);return p;};
 function chips(){selected.innerHTML=tags.map(t=>`<button type="button" class="selected" data-remove-tag="${escape(t)}" aria-label="Remove topic: ${escape(t)}">${escape(t)} ×</button>`).join('');}
 function showSuggestions(list){suggestions.innerHTML=list.filter(t=>!tags.some(tag=>tag.toLowerCase()===t.tag.toLowerCase())).slice(0,8).map(t=>`<button type="button" data-suggest-tag="${escape(t.tag)}">+ ${escape(t.tag)}</button>`).join('');}
 async function suggest(){
  const runId=++suggestSequence;tagController?.abort();tagController=new AbortController();
  showSuggestions(topicSuggestions(input.value.trim()));
  try{const r=await fetch('/api/research/tags?'+new URLSearchParams({q:input.value.trim()}),{signal:tagController.signal});if(!r.ok)return;const data=await r.json();if(!disposed&&runId===suggestSequence)showSuggestions(data);}catch{/* Local topic suggestions remain available. */}
 }
 function setUrl(push){const p=urlParams(),url='/research'+(p.size?'?'+p:'');if(push&&url!==location.pathname+location.search)history.pushState(null,'',url);else history.replaceState(null,'',url);}
 async function run({push=false}={}){
  const runId=++sequence;controller?.abort();controller=new AbortController();chips();setUrl(push);
  const q=input.value.trim();document.querySelector('.research-tabs a:last-child').href='/directory?'+new URLSearchParams({query:[q,...tags].join(' '),...(exact.checked?{exact:'1'}:{})});
  results.setAttribute('aria-busy','true');count.textContent='Searching the catalogue…';document.getElementById('research-pagination').innerHTML='';
  try{
   const r=await fetch('/api/research?'+urlParams(),{signal:controller.signal});if(!r.ok)throw Error();const data=await r.json();if(disposed||runId!==sequence)return;
   page=data.page||page;setUrl(false);
   count.textContent=fmt(data.total)+' results'+(data.relatedTotal?' · '+fmt(data.relatedTotal)+' related':'');
   document.getElementById('research-interpretation').innerHTML=interpretationHtml(data,q);
   let relatedHeading=false;
   results.innerHTML=data.results.length?data.results.map(r=>{let heading='';if(!relatedHeading&&['meaning','similar-wording'].includes(r.match_type)){relatedHeading=true;heading='<h2 class="research-related-heading">Related results</h2>';}return heading+researchCard(r,sourceIds);}).join(''):'<div class="empty-state"><h2>No matching records yet</h2><p>Try a broader topic or remove a selected topic or source.</p><button class="button" type="button" data-clear-research>Clear search</button></div>';
   const pages=Math.ceil(data.total/20);document.getElementById('research-pagination').innerHTML=(page>1?'<button class="button button-outline" data-research-page="'+(page-1)+'">Previous</button>':'')+(pages?'<span>Page '+page+' of '+pages+'</span>':'')+(page<pages?'<button class="button button-outline" data-research-page="'+(page+1)+'">Next</button>':'');
   const related=data.interpretation?.related||[];document.getElementById('research-related-topics').innerHTML=related.length?'<h2>Explore related topics</h2><div class="research-chips">'+related.map(t=>`<button type="button" data-topic-query="${escape(t.label)}">${escape(t.label)}</button>`).join('')+'</div>':'';
   const matched=searchSources?searchSources(sources,{query:[q,...tags].join(' '),exact:exact.checked?'1':''}).slice(0,4):[];
   document.getElementById('research-source-matches').innerHTML=(q||tags.length)&&matched.length?'<h2>Related sources</h2>'+matched.map(s=>`<p><a href="/source/${escape(s.id)}">${escape(s.name)}</a></p>`).join(''):'';
  }catch(e){if(e.name==='AbortError'||disposed||runId!==sequence)return;count.textContent='Search unavailable';results.innerHTML='<div class="empty-state"><p>The catalogue could not be reached. Please try again.</p><button class="button" data-retry-research>Try again</button></div>';}
  finally{if(!disposed&&runId===sequence)results.setAttribute('aria-busy','false');}
 }
 const submit=e=>{e.preventDefault();page=1;run({push:true});};
 const change=()=>{page=1;run({push:true});};
 const typing=()=>{clearTimeout(timer);showSuggestions(topicSuggestions(input.value));timer=setTimeout(suggest,220);};
 const keyboard=e=>{if(e.key==='ArrowDown'){const first=suggestions.querySelector('button');if(first){e.preventDefault();first.focus();}}else if(e.key==='Escape')suggestions.innerHTML='';};
 const click=e=>{
  const b=e.target.closest('button');if(!b)return;const add=b.dataset.suggestTag||b.dataset.resultTag;
  if(add){if(!tags.some(t=>t.toLowerCase()===add.toLowerCase())&&tags.length<10)tags.push(add);if(b.dataset.suggestTag)input.value=queryAfterTopicSuggestion(input.value);page=1;run({push:true});suggest();input.focus();}
  else if(b.dataset.removeTag){tags=tags.filter(t=>t!==b.dataset.removeTag);page=1;run({push:true});suggest();input.focus();}
  else if(b.dataset.topicQuery){input.value=b.dataset.topicQuery;tags=[];exact.checked=false;page=1;run({push:true});suggest();input.focus();}
  else if(b.dataset.researchPage){page=+b.dataset.researchPage;run({push:true});document.querySelector('.research-toolbar').scrollIntoView({block:'start'});}
  else if(b.hasAttribute('data-clear-research')){tags=[];input.value='';source.value='';exact.checked=false;page=1;run({push:true});suggest();input.focus();}
  else if(b.hasAttribute('data-use-exact')){exact.checked=true;page=1;run({push:true});}
  else if(b.hasAttribute('data-retry-research'))run();
 };
 const popstate=()=>{const p=new URLSearchParams(location.search);input.value=p.get('q')||'';tags=[...new Set(p.getAll('tag'))].slice(0,10);source.value=p.get('source')||'';exact.checked=p.get('exact')==='1';page=Math.max(1,parseInt(p.get('page'),10)||1);run();suggest();};
 form.addEventListener('submit',submit);source.addEventListener('change',change);exact.addEventListener('change',change);input.addEventListener('input',typing);input.addEventListener('keydown',keyboard);main.addEventListener('click',click);window.addEventListener('popstate',popstate);chips();suggest();run();
 return ()=>{disposed=true;sequence++;suggestSequence++;controller?.abort();tagController?.abort();clearTimeout(timer);form.removeEventListener('submit',submit);source.removeEventListener('change',change);exact.removeEventListener('change',change);input.removeEventListener('input',typing);input.removeEventListener('keydown',keyboard);main.removeEventListener('click',click);window.removeEventListener('popstate',popstate);};
}
export async function refreshResearchTotal(){try{const r=await fetch('/api/research/stats');if(!r.ok)return;const data=await r.json();for(const el of document.querySelectorAll('[data-research-total]'))el.textContent=fmt(data.total);}catch{}}
