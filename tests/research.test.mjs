import test from 'node:test';
import assert from 'node:assert/strict';
import {handleResearch} from '../backend/research.mjs';
import {researchPage,researchForm,bindResearch,searchUrlParams,queryAfterTopicSuggestion} from '../public/research.js';

test('research endpoint enforces read-only and bounded searches before upstream access',async()=>{
 assert.equal((await handleResearch(new Request('https://www.id-ebp.org/api/research',{method:'POST'}))).status,405);
 assert.equal((await handleResearch(new Request('https://www.id-ebp.org/api/research?q='+'x'.repeat(301)))).status,400);
 assert.equal((await handleResearch(new Request('https://www.id-ebp.org/api/research?'+Array(11).fill('tag=x').join('&')))).status,400);
});
test('research RPC forwards exact tags and query as data, clamps page and preserves security headers',async()=>{
 const original=global.fetch;let call;
 global.fetch=async(url,options)=>{call={url,options};return Response.json({results:[],total:0,catalogueTotal:17080});};
 try{
 const response=await handleResearch(new Request('https://www.id-ebp.org/api/research?q=police&tag=hot+spots&tag=prevention&page=-4'),{'X-Frame-Options':'DENY'});
 assert.equal(response.status,200);assert.equal(response.headers.get('X-Frame-Options'),'DENY');
 assert.match(call.url,/\/rpc\/search_research_v2$/);
 const body=JSON.parse(call.options.body);
 assert.equal(body.q,'police');assert.deepEqual(body.selected_tags,['hot spots','prevention']);assert.equal(body.page_number,1);assert.equal(body.source_filter,'');assert.equal(body.exact_match,false);assert.deepEqual(body.search_plan.tagGroups,[['hot-spots'],[]]);
 }finally{global.fetch=original;}
});
test('catalogue failures are explicit, never empty-success results',async()=>{
 const original=global.fetch;global.fetch=async()=>new Response('bad',{status:500});
 try{assert.equal((await handleResearch(new Request('https://www.id-ebp.org/api/research'))).status,503);}finally{global.fetch=original;}
});
test('research form escapes catalogue inputs and retains no-sign-in search action',()=>{
 const html=researchForm('\"><img src=x onerror=alert(1)>');
 assert.ok(!html.includes('<img'));assert.match(html,/action="\/research"/);
 assert.match(researchPage(new URLSearchParams(),[]),/Independent appraisal/);
});

test('homepage search submits the complete selection through JavaScript under the form-action CSP',()=>{
 const oldDocument=global.document,oldWindow=global.window;let target,prevented=false;
 const element=(extra={})=>({listeners:{},value:'',innerHTML:'',textContent:'',addEventListener(type,fn){this.listeners[type]=fn;},removeEventListener(type,fn){if(this.listeners[type]===fn)delete this.listeners[type];},setAttribute(){},removeAttribute(){},setCustomValidity(){},...extra});
 const input=element({value:'  body worn cameras  '}),exact=element({checked:false});
 const scopeInputs=['both','research','sources'].map(value=>element({value,checked:value==='research'}));
 const controls=Object.fromEntries(['source','yearFrom','yearTo','sourceType','sourceCountry','sourceLanguage'].map(name=>[name,element()]));
 controls.yearFrom.value='2020';controls.source.value='sebp';
 const form=element({reportValidity:()=>true,querySelector(selector){if(selector==='input[name="q"]')return input;const name=selector.match(/name="([^"]+)"/)?.[1];return controls[name];},querySelectorAll:selector=>selector==='input[name="scope"]'?scopeInputs:[]});
 const nodes={'research-form':form,'research-exact':exact,'research-suggestions':element(),'research-selected':element(),'research-filter-count':element()};
 global.document={...element(),getElementById:id=>nodes[id]||null};global.window={...element(),location:{assign:url=>{target=url;}}};
 try{
  const dispose=bindResearch({params:new URLSearchParams('tag=policing')});
  form.listeners.submit({preventDefault:()=>{prevented=true;}});
  assert.equal(prevented,true);
  const url=new URL(target,'https://www.id-ebp.org');
  assert.equal(url.pathname,'/research');assert.equal(url.searchParams.get('q'),'body worn cameras');assert.equal(url.searchParams.get('scope'),'research');
  assert.deepEqual(url.searchParams.getAll('tag'),['policing']);assert.equal(url.searchParams.get('yearFrom'),'2020');assert.equal(url.searchParams.get('source'),'sebp');
  dispose();assert.deepEqual(form.listeners,{});assert.deepEqual(input.listeners,{});
 }finally{global.document=oldDocument;global.window=oldWindow;}
});

test('switching collections never carries irrelevant filters into requests or shared links',()=>{
 const filters={source:'sebp',yearFrom:'2020',sourceType:'University',sourceCountry:'United Kingdom',sourceLanguage:'English'};
 const source=searchUrlParams({scope:'sources',query:'DA',filters,page:2,exact:true});
 assert.equal(source.has('source'),false);assert.equal(source.has('yearFrom'),false);
 assert.equal(source.get('sourceCountry'),'United Kingdom');assert.equal(source.get('exact'),'1');assert.equal(source.get('page'),'2');
 const both=searchUrlParams({scope:'both',filters});
 assert.equal(both.get('source'),'sebp');assert.equal(both.get('yearFrom'),'2020');assert.equal(both.has('sourceCountry'),false);
});

test('selecting a dynamically suggested keyword replaces its incomplete prefix',()=>{
 assert.equal(queryAfterTopicSuggestion('resil','resilience'),'');
 assert.equal(queryAfterTopicSuggestion('burglary in London','Burglary'),'burglary in London');
});


test('opening advanced search protects its state from background updates before the native toggle',()=>{
 const previousDocument=global.document,previousWindow=global.window,events=[];
 const element=(extra={})=>({listeners:{},value:'',innerHTML:'',textContent:'',addEventListener(type,fn){this.listeners[type]=fn;},removeEventListener(type,fn){if(this.listeners[type]===fn)delete this.listeners[type];},setAttribute(){},removeAttribute(){},...extra});
 const summary=element(),advanced=element({open:false,querySelector:()=>summary}),input=element(),exact=element({checked:false});
 const scopes=['both','research','sources'].map(value=>element({value,checked:value==='both'}));
 const controls=Object.fromEntries(['source','yearFrom','yearTo','sourceType','sourceCountry','sourceLanguage'].map(name=>[name,element()]));
 const form=element({dispatchEvent:event=>events.push(event),querySelector(selector){if(selector==='.research-advanced')return advanced;if(selector==='input[name="q"]')return input;return controls[selector.match(/name="([^"]+)"/)?.[1]];},querySelectorAll:selector=>selector==='input[name="scope"]'?scopes:[]});
 const helper=element({textContent:'Type your own words or choose a suggested topic.'});
 const nodes={'research-form':form,'research-exact':exact,'research-suggestions':element(),'research-selected':element(),'research-filter-count':element(),'research-help':helper};
 global.document={...element(),getElementById:id=>nodes[id]||null};global.window=element();
 try{
  const dispose=bindResearch({params:new URLSearchParams()});
  assert.equal(events.length,0,'initial render must not mark an untouched form dirty');
  summary.listeners.click();
  assert.equal(events.length,1);assert.equal(events[0].type,'input');assert.equal(events[0].bubbles,true);
  assert.equal(advanced.open,false,'preservation signal runs before the native disclosure toggle');
  assert.equal(helper.textContent,'Type your own words or choose a suggested topic.');
  assert.equal(input.value,'');
  dispose();assert.equal(summary.listeners.click,undefined);
 }finally{global.document=previousDocument;global.window=previousWindow;}
});
