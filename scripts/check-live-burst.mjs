import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';

// Bounded read-only deployment smoke check, not a capacity certification.
// Eight workers make 64 anonymous session requests; no accounts or email used.
const samples=[];let next=0;
async function worker(){
  for(;;){
    const index=next++;if(index>=64)return;
    const started=performance.now();
    const response=await fetch('https://www.id-ebp.org/api/session',{signal:AbortSignal.timeout(20000)});
    assert.equal(response.status,200,`Session request ${index}: HTTP ${response.status}`);
    assert.match(response.headers.get('cache-control')||'',/no-store/);
    assert.equal((await response.json()).user,null,'Anonymous session returned a user');
    assert.equal(response.headers.has('set-cookie'),false,'Anonymous request set an account cookie');
    samples.push(performance.now()-started);
  }
}
const started=performance.now();
await Promise.all(Array.from({length:8},worker));
samples.sort((a,b)=>a-b);
const percentile=p=>Math.round(samples[Math.ceil(p*samples.length)-1]);
console.log(JSON.stringify({event:'live_anonymous_session_burst',requests:samples.length,concurrency:8,errors:0,durationMs:Math.round(performance.now()-started),p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99)}));
