import test from 'node:test';
import assert from 'node:assert/strict';
import {handleResearch} from '../backend/research.mjs';
import {researchPage,researchForm,bindResearch} from '../public/research.js';

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

test('homepage search navigates through JavaScript under the site form-action CSP and removes its listener',()=>{
 const oldDocument=global.document,oldWindow=global.window;let handler,target,prevented=false,removed=false;
 const form={querySelector:()=>({value:'  body worn cameras  '}),addEventListener:(type,fn)=>{assert.equal(type,'submit');handler=fn;},removeEventListener:(type,fn)=>{assert.equal(type,'submit');assert.equal(fn,handler);removed=true;}};
 global.document={getElementById:id=>id==='research-form'?form:null};global.window={location:{assign:url=>{target=url;}}};
 try{const dispose=bindResearch({params:new URLSearchParams()});handler({preventDefault:()=>{prevented=true;}});assert.equal(prevented,true);assert.equal(target,'/research?q=body+worn+cameras');dispose();assert.equal(removed,true);}finally{global.document=oldDocument;global.window=oldWindow;}
});
