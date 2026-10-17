import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../dist/worker.mjs';
import {runDirectoryTasks} from '../backend/maintenance.mjs';

const env=()=>({DIRECTORY_API_URL:'https://fixture.supabase.co/functions/v1/directory-api',DIRECTORY_PROXY_SECRET:'local-fixture-secret',WORKFLOW_NOTIFICATIONS_ENABLED:'true',EMAIL:{send:async()=>({id:'accepted'})}});
const message=i=>({id:'message-'+i,lease:'private-lease-'+i,to:`member-${i}@private-fixture.test`,subject:'Private subject',text:'Private message content'});

async function invokeScheduled(minutes,environment){
 const pending=[];
 await worker.scheduled({cron:'*/5 * * * *',scheduledTime:Date.UTC(2026,9,17,13,minutes)},environment,{waitUntil:promise=>pending.push(promise)});
 await Promise.all(pending);
}

test('five-minute scheduling ceiling is120/hour before the database50/24h budget; source checks remain half-hourly',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let maintenanceTakes=0,outboxTakes=0,sends=0;const logs=[];
 t.mock.method(console,'log',line=>logs.push(JSON.parse(line)));
 globalThis.fetch=async url=>{
  if(url.endsWith('maintenance-take')){maintenanceTakes++;return Response.json({jobs:[]});}
  if(url.endsWith('outbox-take')){outboxTakes++;return Response.json({messages:Array.from({length:10},(_,i)=>message(outboxTakes*10+i))});}
  return Response.json({updated:true});
 };
 const environment={...env(),EMAIL:{send:async()=>{sends++;return {id:'accepted'};}}};
 for(let minutes=0;minutes<60;minutes+=5)await invokeScheduled(minutes,environment);
 assert.equal(outboxTakes,12);assert.equal(maintenanceTakes,2);assert.equal(sends,120);assert.equal(logs.length,12);
 assert.equal(logs.filter(log=>log.maintenance.enabled).length,2);assert.ok(logs.every(log=>log.notifications.fullBatch&&log.notifications.accepted===10));
 assert.doesNotMatch(JSON.stringify(logs),/private-fixture|Private subject|Private message|private-lease|message-/);
 const config=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));assert.deepEqual(config.triggers.crons,['*/5 * * * *']);
});

test('queued notices proceed while a source-maintenance request is still pending',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let finishMaintenance,mailSent;
 const sent=new Promise(resolve=>mailSent=resolve);
 globalThis.fetch=async url=>{
  if(url.endsWith('maintenance-take'))return new Promise(resolve=>finishMaintenance=()=>resolve(Response.json({jobs:[]})));
  if(url.endsWith('outbox-take'))return Response.json({messages:[message(1)]});
  return Response.json({updated:true});
 };
 const running=runDirectoryTasks({...env(),EMAIL:{send:async()=>{mailSent();return {id:'accepted'};}}});
 await sent;assert.equal(typeof finishMaintenance,'function');finishMaintenance();
 const report=await running;assert.equal(report.notifications.accepted,1);assert.equal(report.status,'ok');
});

test('held quota failures produce aggregate operational data and never expose recipients or provider error text',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);const completions=[];let taken=0,sends=0;
 globalThis.fetch=async(url,request)=>{
  if(url.endsWith('outbox-take')){taken++;return Response.json({messages:[message(1),message(2)]});}
  completions.push(JSON.parse(request.body));return Response.json({updated:true});
 };
 const report=await runDirectoryTasks({...env(),EMAIL:{send:async()=>{sends++;throw Object.assign(new Error('member-1@private-fixture.test SECRET'),{code:sends===1?'E_DAILY_LIMIT_EXCEEDED':'E_RATE_LIMIT_EXCEEDED'});}}},{maintenance:false});
 assert.equal(taken,1);assert.equal(sends,2);assert.equal(report.status,'attention');assert.equal(report.notifications.held,2);assert.equal(report.notifications.quotaLimited,1);assert.equal(report.notifications.rateLimited,1);
 assert.deepEqual(completions.map(item=>item.sent),[false,false]);assert.doesNotMatch(JSON.stringify(report),/private-fixture|SECRET|Private subject|private-lease/);
});

test('failed background work reports an aggregate failure before rejecting the scheduled run',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);const reports=[];
 globalThis.fetch=async url=>url.endsWith('outbox-take')?Response.json({messages:[]}):Response.json({error:'private details'},{status:503});
 await assert.rejects(runDirectoryTasks(env(),{report:summary=>reports.push(summary)}),AggregateError);
 assert.equal(reports.length,1);assert.equal(reports[0].status,'failed');assert.equal(reports[0].failureCount,1);assert.equal(reports[0].maintenance.failed,1);assert.doesNotMatch(JSON.stringify(reports),/private details/);
});

test('missing configured email binding is reported without leasing messages',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Must not fetch');};const reports=[];
 await assert.rejects(runDirectoryTasks({...env(),EMAIL:undefined},{maintenance:false,report:summary=>reports.push(summary)}),AggregateError);
 assert.equal(calls,0);assert.equal(reports[0].notifications.configurationError,true);assert.equal(reports[0].status,'failed');
});

test('budget-blocked pending work remains visible in aggregate operational health',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let sends=0;
 globalThis.fetch=async()=>Response.json({messages:[],budget:{remaining:0,nextAvailableAt:'2026-10-18T13:00:00Z'},health:{pending:15,held:2,oldestPendingAt:'2026-10-17T00:00:00Z',recipient:'must-not-be-logged@private.test'}});
 const report=await runDirectoryTasks({...env(),EMAIL:{send:async()=>sends++}},{maintenance:false});
 assert.equal(sends,0);assert.equal(report.status,'attention');assert.equal(report.notifications.budgetDeferred,true);assert.equal(report.notifications.pending,15);assert.equal(report.notifications.heldTotal,2);assert.equal(report.notifications.budgetRemaining,0);assert.ok(report.notifications.oldestPendingAgeSeconds>=0);assert.doesNotMatch(JSON.stringify(report),/must-not-be-logged/);
});
