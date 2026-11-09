import {topicSuggestions,planSearch,normaliseSearch} from './search-topics.js';

const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('en-GB');
const scopeValue=value=>['research','sources'].includes(value)?value:'both';
const unique=values=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
function href(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?escape(u.href):'#';}catch{return '#';}}
function options(values,current){return values.map(value=>`<option value="${escape(value)}"${value===current?' selected':''}>${escape(value)}</option>`).join('');}

export function researchForm(query='',home=false,params=new URLSearchParams(),sources=[]){
 const scope=scopeValue(params.get('scope'));
 const advanced=['source','yearFrom','yearTo','sourceType','sourceCountry','sourceLanguage','exact'].some(key=>params.get(key));
 return `<form class="research-form ${home?'research-form-home':''}" id="research-form" action="/research" method="get" role="search" aria-label="Search the directory and research catalogue">
  <fieldset class="search-scope"><legend>Search for</legend>${[['both','Both'],['research','Research'],['sources','Sources']].map(([value,label])=>`<label><input type="radio" name="scope" value="${value}"${scope===value?' checked':''}><span>${label}</span></label>`).join('')}</fieldset>
  <label class="research-query-label" for="research-query">Topic or keyword</label>
  <div class="research-query-wrap"><div class="research-input-row"><span aria-hidden="true">⌕</span><input type="search" id="research-query" name="q" value="${escape(query)}" placeholder="Try burglary or domestic abuse" maxlength="300" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="research-suggestions" aria-describedby="research-help"><button class="button" type="submit">Search</button></div><div id="research-suggestions" class="research-suggestions" role="listbox" aria-label="Suggested topics" hidden></div></div>
  <div id="research-selected" class="research-chips research-selected" aria-label="Selected search topics"></div>
  <div class="research-form-footer"><p class="research-help" id="research-help">Type your own words or choose a suggested topic.</p>
  <details class="research-advanced"${advanced?' open':''}><summary>Advanced search<span id="research-filter-count"></span></summary><div class="research-advanced-content">
   <fieldset class="research-filter-section" data-filter-scope="research"><legend>Research filters</legend><div class="research-advanced-grid">
    <label>Source<select id="research-source" name="source"><option value="">All sources</option>${sources.filter(s=>s.status!=='hidden').slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<option value="${escape(s.id)}"${params.get('source')===s.id?' selected':''}>${escape(s.name)}</option>`).join('')}${params.get('source')&&!sources.some(s=>s.status!=='hidden'&&s.id===params.get('source'))?`<option value="${escape(params.get('source'))}" selected>${escape(sources.find(s=>s.id===params.get('source'))?.name||params.get('source'))}</option>`:''}</select></label>
    <label>Published from<input id="research-year-from" name="yearFrom" type="number" inputmode="numeric" min="1000" max="2100" step="1" placeholder="Any year" value="${escape(params.get('yearFrom')||'')}"></label>
    <label>Published to<input id="research-year-to" name="yearTo" type="number" inputmode="numeric" min="1000" max="2100" step="1" placeholder="Any year" value="${escape(params.get('yearTo')||'')}"></label>
   </div><p class="research-filter-note">These filters apply to research records. Year filters exclude records without a recorded publication year.</p><p id="research-filter-status" class="research-filter-note" role="status"></p></fieldset>
   <fieldset class="research-filter-section" data-filter-scope="sources"><legend>Source filters</legend><div class="research-advanced-grid">
    <label>Source type<select id="research-source-type" name="sourceType"><option value="">All source types</option>${options(unique(sources.flatMap(s=>s.types||[])),params.get('sourceType'))}</select></label>
    <label>Based in<select id="research-source-country" name="sourceCountry"><option value="">All countries</option>${options(unique(sources.map(s=>s.country)),params.get('sourceCountry'))}</select></label>
    <label>Source language<select id="research-source-language" name="sourceLanguage"><option value="">All languages</option>${options(unique(sources.flatMap(s=>s.languages||[])),params.get('sourceLanguage'))}</select></label>
   </div><p class="research-filter-note">These filters describe the source, not the location or language of every study it publishes.</p></fieldset>
   <label class="research-exact-label"><input type="checkbox" id="research-exact" name="exact" value="1"${params.get('exact')==='1'?' checked':''}> Match only my words (no related terms)</label>
   <div class="research-advanced-actions"><button class="button button-small" type="submit">Apply filters</button><button type="button" class="research-clear" data-reset-filters>Reset filters</button></div>
  </div></details></div>
 </form>`;
}

export function researchPage(params,sources=[]){return `<section class="container research-head"><p class="eyebrow">THE ID-EBP DIRECTORY &amp; CATALOGUE</p><h1>Find policing research and sources</h1><p class="research-intro">Search studies and resources, the organisations behind them, or both.</p>${researchForm(params.get('q')||'',false,params,sources)}<div id="research-interpretation" class="research-interpretation" aria-live="polite"></div></section>
 <section class="container research-layout"><div><div class="research-toolbar"><p id="research-count" role="status">Preparing your search…</p><button type="button" class="research-clear" data-clear-research>Clear search</button></div>
 <section id="search-source-results" class="search-source-results" aria-label="Source results"></section><section id="search-research-section" aria-label="Research results"><div class="search-section-heading"><h2>Research</h2><p id="research-record-count" role="status"></p></div><div id="research-results" aria-busy="true"></div></section><nav id="research-pagination" class="pagination" aria-label="Result pages"></nav></div>
 <aside class="research-aside"><div id="research-related-topics"></div><details><summary>About these results</summary><p><strong>Research</strong> includes studies, evidence reviews, practical resources and collection pages. <strong>Sources</strong> are organisations, publications and people that share them.</p><p>Search matches indicate relevance, not research quality. Independent appraisal and some publication, tagging and full-text checks are still pending.</p><p>Search topics may be identified automatically from the available catalogue text. Access information describes what was recorded during cataloguing; check the original website for current availability.</p><p>Related results use the meaning of available titles and descriptions. Records with limited descriptions may be harder to find.</p></details><a class="text-link" href="/directory">Browse all sources →</a></aside></section>`;}

function usefulSummary(text){return text&&!/Stage \d+ inventory record|Item.level review has not yet been performed|Login or Register for Access|Hit enter to search or ESC to close|^Publisher-listed resource\. Metadata recorded for discovery; independent evidence appraisal pending\.$|^Public repository metadata entry\. Eligibility and the underlying publication have not been verified\.$|^Resource identified in the official source listing\. Content and evidence have not yet been independently appraised\.$/i.test(text.trim());}
export function researchCard(r,sourceIds){return `<article class="research-result"><p class="research-origin"><span class="result-kind-badge result-kind-badge--research">Research</span> ${escape(r.source)} <span>· ${escape(r.kind||'Resource')}</span></p><h2><a href="${href(r.url)}" target="_blank" rel="noopener noreferrer">${escape(r.title)} <span aria-hidden="true">↗</span></a></h2>${r.authors||r.publication?`<p class="research-byline">${escape(r.authors||'Author not yet recorded')}${r.publication?' · '+escape(r.publication):''}</p>`:''}${usefulSummary(r.summary)?`<p class="research-summary">${escape(r.summary)}</p>`:''}${r.match_type==='meaning'?'<p class="research-match-note">Related by meaning</p>':r.match_type==='similar-wording'?'<p class="research-match-note">Similar wording</p>':''}<div class="research-chips">${(r.tags||[]).slice(0,5).map(t=>`<button type="button" data-result-tag="${escape(t)}">${escape(t)}</button>`).join('')}</div><details><summary>Access and catalogue details</summary><p>${escape(r.access||'Full-text access not yet checked.')}</p><p>${escape(r.status)}</p>${r.search_topics?.length?`<p>Search topics identified from this record: ${escape(r.search_topics.join(', '))}.</p>`:''}<p>Record: ${escape(r.id)}${r.checked?' · Checked '+escape(r.checked):''}</p>${sourceIds.has(r.source_slug)?`<a href="/source/${encodeURIComponent(r.source_slug)}">View source profile →</a>`:''}</details></article>`;}
export function sourceSearchCard(source){return `<article class="research-result source-search-result"><p class="research-origin"><span class="result-kind-badge result-kind-badge--source">Source</span> ${escape(source.country)} <span>· ${escape((source.types||[]).join(', '))}</span></p><h2><a href="/source/${encodeURIComponent(source.id)}">${escape(source.name)} <span aria-hidden="true">→</span></a></h2>${source.about?`<p class="research-summary">${escape(source.about)}</p>`:''}<p class="research-byline">${escape(source.owner||'')}${source.languages?.length?' · '+escape(source.languages.join(', ')):''}</p></article>`;}
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
export function queryAfterTopicSuggestion(query,selectedTag=''){const plan=planSearch(query);if(plan.exact)return query;if(plan.topics.length)return plan.intents.length||plan.terms.length?query:'';if(selectedTag&&normaliseSearch(selectedTag).startsWith(normaliseSearch(query)))return '';return topicSuggestions(query).length?'':query;}

// Keep collection-specific filters out of other searches and out of copied URLs.
export function searchUrlParams({query='',tags=[],scope='both',page=1,exact=false,filters={}}={}){
 const p=new URLSearchParams();if(query.trim())p.set('q',query.trim());
 [...new Set(tags)].slice(0,10).forEach(tag=>p.append('tag',tag));
 const collection=scopeValue(scope);p.set('scope',collection);
 if(exact)p.set('exact','1');
 const keys=collection==='sources'?['sourceType','sourceCountry','sourceLanguage']:['source','yearFrom','yearTo'];
 for(const key of keys)if(filters[key])p.set(key,filters[key]);
 if(page>1)p.set('page',String(page));return p;
}

export function bindResearch({params,sources=[],searchSources}){
 const form=document.getElementById('research-form');if(!form)return ()=>{};
 const input=form.querySelector('input[name="q"]'),results=document.getElementById('research-results'),home=!results;
 const suggestions=document.getElementById('research-suggestions'),selected=document.getElementById('research-selected'),exact=document.getElementById('research-exact');
 const advanced=form.querySelector('.research-advanced'),advancedSummary=advanced?.querySelector('summary');
 const scopeInputs=[...form.querySelectorAll('input[name="scope"]')],main=document.getElementById('main')||form;
 const controls=Object.fromEntries(['source','yearFrom','yearTo','sourceType','sourceCountry','sourceLanguage'].map(name=>[name,form.querySelector(`[name="${name}"]`)]));
 let tags=[...new Set(params.getAll('tag'))].slice(0,10),page=Math.max(1,parseInt(params.get('page'),10)||1),controller,tagController,filterController;
 let timer,requestTimer,slowTimer,disposed=false,sequence=0,suggestSequence=0,activeSuggestion=-1,visibleSuggestions=[],filtersLoaded=false;
 const scope=()=>scopeValue(scopeInputs.find(control=>control.checked)?.value);
 const filterValues=()=>Object.fromEntries(Object.entries(controls).map(([key,control])=>[key,control?.value||'']));
 const urlParams=()=>searchUrlParams({query:input.value,tags,scope:scope(),page,exact:exact.checked,filters:filterValues()});
 const sourceIds=new Set(sources.map(source=>source.id));
 // Opening a disclosure is interface state worth preserving across background updates,
 // but it does not change the submitted search or its helper text.
 const markInterfaceDirty=()=>form.dispatchEvent(new Event('input',{bubbles:true}));
 const markDirty=()=>{if(!home)document.getElementById('research-help').textContent='Press Search to apply your changes.';markInterfaceDirty();};
 function updateScope(){
  const collection=scope();
  for(const section of form.querySelectorAll('[data-filter-scope]')){
   const active=section.dataset.filterScope==='sources'?collection==='sources':collection!=='sources';
   section.hidden=!active;section.disabled=!active;
  }
  const count=[...urlParams()].filter(([key])=>['source','yearFrom','yearTo','sourceType','sourceCountry','sourceLanguage','exact'].includes(key)).length;
  document.getElementById('research-filter-count').textContent=count?` (${count})`:'';
 }
 function chips(){selected.innerHTML=tags.map(tag=>`<button type="button" class="selected" data-remove-tag="${escape(tag)}" aria-label="Remove topic: ${escape(tag)}">${escape(tag)} ×</button>`).join('')+(tags.length>1?'<span class="research-tag-help">All selected topics must match.</span>':'');}
 function closeSuggestions(){suggestions.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');activeSuggestion=-1;}
 function dismissSuggestions(){clearTimeout(timer);tagController?.abort();suggestSequence++;closeSuggestions();}
 function highlightSuggestion(){
  for(const [index,option] of [...suggestions.querySelectorAll('[role="option"]')].entries())option.setAttribute('aria-selected',String(index===activeSuggestion));
  if(activeSuggestion>=0)input.setAttribute('aria-activedescendant',`research-suggestion-${activeSuggestion}`);else input.removeAttribute('aria-activedescendant');
 }
 function showSuggestions(list){
  const activeTag=visibleSuggestions[activeSuggestion]?.tag;
  visibleSuggestions=list.filter(item=>item?.tag&&!tags.some(tag=>tag.toLowerCase()===item.tag.toLowerCase())).slice(0,7);
  if(!input.value.trim()||document.activeElement!==input||!visibleSuggestions.length){closeSuggestions();return;}
  activeSuggestion=visibleSuggestions.findIndex(item=>item.tag===activeTag);
  suggestions.innerHTML=visibleSuggestions.map((item,index)=>`<button type="button" tabindex="-1" id="research-suggestion-${index}" class="research-suggestion" role="option" aria-selected="false" data-suggest-tag="${escape(item.tag)}"><span>${escape(item.tag)}</span><span aria-hidden="true">＋</span></button>`).join('');
  suggestions.hidden=false;input.setAttribute('aria-expanded','true');highlightSuggestion();
 }
 async function suggest(){
  const runId=++suggestSequence;tagController?.abort();tagController=new AbortController();
  if(!input.value.trim()){closeSuggestions();return;}
  const local=topicSuggestions(input.value.trim());showSuggestions(local);
  const timeout=setTimeout(()=>tagController?.abort(),6000);
  try{
   const response=await fetch('/api/research/tags?'+new URLSearchParams({q:input.value.trim()}),{signal:tagController.signal});
   if(!response.ok)return;const data=await response.json();
   if(!disposed&&runId===suggestSequence&&Array.isArray(data)){
    const seen=new Set(),merged=[...local,...data].filter(item=>{const key=item.tag?.toLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true;});showSuggestions(merged);
   }
  }catch{/* Curated local suggestions remain available when the network fails. */}finally{clearTimeout(timeout);}
 }
 async function loadFilters(){
  if(filtersLoaded||disposed)return;filtersLoaded=true;filterController=new AbortController();
  const status=document.getElementById('research-filter-status');status.textContent='Loading catalogue sources…';
  const currentController=filterController,timeout=setTimeout(()=>currentController.abort(),8000);
  try{
   const response=await fetch('/api/research/filters',{signal:currentController.signal});if(!response.ok)throw Error();const data=await response.json();if(disposed)return;
   if(!Array.isArray(data.sources))throw Error();
   const current=controls.source.value,listed=data.sources.filter(item=>item.id&&item.name).sort((a,b)=>a.name.localeCompare(b.name));
   if(current&&!listed.some(item=>item.id===current))listed.push({id:current,name:controls.source.selectedOptions?.[0]?.textContent||current});
   controls.source.innerHTML='<option value="">All sources</option>'+listed.map(item=>`<option value="${escape(item.id)}"${item.id===current?' selected':''}>${escape(item.name)}</option>`).join('');
   status.textContent='';
  }catch{if(!disposed){status.textContent='The full catalogue source list could not be loaded. You can still search by topic or year.';filtersLoaded=false;}}finally{clearTimeout(timeout);}
 }
 function setUrl(push,p=urlParams()){const url='/research?'+p;if(push&&url!==location.pathname+location.search)history.pushState(null,'',url);else history.replaceState(null,'',url);}
 function validateYears(){const from=controls.yearFrom,to=controls.yearTo;to.setCustomValidity(from.value&&to.value&&Number(from.value)>Number(to.value)?'Enter an end year that is the same as or later than the start year.':'');return form.reportValidity();}
 function pagination(total,collection){const pages=Math.ceil(total/20);document.getElementById('research-pagination').innerHTML=(page>1?`<button type="button" class="button button-outline" data-research-page="${page-1}">Previous</button>`:'')+(pages?`<span>${collection==='sources'?'Sources':'Research'} · page ${page} of ${pages}</span>`:'')+(page<pages?`<button type="button" class="button button-outline" data-research-page="${page+1}">Next</button>`:'');}
 function sourceMatches(){
  if(!searchSources)return [];
  const filters=filterValues();
  return searchSources(sources,{query:[input.value.trim(),...tags].join(' '),exact:exact.checked?'1':'',...(scope()==='sources'?{type:filters.sourceType,based:filters.sourceCountry,language:filters.sourceLanguage}:{})});
 }
 function renderSources(matches){
  const collection=scope(),host=document.getElementById('search-source-results');host.hidden=collection==='research';
  if(collection==='research'){host.innerHTML='';return;}
  const shown=collection==='sources'?matches.slice((page-1)*20,page*20):matches.slice(0,3);
  host.innerHTML=`<div class="search-section-heading"><h2>Sources</h2><p>${fmt(matches.length)} ${matches.length===1?'source':'sources'}</p></div>`+
   (shown.length?shown.map(sourceSearchCard).join(''):'<div class="empty-state"><h3>No matching sources</h3><p>Try a broader topic or remove a source filter.</p></div>')+
   (collection==='both'&&matches.length>3?`<button type="button" class="text-link search-view-sources" data-show-sources>View all ${fmt(matches.length)} sources →</button>`:'');
 }
 async function run({push=false}={}){
  if(home)return;updateScope();if(!validateYears())return;
  const runId=++sequence;controller?.abort();clearTimeout(requestTimer);clearTimeout(slowTimer);controller=new AbortController();
  dismissSuggestions();chips();updateScope();
  const requestParams=urlParams(),query=input.value.trim();setUrl(push,requestParams);
  document.getElementById('research-help').textContent='Type your own words or choose a suggested topic.';
  const collection=scope(),count=document.getElementById('research-count'),recordCount=document.getElementById('research-record-count');
  const matched=sourceMatches();if(collection==='sources')page=Math.min(page,Math.max(1,Math.ceil(matched.length/20)));
  renderSources(matched);document.getElementById('search-research-section').hidden=collection==='sources';
  document.getElementById('research-pagination').innerHTML='';document.getElementById('research-related-topics').innerHTML='';document.getElementById('research-interpretation').innerHTML='';
  if(collection==='sources'){
   if(page>1)requestParams.set('page',String(page));else requestParams.delete('page');
   setUrl(false,requestParams);results.setAttribute('aria-busy','false');count.textContent=`${fmt(matched.length)} ${matched.length===1?'source':'sources'} found`;pagination(matched.length,'sources');return;
  }
  results.setAttribute('aria-busy','true');results.innerHTML='<div class="research-loading" role="status">Searching the research catalogue…</div>';
  count.textContent=collection==='both'?`${fmt(matched.length)} sources · searching research…`:'Searching research…';recordCount.textContent='';
  let timedOut=false;
  requestTimer=setTimeout(()=>{timedOut=true;controller.abort();},18000);
  slowTimer=setTimeout(()=>{if(!disposed&&runId===sequence)results.innerHTML='<div class="research-loading" role="status">The research search is taking longer than usual. Please wait…</div>';},6000);
  try{
   const response=await fetch('/api/research?'+requestParams,{signal:controller.signal});if(!response.ok)throw Error();
   const data=await response.json();if(!Array.isArray(data.results)||!Number.isFinite(Number(data.total)))throw Error();if(disposed||runId!==sequence)return;
   page=data.page||page;if(page>1)requestParams.set('page',String(page));else requestParams.delete('page');setUrl(false,requestParams);
   count.textContent=collection==='both'?`${fmt(data.total)} research records · ${fmt(matched.length)} sources`:`${fmt(data.total)} research records`;
   recordCount.textContent=fmt(data.total)+' records'+(data.relatedTotal?' · '+fmt(data.relatedTotal)+' related':'');
   document.getElementById('research-interpretation').innerHTML=interpretationHtml(data,query);
   let relatedHeading=false;
   results.innerHTML=data.results.length?data.results.map(record=>{let heading='';if(!relatedHeading&&['meaning','similar-wording'].includes(record.match_type)){relatedHeading=true;heading='<h2 class="research-related-heading">Related research</h2>';}return heading+researchCard(record,sourceIds);}).join(''):'<div class="empty-state"><h3>No matching research records</h3><p>Try a broader topic or remove a selected topic or advanced filter.</p><button class="button button-outline" type="button" data-clear-research>Clear search</button></div>';
   pagination(data.total,'research');
   const related=data.interpretation?.related||[];document.getElementById('research-related-topics').innerHTML=related.length?'<h2>Explore related topics</h2><div class="research-chips">'+related.map(topic=>`<button type="button" data-topic-query="${escape(topic.label)}">${escape(topic.label)}</button>`).join('')+'</div>':'';
  }catch(error){
   if(disposed||runId!==sequence||error.name==='AbortError'&&!timedOut)return;
   count.textContent=collection==='both'?`${fmt(matched.length)} sources · research search unavailable`:'Research search unavailable';
   recordCount.textContent='Unavailable';results.innerHTML=`<div class="empty-state research-error"><h3>Research ${timedOut?'search timed out':'could not be loaded'}</h3><p>This is a connection problem, not a finding of no results. Please try again.${collection==='both'?' Source results are available above.':''}</p><button type="button" class="button" data-retry-research>Try again</button></div>`;
  }finally{if(!disposed&&runId===sequence){clearTimeout(requestTimer);clearTimeout(slowTimer);results.setAttribute('aria-busy','false');}}
 }
 function submit(event){event.preventDefault();dismissSuggestions();if(!validateYears())return;page=1;if(home)window.location.assign('/research?'+urlParams());else run({push:true});}
 function chooseTopic(tag,{replaceQuery=true}={}){if(!tags.some(value=>value.toLowerCase()===tag.toLowerCase())&&tags.length<10)tags.push(tag);if(replaceQuery)input.value=queryAfterTopicSuggestion(input.value,tag);chips();markDirty();input.focus();dismissSuggestions();}
 function typing(){if(!home)document.getElementById('research-help').textContent='Press Search to apply your changes.';clearTimeout(timer);tagController?.abort();suggestSequence++;showSuggestions(topicSuggestions(input.value));timer=setTimeout(suggest,220);}
 function keyboard(event){
  if(event.key==='Escape'){dismissSuggestions();return;}
  if(['ArrowDown','ArrowUp'].includes(event.key)){
   if(suggestions.hidden)showSuggestions(topicSuggestions(input.value));if(suggestions.hidden)return;
   event.preventDefault();activeSuggestion=activeSuggestion<0?(event.key==='ArrowDown'?0:visibleSuggestions.length-1):(activeSuggestion+(event.key==='ArrowDown'?1:-1)+visibleSuggestions.length)%visibleSuggestions.length;highlightSuggestion();
  }else if(event.key==='Enter'&&!suggestions.hidden&&activeSuggestion>=0){event.preventDefault();chooseTopic(visibleSuggestions[activeSuggestion].tag);}
  else if(event.key==='Tab')dismissSuggestions();
 }
 function resetFilters(){for(const control of Object.values(controls))control.value='';exact.checked=false;controls.yearTo.setCustomValidity('');updateScope();markDirty();}
 function click(event){
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.suggestTag){chooseTopic(button.dataset.suggestTag);return;}
  if(button.dataset.resultTag){chooseTopic(button.dataset.resultTag,{replaceQuery:false});page=1;run({push:true});}
  else if(button.dataset.removeTag){tags=tags.filter(tag=>tag!==button.dataset.removeTag);chips();markDirty();input.focus();}
  else if(button.dataset.topicQuery){input.value=button.dataset.topicQuery;tags=[];exact.checked=false;page=1;run({push:true});input.focus();}
  else if(button.dataset.researchPage){page=+button.dataset.researchPage;run({push:true});document.querySelector('.research-toolbar').scrollIntoView({block:'start'});}
  else if(button.hasAttribute('data-show-sources')){scopeInputs.find(control=>control.value==='sources').checked=true;page=1;run({push:true});document.querySelector('.research-toolbar').scrollIntoView({block:'start'});}
  else if(button.hasAttribute('data-clear-research')){tags=[];input.value='';resetFilters();page=1;run({push:true});chips();input.focus();}
  else if(button.hasAttribute('data-reset-filters')){resetFilters();}
  else if(button.hasAttribute('data-use-exact')){exact.checked=true;page=1;run({push:true});}
  else if(button.hasAttribute('data-retry-research'))run();
 }
 function change(event){updateScope();markDirty();if(event.target.name==='scope'){page=1;if(!home)run({push:true});}}
 function outside(event){if(!form.querySelector('.research-query-wrap').contains(event.target))dismissSuggestions();}
 function toggle(){if(advanced?.open)loadFilters();}
 function popstate(){
  // The host owns page navigation; only restore states for this results page.
  if(location.pathname!=='/research')return;
  const next=new URLSearchParams(location.search);input.value=next.get('q')||'';tags=[...new Set(next.getAll('tag'))].slice(0,10);
  scopeInputs.forEach(control=>{control.checked=control.value===scopeValue(next.get('scope'));});exact.checked=next.get('exact')==='1';
  for(const [name,control] of Object.entries(controls)){
   control.value=next.get(name)||'';
  }
  page=Math.max(1,parseInt(next.get('page'),10)||1);run();
 }
 form.addEventListener('submit',submit);form.addEventListener('change',change);input.addEventListener('input',typing);input.addEventListener('keydown',keyboard);input.addEventListener('focus',suggest);
 main.addEventListener('click',click);document.addEventListener('click',outside);advanced?.addEventListener('toggle',toggle);advancedSummary?.addEventListener('click',markInterfaceDirty);if(!home)window.addEventListener('popstate',popstate);
 chips();updateScope();if(advanced?.open)loadFilters();if(!home)run();
 return ()=>{disposed=true;sequence++;suggestSequence++;controller?.abort();tagController?.abort();filterController?.abort();clearTimeout(timer);clearTimeout(requestTimer);clearTimeout(slowTimer);form.removeEventListener('submit',submit);form.removeEventListener('change',change);input.removeEventListener('input',typing);input.removeEventListener('keydown',keyboard);input.removeEventListener('focus',suggest);main.removeEventListener('click',click);document.removeEventListener('click',outside);advanced?.removeEventListener('toggle',toggle);advancedSummary?.removeEventListener('click',markInterfaceDirty);window.removeEventListener('popstate',popstate);};
}
export async function refreshResearchTotal(){try{const response=await fetch('/api/research/stats');if(!response.ok)return;const data=await response.json();for(const element of document.querySelectorAll('[data-research-total]'))element.textContent=fmt(data.total);}catch{}}
