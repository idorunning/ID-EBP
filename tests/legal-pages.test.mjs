import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/worker.mjs';
import {LEGAL_DOCS,LEGAL_HISTORY,LEGAL_PATHS,SUPPORT_URL,legalPage,legalIndex,supportPage} from '../public/legal.js';
const get=path=>worker.fetch(new Request('https://www.id-ebp.org'+path));

test('ownership, legal and support pages are public, indexable and in the sitemap',async()=>{
 const sitemap=await (await get('/sitemap.xml')).text();
 for(const path of LEGAL_PATHS){
  const response=await get(path),html=await response.text();
  assert.equal(response.status,200,path);assert.match(response.headers.get('x-robots-tag'),/^index/,path);
  assert.match(html,/Thinking About Policing/,path);assert.match(sitemap,new RegExp(`<loc>https://www.id-ebp.org${path}</loc>`),path);
 }
});

test('every legal document carries a version and is listed in the document record',()=>{
 assert.ok(LEGAL_HISTORY.length>=1);
 for(const [path,doc] of Object.entries(LEGAL_DOCS)){
  assert.match(doc.version,/^\d+\.\d+$/);const html=legalPage(path);
  assert.match(html,new RegExp(`Version ${doc.version.replace('.','\\.')}`));assert.match(html,/hello@thinkingaboutpolicing\.org/);
  assert.doesNotMatch(html,/contact@id-ebp\.org/);assert.match(legalIndex(),new RegExp(doc.title));
 }
});

test('support page uses the professional wording and the Thinking About Policing contribution link',()=>{
 const html=supportPage();assert.match(html,new RegExp(SUPPORT_URL));assert.match(html,/Contribute to running costs/);
 assert.match(html,/no influence over which sources are listed/);assert.doesNotMatch(html,/[Bb]uy me a coffee →|☕/);
});

test('public contact points at Thinking About Policing, not the old address',async()=>{
 for(const path of ['/','/privacy','/llms.txt']){assert.doesNotMatch(await (await get(path)).text(),/contact@id-ebp\.org/,path);}
 assert.match(await (await get('/llms.txt')).text(),/owned and operated by Thinking About Policing/);
});
