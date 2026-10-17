import test from 'node:test';
import assert from 'node:assert/strict';
import {publicWebUrl,inspectSource,runDirectoryTasks} from '../backend/maintenance.mjs';
test('source checks reject private URLs and recheck redirects before fetching',async()=>{
 for(const url of ['http://public.org','https://127.0.0.1','https://user:pass@public.org','https://intranet.local/path','https://[::1]','https://2130706433','https://0x7f000001','https://public.org:444'])assert.equal(publicWebUrl(url),null,url);
 const seen=[];const result=await inspectSource({url:'https://public.org',about:'A summary'}, {fetcher:async url=>{seen.push(url);return new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}});}});assert.equal(result.status,'unreachable');assert.equal(seen.length,1);
});
test('maintenance extracts published suggestions without inventing contacts or changing a profile',async()=>{
 const job={url:'https://public.org',about:'Existing summary',duplicateUrls:2};
 const result=await inspectSource(job,{now:new Date('2026-10-16'),fetcher:async()=>new Response('<meta name="description" content="Public summary"><link rel="icon" href="/logo.png"><a href="mailto:editor@public.org">Contact</a><a href="/contact">Contact page</a>',{headers:{'Content-Type':'text/html'}})});
 assert.equal(result.status,'working');assert.equal(result.suggestions.summary,'Public summary');assert.deepEqual(result.suggestions.publicEmails,['editor@public.org']);assert.equal(result.suggestions.logoUrl,'https://public.org/logo.png');assert.equal(result.duplicateCandidates,2);assert.equal(job.about,'Existing summary');
 const restricted=await inspectSource(job,{fetcher:async()=>new Response('',{status:403})});assert.equal(restricted.status,'restricted');assert.deepEqual(restricted.suggestions,{});
 const large=await inspectSource(job,{fetcher:async()=>new Response('x'.repeat(1048577))});assert.equal(large.status,'unreachable');
});
test('outbox acknowledges successful sends and holds failures without repeating mail',async()=>{
 const original=globalThis.fetch,calls=[],sent=[];globalThis.fetch=async(url,options)=>{const action=url.split('/').at(-1),body=JSON.parse(options.body);calls.push({action,body,headers:options.headers});return Response.json(action==='maintenance-take'?{jobs:[]}:action==='outbox-take'?{messages:[{id:'one',lease:'first',to:'one@test.org',subject:'Claim receipt',text:'Recorded'},{id:'two',lease:'second',to:'two@test.org',subject:'Claim decision',text:'Reviewed'}]}:{updated:true});};
 try{await runDirectoryTasks({DIRECTORY_API_URL:'https://fixture.supabase.co/functions/v1/directory-api',DIRECTORY_PROXY_SECRET:'local-fixture',WORKFLOW_NOTIFICATIONS_ENABLED:'true',EMAIL:{send:async message=>{sent.push(message);if(sent.length===2)throw Error('Uncertain provider response');return {messageId:'accepted'};}}});}finally{globalThis.fetch=original;}
 assert.equal(sent.length,2);assert.deepEqual(calls.filter(c=>c.action==='outbox-complete').map(c=>c.body.sent),[true,false]);assert.ok(calls.every(c=>c.headers['X-IDEBP-Internal']==='scheduled'));
});
