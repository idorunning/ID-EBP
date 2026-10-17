import test from 'node:test';
import assert from 'node:assert/strict';
import {SavedSources} from '../public/saved-sources.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
function server(){const records=new Map(),calls=[];let offline=false;return {records,calls,set offline(v){offline=v;},async request(path,{method='GET',body,accountId}={}){calls.push({path,method,body,accountId});if(offline)throw Error('connection lost');const ids=records.get(accountId)||new Set();records.set(accountId,ids);if(path==='/saved/import')body.slugs.forEach(s=>ids.add(s));else if(path.startsWith('/saved/'))method==='PUT'?ids.add(path.slice(7)):ids.delete(path.slice(7));return {saved:[...ids]};}};}
test('existing guest saves are imported additively and synchronise between two devices',async()=>{
 const service=server(),first=storage(),second=storage();first.setItem('pd-saved',JSON.stringify(['guest-source','guest-source']));service.records.set('alice',new Set(['remote-source']));
 const a=new SavedSources({storage:first,request:service.request}),b=new SavedSources({storage:second,request:service.request});
 await a.setUser({id:'alice'});assert.deepEqual([...a.ids].sort(),['guest-source','remote-source']);assert.deepEqual(JSON.parse(first.getItem('pd-saved')),[]);
 await b.setUser({id:'alice'});assert.deepEqual(b.ids,a.ids);await b.toggle('new-source');await a.sync();assert.ok(a.ids.has('new-source'));
 await a.toggle('guest-source');await b.sync();assert.equal(b.ids.has('guest-source'),false);assert.equal(a.status,'synced');
});
test('interrupted writes are retained for their own account and retried without duplicating',async()=>{
 const service=server(),device=storage(),a=new SavedSources({storage:device,request:service.request});await a.setUser({id:'alice'});service.offline=true;await a.toggle('research');assert.equal(a.status,'pending');assert.deepEqual(JSON.parse(device.getItem('idebp-saved-pending:alice')),[['research',true]]);
 await a.setUser(null);assert.deepEqual([...a.ids],[]);await a.setUser({id:'bob'});assert.equal(a.ids.has('research'),false);
 service.offline=false;await a.sync();assert.deepEqual([...service.records.get('bob')],[]);
 const reloaded=new SavedSources({storage:device,request:service.request});await reloaded.setUser({id:'alice'});assert.deepEqual([...reloaded.ids],['research']);assert.equal(reloaded.status,'synced');
 assert.ok(service.calls.filter(c=>c.path==='/saved/research').every(c=>c.accountId==='alice'));
});
test('a click during a collection read is flushed before sync is marked complete',async()=>{
 let release,delay=false;const service=server();const a=new SavedSources({storage:storage(),request:async(...args)=>{const result=await service.request(...args);if(delay&&args[0]==='/saved'){delay=false;await new Promise(resolve=>release=resolve);}return result;}});
 await a.setUser({id:'alice'});delay=true;const reading=a.sync();while(!release)await new Promise(resolve=>setImmediate(resolve));a.toggle('late-click');release();await reading;assert.ok(a.ids.has('late-click'));assert.ok(service.records.get('alice').has('late-click'));assert.equal(a.pending.size,0);
});
test('a save then remove during a slow write preserves the latest intention',async()=>{
 let release;const service=server();const a=new SavedSources({storage:storage(),request:async(...args)=>{if(args[1]?.method==='PUT'&&!release)await new Promise(resolve=>release=resolve);return service.request(...args);}});
 await a.setUser({id:'alice'});const saving=a.toggle('quick-click');a.toggle('quick-click');release();await saving;assert.equal(service.records.get('alice').has('quick-click'),false);assert.equal(a.ids.has('quick-click'),false);
});
test('failed network and browser storage reports memory-only saves honestly',async()=>{
 const service=server(),device={getItem:()=>null,setItem:()=>{throw Error('Storage denied');}},a=new SavedSources({storage:device,request:service.request});await a.setUser({id:'alice'});service.offline=true;await a.toggle('research');assert.equal(a.status,'memory-only');assert.equal(a.pending.get('research'),true);service.offline=false;await a.sync();assert.ok(service.records.get('alice').has('research'));assert.equal(a.status,'synced');
});
test('a failed guest-storage clear does not resurrect an imported source in the same session',async()=>{
 const service=server(),device={getItem:k=>k==='pd-saved'?'["research"]':null,setItem:()=>{throw Error('Storage denied');}},a=new SavedSources({storage:device,request:service.request});await a.setUser({id:'alice'});await a.toggle('research');await a.sync();assert.equal(service.records.get('alice').has('research'),false);assert.equal(service.calls.filter(c=>c.path==='/saved/import').length,1);
});
