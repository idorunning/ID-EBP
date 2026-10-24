import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {buildResearchIndex,researchNormalise,searchResearch,suggestResearchTerms} from '../backend/research.mjs';
import worker from '../dist/worker.mjs';
import {SOURCES} from '../public/data.js';
const bytes=gunzipSync(await readFile(new URL('../research/catalogue.json.gz',import.meta.url)));
const data=JSON.parse(bytes),manifest=JSON.parse(await readFile(new URL('../research/manifest.json',import.meta.url)));
const index=buildResearchIndex(data.records),visible=new Set(data.sources.map(s=>s.slug));
const search=query=>searchResearch(data,index,new URLSearchParams(query),visible);

test('checkpoint export preserves all IDs, excludes two untitled records and exposes no evidence narratives',()=>{
 assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.snapshotSha256);
 assert.equal(manifest.catalogueRecords,16671);assert.equal(new Set(manifest.recordIds).size,16671);
 assert.equal(data.records.length,16669);assert.equal(data.independentAppraisals,0);
 assert.deepEqual(manifest.withheldRecords.map(r=>r.id),['IDEBP-R0667','IDEBP-R14450']);
 const seen=new Set();
 for(const r of data.records){assert(!seen.has(r.id));seen.add(r.id);assert(manifest.recordIds.includes(r.id));assert.equal(r.independentAppraisal,false);for(const key of ['summary','findings','appraisal','method','limitations','excerpt','relatedLinks'])assert(!Object.hasOwn(r,key));const url=new URL(r.url);assert(['http:','https:'].includes(url.protocol));assert(!url.username&&!url.password);}
 assert.equal(seen.size+manifest.withheldRecords.length,manifest.recordIds.length);
 assert.equal(data.records.find(r=>r.id==='IDEBP-R16671').relationships[0].type,'Article and correction');
 assert.equal(data.records.find(r=>r.id==='IDEBP-R16664').relationships[0].inferred,true);
 assert(data.records.find(r=>r.id==='IDEBP-R16498').linkScope);
 assert.equal(data.records.find(r=>r.id==='IDEBP-R13686').publicationDate,'2013');
 assert.equal(data.records.find(r=>r.id==='IDEBP-0001').publicationDate,'2021-06-10');
 const chapters=['IDEBP-R13686','IDEBP-R13687','IDEBP-R13693'].map(id=>data.records.find(r=>r.id===id));
 assert.equal(new Set(chapters.map(r=>r.citation)).size,3);assert(chapters.every(r=>r.linkScope&&r.sharedLinkCount>1));
});
test('search uses all words and all selected terms, normalises accents and retains filters through pagination',()=>{
 assert.equal(researchNormalise('Malmö’s & POLICING'),'malmos and policing');
 const results=search('query=body+worn+cameras');assert(results.total>25);assert.equal(results.records.length,25);assert.equal(results.page,1);
 const next=search('query=body+worn+cameras&page=2');assert.equal(next.total,results.total);assert(!results.records.some(r=>next.records.some(n=>n.id===r.id)));
 assert.equal(search('query=body+worn+cameras+unmatchabletermabcdef').total,0);
 const a=search('tag=hot+spots+policing'),b=search('tag=hot+spots+policing&tag=systematic+review');assert(b.total>0);assert(b.total<=a.total);
 for(const r of b.records){const ts=[...r.recordedTags,...r.searchTerms].map(researchNormalise);assert(ts.includes('hot spots policing')&&ts.includes('systematic review'));}
 assert(search('query=malmo').total>0);
 const year=search('year=2013');assert(year.records.every(r=>/^2013(?:$|[^0-9])/.test(r.publicationDate)));
 assert.equal(search('page=999999').page,search('').pages);
 for(const query of ['page=-1','page=Infinity','year=2013%7C2020','query='+('x'.repeat(201)),Array.from({length:9},(_,i)=>'tag='+i).join('&')])assert.throws(()=>search(query),RangeError);
});
test('API and visible facets obey current authoritative source withdrawals, and fail closed during outages',async()=>{
 const old=globalThis.fetch;let state={authoritative:true,sources:{'college-toolkit':{}}};
 globalThis.fetch=async()=>Response.json(state);
 const env={DIRECTORY_API_URL:'https://example.supabase.co/functions/v1/directory-api',DIRECTORY_PROXY_SECRET:'test-secret'};
 try{
  const get=async()=>worker.fetch(new Request('http://localhost/api/research'),env);
  let response=await get(),r=await response.json();assert.equal(response.status,200);assert.equal(r.sourceCount,1);assert(r.records.every(x=>x.sourceSlug==='college-toolkit'));assert.equal(response.headers.get('Cache-Control'),'no-store');assert(!response.headers.has('Set-Cookie'));
  state={authoritative:true,sources:{}};r=await (await get()).json();assert.equal(r.total,0);assert.deepEqual(r.sources,[]);assert.deepEqual(r.suggestedTerms,[]);assert.equal(r.publicRecordCount,0);
  state={sources:{}};assert.equal((await get()).status,503);
  globalThis.fetch=async()=>{throw Error('offline')};assert.equal((await get()).status,503);
 }finally{globalThis.fetch=old;}
});
test('research route supports direct links and read-only bounded API without exposing the bulk snapshot',async()=>{
 const get=(path,method='GET')=>worker.fetch(new Request('http://localhost'+path,{method}));
 const page=await get('/research?query=policing');assert.equal(page.status,200);assert.match(await page.text(),/Independent|independent evidence appraisal/);assert.match(page.headers.get('X-Robots-Tag'),/noindex/);
 assert.equal((await get('/api/research','POST')).status,405);
 assert.equal((await get('/api/research?page=wat')).status,400);
 const head=await get('/api/research','HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await get('/research/catalogue.json')).status,404);
 assert.equal((await get('/research/manifest.json')).status,404);
 assert.equal((await get('/catalogue.json')).status,200);
 const reply=await (await get('/api/research')).json();assert.equal(reply.total,data.records.filter(r=>SOURCES.some(s=>s.id===r.sourceSlug&&s.status!=='hidden')).length);assert.equal(reply.pageSize,25);assert.equal(reply.independentAppraisals,0);
});

test('complete published source set shows 16,669 records and suggestions never reveal withdrawn sources',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({authoritative:true,sources:Object.fromEntries(data.sources.map(s=>[s.slug,{}]))});
 const env={DIRECTORY_API_URL:'https://example.supabase.co/functions/v1/directory-api',DIRECTORY_PROXY_SECRET:'test-secret'};
 try{const r=await (await worker.fetch(new Request('http://localhost/api/research?summary=1'),env)).json();assert.equal(r.publicRecordCount,16669);assert.equal(r.sourceCount,134);assert(!Object.hasOwn(r,'records'));}finally{globalThis.fetch=old;}
 const terms=suggestResearchTerms(data,new URLSearchParams('suggest=hot'),visible);assert(terms.terms.length>0);assert(terms.terms.length<=10);
 assert.deepEqual(suggestResearchTerms(data,new URLSearchParams('suggest=hot'),new Set()),{terms:[]});
 assert.throws(()=>suggestResearchTerms(data,new URLSearchParams({suggest:'x'.repeat(81)}),visible),RangeError);
});
