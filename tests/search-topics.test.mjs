import test from 'node:test';
import assert from 'node:assert/strict';
import {planSearch,topicSuggestions,SEARCH_TOPICS} from '../public/search-topics.js';
import {searchSources} from '../public/ranking.js';
import {researchSearchBody,handleResearch,runResearchIndex,authorisedResearchIndex} from '../backend/research.mjs';
import {handleResearchIndexer} from '../backend/research-indexer.mjs';
import {interpretationHtml,researchCard} from '../public/research.js';

test('shared dictionary has valid unique topics and reciprocal references to existing subjects',()=>{
 const ids=new Set(SEARCH_TOPICS.map(t=>t.id));assert.equal(ids.size,SEARCH_TOPICS.length);
 for(const t of SEARCH_TOPICS)for(const id of [...(t.includes||[]),...(t.related||[])])assert.ok(ids.has(id));
});
test('abbreviations and spelling errors map to topics without changing author names',()=>{
 for(const q of ['domestic','da','DV','DVA','domestic violence','domestic viiolence'])assert.equal(planSearch(q).topics[0].id,'domestic-abuse');
 for(const q of ['burglary','burgulary','burgalry','housebreaking'])assert.equal(planSearch(q).topics[0].id,'burglary');
 assert.equal(planSearch('Alice Smith').corrected,'alice smith');assert.equal(planSearch('data analysis').topics.length,0);
 assert.equal(planSearch('domestic terrorism').topics.length,0);assert.equal(planSearch('domestic cats').topics.length,0);
 assert.ok(planSearch('intimate relationships').suggestions.length);assert.equal(planSearch('intimate relationships').topics.length,0);
});
test('questions, topic suggestions, quotes and exact mode retain user control',()=>{
 const p=planSearch('How can we reduce domestic violence?');assert.equal(p.topics[0].id,'domestic-abuse');assert.equal(p.intents[0].id,'prevention');assert.deepEqual(p.terms,[]);
 assert.equal(planSearch('DA',{exact:true}).topics.length,0);assert.equal(planSearch('"domestic violence"').exact,true);
 assert.equal(planSearch('burglary OR robbery').exact,true);assert.equal(planSearch('burglary -robbery').exact,true);
 assert.ok(topicSuggestions('DV').some(t=>t.topic==='domestic-abuse'));assert.ok(topicSuggestions('burgu').some(t=>t.topic==='burglary'));
});
test('source directory uses the same topics and preserves hard filters',()=>{
 const base={status:'published',name:'Test',about:'',url:'https://fixture.test',owner:'',topics:[],searchTerms:[],communityTags:[],country:'United Kingdom',coverage:['United Kingdom'],types:['University'],content:['Research'],languages:['English'],access:'Free'};
 const sources=[{...base,id:'abuse',about:'Research on intimate partner violence.'},{...base,id:'burglary',about:'Research on domestic burglary.'}];
 assert.deepEqual(searchSources(sources,{query:'DA'}).map(s=>s.id),['abuse']);assert.equal(searchSources(sources,{query:'DA',country:'France'}).length,0);assert.deepEqual(searchSources(sources,{query:'domestic burglary'}).map(s=>s.id),['burglary']);
});
test('markup escapes interpretation and inferred search topics',()=>{
 const html=interpretationHtml({interpretation:{topics:[{label:'<img src=x>'}],corrections:[],intents:[],related:[]}},'test');assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
 assert.ok(!researchCard({title:'Safe',url:'javascript:alert(1)',search_topics:['<script>'],tags:[]},new Set()).includes('href="javascript:'));
});
test('AI failure retains keyword/topic results, exact mode never calls AI',async()=>{
 const original=global.fetch;let calls=0;
 global.fetch=async()=>Response.json({total:1,results:[{id:'da'}],semanticAvailable:true});
 try{const env={AI:{run:async()=>{calls++;throw Error('offline');}}};
 const a=await (await handleResearch(new Request('https://www.id-ebp.org/api/research?q=DA'),{},env)).json();assert.equal(a.total,1);assert.equal(a.semanticAvailable,false);
 await handleResearch(new Request('https://www.id-ebp.org/api/research?q=DA&exact=1'),{},env);assert.equal(calls,1);
 }finally{global.fetch=original;}
});
test('index maintenance is disabled unless explicitly authenticated',async()=>{
 const token='x'.repeat(48),url='https://www.id-ebp.org/api/internal/research-index';
 assert.equal(await authorisedResearchIndex(new Request(url,{method:'POST'}),{RESEARCH_INDEX_TOKEN:token}),false);
 assert.equal(await authorisedResearchIndex(new Request(url,{method:'POST',headers:{Authorization:'Bearer '+token}}),{RESEARCH_INDEX_TOKEN:token}),true);
 assert.equal(await authorisedResearchIndex(new Request(url,{headers:{Authorization:'Bearer '+token}}),{RESEARCH_INDEX_TOKEN:token}),false);
 assert.deepEqual(await runResearchIndex({}),{enabled:false,completed:0});
});
test('indexer rejects missing and invalid proxy authentication before processing jobs',async()=>{
 const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;return Response.json({valid:false});};
 try{const url='https://fixture.test';assert.equal((await handleResearchIndexer(new Request(url,{method:'POST',body:'{}'}),{})).status,403);assert.equal(calls,0);
 assert.equal((await handleResearchIndexer(new Request(url,{method:'POST',headers:{'X-IDEBP-Proxy-Key':'x'.repeat(40)},body:'{}'}),{SUPABASE_URL:'https://fixture.test',SUPABASE_SERVICE_ROLE_KEY:'fixture'})).status,403);assert.equal(calls,1);
 }finally{global.fetch=original;}
});
