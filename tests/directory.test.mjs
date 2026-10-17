import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCES} from '../public/data.js';
import {searchSources,signalScore,safeUrl} from '../public/ranking.js';
import worker from '../dist/worker.mjs';

test('society, country and research language filters intersect',()=>{
 const result=searchSources(SOURCES,{type:'EBP society',based:'Canada',language:'English'});
 assert.deepEqual(result.map(s=>s.id),['can-sebp']);
 assert.equal(searchSources(SOURCES,{type:'EBP society',based:'Canada',language:'French'}).length,0);
});
test('coverage does not imply the organisation is based in that country',()=>{
 assert(searchSources(SOURCES,{country:'New Zealand'}).some(s=>s.id==='anzsebp'));
 assert(!searchSources(SOURCES,{based:'New Zealand'}).some(s=>s.id==='anzsebp'));
});
test('identity and popularity cannot override a closer textual match',()=>{
 const template=SOURCES[0];
 const boosted={...template,id:'boosted',name:'Other collection',about:'policing resource',topics:[],ratingCount:1e7,ratingAverage:5,signals:{organisationConfirmed:true,domainConfirmed:true,confirmedSocial:900,independentReferences:900,eligibleRecommendations:999999}};
 const relevant={...template,id:'relevant',name:'Policing resource',topics:[],signals:{}};
 assert(signalScore(boosted)>39.9 && signalScore(boosted)<=40);
 assert.equal(searchSources([boosted,relevant],{query:'policing'})[0].id,'relevant');
});
test('hidden sources and nonmatching topics cannot be boosted into results',()=>{
 const hidden={...SOURCES[0],status:'hidden'};
 assert.equal(searchSources([hidden]).length,0);
 assert.equal(searchSources(SOURCES,{topic:'Nonexistent subject'}).length,0);
});
test('unsafe external URL schemes and embedded credentials are rejected',()=>{
 for(const u of ['javascript:alert(1)','data:text/html,hello','https://person:secret@example.org','file:///etc/passwd'])assert.equal(safeUrl(u),null);
 assert.equal(safeUrl('https://example.org/research'),'https://example.org/research');
});
test('preview rejects account writes and declares its actual capability',async()=>{
 const status=await worker.fetch(new Request('https://example.org/api/status'));
 assert.equal((await status.json()).authentication,false);
 const write=await worker.fetch(new Request('https://example.org/api/signup',{method:'POST',body:'example'}));
 assert.equal(write.status,503);
 const post=await worker.fetch(new Request('https://example.org/',{method:'POST'}));
 assert.equal(post.status,405);
});
test('served preview has restrictive headers and cannot expose backend files',async()=>{
 const page=await worker.fetch(new Request('https://example.org/'));
 assert.equal(page.status,200);
 assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow');
 const secret=await worker.fetch(new Request('https://example.org/backend/schema.sql'));
 assert.equal(secret.status,404);
});
test('www and plain HTTP redirect to the canonical HTTPS domain without losing paths or queries',async()=>{
 for(const address of ['http://www.id-ebp.org/app.js?version=2','https://www.id-ebp.org/app.js?version=2','http://id-ebp.org/app.js?version=2']){
  const response=await worker.fetch(new Request(address));
  assert.equal(response.status,308);
  assert.equal(response.headers.get('location'),'https://id-ebp.org/app.js?version=2');
 }
 for(const address of ['https://id-ebp.org/','https://idebp-preview.ntracey.workers.dev/']){
  assert.equal((await worker.fetch(new Request(address))).status,200);
 }
});

test('nested binary font and source images retain their file signatures and MIME types',async()=>{
 const font=await worker.fetch(new Request('https://example.org/assets/fonts/public-sans-latin.woff2'));
 assert.equal(font.headers.get('content-type'),'font/woff2');
 assert.equal(new TextDecoder().decode((await font.arrayBuffer()).slice(0,4)),'wOF2');
 const logo=await worker.fetch(new Request('https://example.org/assets/sources/cebcp-matrix-logo.png'));
 assert.equal(logo.headers.get('content-type'),'image/png');
 assert.deepEqual([...new Uint8Array(await logo.arrayBuffer()).slice(0,8)],[137,80,78,71,13,10,26,10]);
});
