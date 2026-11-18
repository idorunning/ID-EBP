import test from 'node:test';
import assert from 'node:assert/strict';
import {trafficWindow,trafficReports,goatCounterReport} from '../backend/traffic.mjs';
import {renderAdminTraffic} from '../public/admin-traffic.js';

test('reporting windows use complete UTC days and allowed ranges',()=>{
 assert.deepEqual(trafficWindow(7,new Date('2026-11-18T19:15:00Z')),{days:7,startDate:'2026-11-11',endDate:'2026-11-17',startISO:'2026-11-11T00:00:00.000Z',endISO:'2026-11-18T00:00:00.000Z'});
 assert.equal(trafficWindow(999).days,28);
});
test('unlinked sources never pretend to have visitors',async()=>{
 const result=await trafficReports({},7,{fetcher:()=>{throw Error('Unconfigured providers must not be called');}});
 assert.equal(result.goatcounter.status,'setup_required');
 assert.equal(result.google.ga4.status,'setup_required');
 assert.equal(result.google.searchConsole.status,'setup_required');
 assert.doesNotMatch(JSON.stringify(result),/local-test-token|BEGIN PRIVATE KEY/i);
});
test('GoatCounter reports authenticated aggregate counts and daily trends',async()=>{
 const requests=[];
 const fetcher=async (url,options)=>{requests.push({url:String(url),authorization:options.headers.Authorization});
  return Response.json(String(url).includes('/stats/total')?{total:15,total_events:3,stats:[{day:'2026-11-17',daily:8}]}:{hits:[{path:'/research',count:10},{path:'/directory',count:2}]});
 };
 const result=await goatCounterReport({GOATCOUNTER_SITE:'idebp',GOATCOUNTER_API_TOKEN:'local-test-token'},trafficWindow(7,new Date('2026-11-18')),{fetcher});
 assert.equal(result.pageHits,12);assert.equal(result.events,3);
 assert.deepEqual(result.topPages[0],{path:'/research',count:10});
 assert.equal(result.daily[0].date,'2026-11-17');
 assert.ok(requests.every(r=>r.authorization==='Bearer local-test-token'));
 assert.ok(requests.every(r=>r.url.startsWith('https://idebp.goatcounter.com/api/v0/')));
 assert.doesNotMatch(JSON.stringify(result),/local-test-token/);
});
test('external provider errors are isolated and credentials remain private',async()=>{
 const result=await trafficReports({GOATCOUNTER_SITE:'id-ebp',GOATCOUNTER_API_TOKEN:'do-not-display'},28,{fetcher:async()=>Response.json({error:'token: do-not-display'},{status:403})});
 assert.equal(result.goatcounter.status,'unavailable');
 assert.ok(!JSON.stringify(result).includes('do-not-display'));
});
test('Google uses signed server-side read-only access and preserves total distinct users',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const bytes=new Uint8Array(await crypto.subtle.exportKey('pkcs8',keys.privateKey));
 const base=Buffer.from(bytes).toString('base64').match(/.{1,64}/g).join('\n');
 const service=JSON.stringify({client_email:'test@local-fixture.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----\n'+base+'\n-----END PRIVATE KEY-----'});
 const calls=[];
 const fetcher=async (url,opts)=>{
  calls.push({url:String(url),opts});
  if(String(url).includes('oauth2.googleapis.com/token'))return Response.json({access_token:'private-test-token'});
  if(String(url).includes('analyticsdata.googleapis.com'))return Response.json({
   rows:[{dimensionValues:[{value:'20261116'}],metricValues:[{value:'5'},{value:'4'},{value:'3'},{value:'9'}]},{dimensionValues:[{value:'20261117'}],metricValues:[{value:'6'},{value:'4'},{value:'5'},{value:'10'}]}],
   totals:[{metricValues:[{value:'11'},{value:'6'},{value:'8'},{value:'19'}]}]
  });
  if(String(url).includes('webmasters/v3/'))return Response.json(JSON.parse(opts.body).dimensions[0]==='date'
    ?{rows:[{keys:['2026-11-16'],clicks:2,impressions:20,position:5},{keys:['2026-11-17'],clicks:3,impressions:30,position:7}]}
    :{rows:[{keys:['evidence based policing'],clicks:5,impressions:50}]});
  throw Error('Unexpected URL');
 };
 const result=await trafficReports({GOOGLE_SERVICE_ACCOUNT_JSON:service,GOOGLE_GA4_PROPERTY_ID:'123456789',GOOGLE_SEARCH_CONSOLE_SITE_URL:'sc-domain:id-ebp.org'},7,{fetcher});
 assert.equal(result.google.ga4.status,'connected');
 assert.equal(result.google.ga4.users,6);
 assert.equal(result.google.ga4.sessions,11);
 assert.equal(result.google.searchConsole.clicks,5);
 assert.equal(result.google.searchConsole.impressions,50);
 assert.equal(result.google.searchConsole.position,6.2);
 assert.equal(result.google.searchConsole.topQueries[0].query,'evidence based policing');
 assert.ok(calls.filter(c=>c.url.startsWith('https://www.googleapis.com/')||c.url.startsWith('https://analyticsdata.googleapis.com/')).every(c=>c.opts.headers.Authorization==='Bearer private-test-token'));
 assert.doesNotMatch(JSON.stringify(result),/private-test-token|BEGIN PRIVATE KEY/);
});
test('dashboard escapes data from external page titles and queries',()=>{
 const markup=renderAdminTraffic({authorised:true,range:{startDate:'2026-11-11',endDate:'2026-11-17'},goatcounter:{status:'connected',pageHits:1,topPages:[{path:'<script>alert(1)</script>',count:1}]},google:{ga4:{status:'setup_required'},searchConsole:{status:'connected',topQueries:[{query:'<img src=x>',clicks:1}]}}},{days:7});
 assert.ok(markup.includes('&lt;script&gt;'));
 assert.ok(markup.includes('&lt;img src=x&gt;'));
 assert.ok(!markup.includes('<script>'));
 assert.ok(markup.includes('data-traffic-range'));
});
