import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/worker.mjs';
const get=path=>worker.fetch(new Request('https://id-ebp.org'+path));
test('public profiles are readable without JavaScript and have their own canonical and structured data',async()=>{
 const response=await get('/source/tap'),html=await response.text();assert.equal(response.status,200);assert.match(response.headers.get('x-robots-tag'),/^index, follow/);
 assert.match(html,/<h1>Thinking About Policing<\/h1>/);assert.match(html,/rel="canonical" href="https:\/\/id-ebp.org\/source\/tap"/);assert.match(html,/application\/ld\+json/);assert.match(html,/Auto-generated source summary/);
 assert.doesNotMatch(html,/href="#\//);assert.match(html,/property="og:title" content="Thinking About Policing/);
});
test('only actual public pages are indexable, unknown sources are 404 and private pages remain noindex',async()=>{
 for(const path of ['/admin','/account','/source-workspace?claim=tap','/directory?query=policing'])assert.match((await get(path)).headers.get('x-robots-tag'),/^noindex/);
 for(const path of ['/source/does-not-exist','/unknown-page','/sources/unknown'])assert.equal((await get(path)).status,404);
 assert.equal((await get('/source/tap/')).headers.get('location'),'https://id-ebp.org/source/tap');
 assert.equal((await get('/sources/universities')).status,200);assert.equal((await get('/countries/gb')).status,200);assert.equal((await get('/topics/leadership')).status,200);
});
test('sitemap, robots and machine-readable public catalogue contain usable URLs and no private account data',async()=>{
 const robots=await (await get('/robots.txt')).text();assert.match(robots,/Allow: \//);assert.match(robots,/Sitemap: https:\/\/id-ebp.org\/sitemap.xml/);assert.doesNotMatch(robots,/Disallow: \/\n/);
 const sitemap=await (await get('/sitemap.xml')).text();assert.match(sitemap,/<loc>https:\/\/id-ebp.org\/source\/tap<\/loc>/);assert.doesNotMatch(sitemap,/#\/|<loc>[^<]*\/admin/);
 const catalogue=await (await get('/catalogue.json')).json();assert.ok(catalogue.sources.length>=115);assert.doesNotMatch(JSON.stringify(catalogue),/verifiedEmail|contactEmail|requested_by|decided_by|csrfToken/);
});
test('server-rendered catalogue uses live published records and excludes withdrawn sources',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);globalThis.fetch=async()=>Response.json({authoritative:true,sources:{only:{organisationConfirmed:true,profile:{slug:'only',name:'Only public source',about:'Live public source summary.',url:'https://example.test',types:['University'],topics:[],contentTypes:[],country:'GB'}}}});
 const env={DIRECTORY_API_URL:'https://fixture.supabase.co/functions/v1/directory-api',DIRECTORY_PROXY_SECRET:'test'};
 let response=await worker.fetch(new Request('https://id-ebp.org/source/tap'),env);assert.equal(response.status,404);
 response=await worker.fetch(new Request('https://id-ebp.org/source/only'),env);const html=await response.text();assert.match(html,/Only public source/);assert.match(html,/Verified source owner/);assert.doesNotMatch(html,/requested_by|decided_by/);
});
