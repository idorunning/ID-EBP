import test from 'node:test';
import assert from 'node:assert/strict';
import {accountApi,initialiseMembers,getMemberSession,bindContributionWidgets,renderContributionWidget,bindMemberPage,renderMemberPage,completeMutation} from '../public/members.js';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
function host(dataset={}) {
  const handlers=new Map();
  return {dataset,isConnected:true,innerHTML:'',handlers,
    addEventListener:(name,handler)=>handlers.set(name,handler),
    querySelector:()=>null,querySelectorAll:()=>[]};
}
const session=id=>({user:{id,email:id+'@example.test',emailConfirmed:true,admin:true},csrfToken:'csrf-'+id});
function installFetch(t,handler){const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});globalThis.fetch=handler;}

test('overlapping session refreshes share one request pair',async t=>{
  let calls=0;
  installFetch(t,async path=>{calls++;await turn();return Response.json(path==='/api/status'?{configured:true,email:true}:session('coalesced'));});
  await Promise.all(Array.from({length:25},()=>initialiseMembers({refresh:true})));
  assert.equal(calls,2);
  assert.equal(getMemberSession().user.id,'coalesced');
});

test('successful HTML and malformed JSON responses cannot confirm a mutation',async t=>{
  let response;
  installFetch(t,async()=>response);
  for(const [body,type] of [['<html>Service unavailable</html>','text/html'],['{','application/json']]){
    response=new Response(body,{headers:{'Content-Type':type}});
    await assert.rejects(completeMutation({submit:()=>accountApi('/account',{method:'PATCH',body:{}})}),error=>error.code==='invalid_response'&&error.uncertain===true);
  }
});

test('API requests have a deadline and leave timed-out mutations uncertain',async t=>{
  let aborted=false;
  installFetch(t,async(path,{signal})=>new Promise((resolve,reject)=>{
    signal?.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true});
  }));
  await assert.rejects(completeMutation({submit:()=>accountApi('/account',{method:'PATCH',body:{},timeoutMs:10})}),error=>error.code==='request_timeout'&&error.uncertain===true);
  assert.equal(aborted,true);
});

test('account changes clear cached private ratings and administrator reports',async t=>{
  let id='alice';
  installFetch(t,async path=>Response.json(path==='/api/status'?{configured:true,email:true}:
    path==='/api/session'?session(id):
    path.endsWith('/community')?{rating:{average:4,count:1,own:5}}:
    path==='/api/admin/sources'?{sources:[{slug:'sample',name:'Alice private report',status:'published',url:'https://example.test'}]}:
    path==='/api/admin/people'?{members:[],managers:[],audit:[]}:
    path==='/api/admin/workflows'?{accountRequests:[],notifications:[],maintenance:[]}:{tags:[],claims:[],revisions:[],submissions:[]}));
  await initialiseMembers({refresh:true});
  const widget=host({contributionSource:'sample'}),admin=host({memberPath:'/admin'});
  bindContributionWidgets({root:{querySelectorAll:()=>[widget]},sources:[{id:'sample'}]});
  bindMemberPage({root:{querySelector:()=>admin}});
  await turn();await turn();
  assert.match(renderContributionWidget({id:'sample'}),/aria-pressed="true"/);
  assert.match(renderMemberPage({path:'/admin'}),/Alice private report/);
  id='bob';await initialiseMembers({refresh:true});
  assert.doesNotMatch(renderContributionWidget({id:'sample'}),/aria-pressed="true"/);
  assert.doesNotMatch(renderMemberPage({path:'/admin'}),/Alice private report/);
});

test('late responses from another account cannot restore its private ratings',async t=>{
  let id='old-account',release;
  installFetch(t,async path=>{
    if(path==='/api/status')return Response.json({configured:true,email:true});
    if(path==='/api/session')return Response.json(session(id));
    await new Promise(resolve=>{release=resolve;});
    return Response.json({rating:{average:3,count:1,own:5}});
  });
  await initialiseMembers({refresh:true});
  const widget=host({contributionSource:'late-source'});
  bindContributionWidgets({root:{querySelectorAll:()=>[widget]},sources:[{id:'late-source'}]});
  await turn();
  id='new-account';await initialiseMembers({refresh:true});
  release();await turn();
  assert.doesNotMatch(renderContributionWidget({id:'late-source'}),/aria-pressed="true"/);
});

test('a delayed rating write cannot populate the account that signs in afterwards',async t=>{
  let id='rating-alice',release,readsFail=false;
  installFetch(t,async(path,options)=>{
    if(path==='/api/status')return Response.json({configured:true,email:true});
    if(path==='/api/session')return Response.json(session(id));
    if(options.method==='PUT'){await new Promise(resolve=>{release=resolve;});return Response.json({rating:{average:5,count:1,own:5}});}
    return readsFail?Response.json({error:{code:'service_unavailable'}},{status:503}):Response.json({rating:{average:null,count:0,own:null}});
  });
  await initialiseMembers({refresh:true});
  const widget=host({contributionSource:'changing-source'});
  bindContributionWidgets({root:{querySelectorAll:()=>[widget]},sources:[{id:'changing-source'}]});await turn();
  const action=widget.handlers.get('click')({target:{closest:selector=>selector==='[data-rate]'?{dataset:{rate:'5'}}:null}});
  id='rating-bob';await initialiseMembers({refresh:true});readsFail=true;
  release();await action;
  assert.doesNotMatch(renderContributionWidget({id:'changing-source'}),/aria-pressed="true"/);
});

test('duplicate resend clicks issue one request while delivery is pending',async t=>{
  let release,deliveries=0;
  installFetch(t,async path=>{
    if(path==='/api/status')return Response.json({configured:true,email:true});
    if(path==='/api/session')return Response.json({user:null});
    deliveries++;await new Promise(resolve=>{release=resolve;});return Response.json({sent:true});
  });
  await initialiseMembers({refresh:true});
  const page=host({memberPath:'/login'});bindMemberPage({root:{querySelector:()=>page}});await turn();
  const button={dataset:{memberAction:'resend'},disabled:false};
  const event={target:{closest:()=>button}};
  const first=page.handlers.get('click')(event);
  await page.handlers.get('click')(event);
  assert.equal(deliveries,1);assert.equal(button.disabled,true);
  release();await first;assert.equal(button.disabled,false);
});

test('a source edit keeps its confirmation and blocks an identical repeat submission',async t=>{
  let writes=0,fail=false;
  installFetch(t,async path=>{
    if(path==='/api/status')return Response.json({configured:true,email:true});
    if(path==='/api/session')return Response.json(session('editor'));
    writes++;return fail?Response.json({error:{code:'service_unavailable'}},{status:503}):Response.json({revisionId:1});
  });
  const previous=globalThis.FormData;t.after(()=>{globalThis.FormData=previous;});
  globalThis.FormData=class{constructor(form){this.data=form.data;}get(key){return this.data[key]??null;}getAll(key){const value=this.get(key);return value===null?[]:Array.isArray(value)?value:[value];}};
  await initialiseMembers({refresh:true});
  const page=host({memberPath:'/source-workspace'});bindMemberPage({root:{querySelector:()=>page}});await turn();
  const message={textContent:'',classList:{toggle(){}},setAttribute(){},scrollIntoView(){}};
  const form={dataset:{memberForm:'revision',source:'sample'},data:{name:'Sample',about:'Public source description with enough detail.',country:'United Kingdom',languages:['English'],contentTypes:['Original research']},querySelector:()=>message,querySelectorAll:()=>[]};
  const event={target:{closest:()=>form},preventDefault(){}};
  await page.handlers.get('submit')(event);await page.handlers.get('submit')(event);
  assert.equal(writes,1);assert.match(message.textContent,/Changes submitted — awaiting approval/);
  form.data.about='A revised description awaiting a separate review.';fail=true;
  await page.handlers.get('submit')(event);
  assert.equal(writes,2);assert.match(message.textContent,/could not confirm the result/);
  assert.equal(form.data.about,'A revised description awaiting a separate review.');
  assert.equal(form.dataset.submitting,undefined);
});

test('an old session read cannot restore an account after logout',async t=>{
  let slow=false,release;
  installFetch(t,async path=>{
    if(path==='/api/status')return Response.json({configured:true,email:true});
    if(path==='/api/auth/logout')return Response.json({ok:true});
    if(slow)await new Promise(resolve=>{release=resolve;});
    return Response.json(session('signing-out'));
  });
  await initialiseMembers({refresh:true});
  const page=host({memberPath:'/account'});bindMemberPage({root:{querySelector:()=>page}});await turn();
  slow=true;const loading=initialiseMembers({refresh:true});await turn();
  const button={dataset:{memberAction:'logout'},disabled:false};
  await page.handlers.get('click')({target:{closest:()=>button}});
  release();await loading;
  assert.equal(getMemberSession().user,null);
});

test('initial account loading preserves text entered before it finishes',async t=>{
  let release;
  installFetch(t,async path=>{
    if(path==='/api/status'){await new Promise(resolve=>{release=resolve;});return Response.json({configured:true,email:true});}
    return Response.json({user:null});
  });
  const loading=initialiseMembers({refresh:true});
  const page=host({memberPath:'/login'}),form={dataset:{memberForm:'request'},querySelector:()=>null};
  const field={name:'email',value:'typed@example.test',closest:selector=>selector==='[data-member-form]'?form:null};
  let restored='';
  const replacement={name:'email',closest:()=>form,set value(value){restored=value;}};
  page.querySelectorAll=selector=>selector==='input[name],textarea[name],select[name]'?[replacement]:[];
  bindMemberPage({root:{querySelector:()=>page}});
  page.handlers.get('input')({target:field});
  release();await loading;await turn();
  assert.equal(restored,'typed@example.test');
});

test('initial refresh restores a decision reason only to its original administrative action',async t=>{
  let release;
  installFetch(t,async path=>{
    if(path==='/api/status'){await new Promise(resolve=>{release=resolve;});return Response.json({configured:true,email:true});}
    return Response.json({user:null});
  });
  const loading=initialiseMembers({refresh:true}),page=host({memberPath:'/account'});
  const firstForm={dataset:{memberForm:'admin-action',operation:'suspend_member',userId:'first'},querySelector:()=>null};
  const secondForm={dataset:{memberForm:'admin-action',operation:'suspend_member',userId:'second'},querySelector:()=>null};
  const edited={name:'reason',value:'A reason only for the first member.',closest:selector=>selector==='[data-member-form]'?firstForm:null};
  const first={name:'reason',value:'',closest:()=>firstForm},second={name:'reason',value:'',closest:()=>secondForm};
  page.querySelectorAll=selector=>selector==='input[name],textarea[name],select[name]'?[first,second]:[];
  bindMemberPage({root:{querySelector:()=>page}});page.handlers.get('input')({target:edited});
  release();await loading;await turn();
  assert.equal(first.value,'A reason only for the first member.');assert.equal(second.value,'');
});
