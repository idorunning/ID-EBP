import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseRating, memberCopy, renderMemberPage, renderContributionWidget, initialiseMembers, loadPublicContributions, getContributionSummary, getMemberSession, isMemberPath, completeMutation} from '../public/members.js';

test('member ratings preserve a deliberate zero and keep unrated distinct',()=>{
  for(const value of [0,'0',1,'2',5,'5']) assert.equal(normaliseRating(value),Number(value));
  for(const value of [null,undefined,'',' ',false,true,{},[],NaN,Infinity,-1,6,2.5,'2.5','five']) assert.equal(normaliseRating(value),null);
});

test('every member interface message is available in each supported interface language',()=>{
  const keys=Object.keys(memberCopy('en')).sort();
  for(const locale of ['fr','es']) {
    assert.deepEqual(Object.keys(memberCopy(locale)).sort(),keys);
    for(const [key,text] of Object.entries(memberCopy(locale))) assert.ok(text.trim(),`${locale}.${key}`);
  }
});

test('member service does not invent an account, star score or successful registration while inactive',async t=>{
  const original=globalThis.fetch; const requests=[];
  t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async(url,options)=>{
    requests.push({url,options});
    if(url==='/api/status') return Response.json({configured:false,mode:'setup_required'});
    return Response.json({sources:{}});
  };
  await initialiseMembers({refresh:true});
  const html=renderMemberPage({path:'/register'});
  assert.match(html,/Account activation required/);
  assert.match(html,/Nothing entered here is submitted while it is inactive/);
  assert.match(html,/type="submit" disabled/);
  assert.equal(getMemberSession().user,null);
  const widget=renderContributionWidget({id:'sample'});
  assert.match(widget,/Not rated yet/);
  assert.doesNotMatch(widget,/<input[^>]*\bchecked\b/);
  assert.doesNotMatch(widget,/value="0"/);
  assert.match(widget,/value="1"/);
  assert.match(widget,/value="5"/);
  assert.equal(requests.some(request=>request.options.method!=='GET'),false);
});

test('published community tags remain escaped and account requests use same-origin cookies',async t=>{
  const original=globalThis.fetch;const requests=[];
  t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async(url,options)=>{
    requests.push({url,options});
    if(url==='/api/status') return Response.json({configured:true,email:true});
    if(url==='/api/session') return Response.json({user:{id:'member',email:'member@example.org',emailConfirmed:true,admin:false},csrfToken:'csrf'});
    return Response.json({sources:{sample:{ratingAverage:0,ratingCount:2,tags:['<img src=x onerror=alert(1)>'],domainConfirmed:true,organisationConfirmed:false},fractional:{ratingAverage:4.26,ratingCount:19,tags:[],domainConfirmed:false,organisationConfirmed:false}}});
  };
  await initialiseMembers({refresh:true});
  const contributions=await loadPublicContributions();
  assert.equal(contributions.sample.ratingAverage,0);
  assert.equal(getContributionSummary('sample').ratingCount,2);
  const widget=renderContributionWidget({id:'sample'});
  assert.match(widget,/0\.0 \/ 5/);
  assert.match(widget,/&lt;img/);
  assert.doesNotMatch(widget,/<img src=x/);
  assert.match(widget,/Approved source contact confirmed/);
  assert.match(widget,/instant-stars/);
  assert.doesNotMatch(widget,/\sstyle\s*=/);
  const fractional=renderContributionWidget({id:'fractional'});
  assert.match(fractional,/instant-star is-filled/);
  assert.match(fractional,/4\.3 \/ 5/);
  assert.doesNotMatch(fractional,/\sstyle\s*=/);
  assert.equal(requests.every(request=>request.options.credentials==='same-origin'),true);
  assert.equal(requests.every(request=>request.options.cache==='no-store'),true);
});

test('email sign-in remains clearly inactive if data service is connected before email delivery',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async(url)=>Response.json(url==='/api/status'?{configured:true,email:false}:{user:null});
  await initialiseMembers({refresh:true});
  const html=renderMemberPage({path:'/login',lang:'es'});
  assert.match(html,/Se está conectando el acceso por correo/);
  assert.match(html,/type="submit" disabled/);
  assert.equal(isMemberPath('/source-workspace'),true);
  assert.equal(isMemberPath('/admin'),true);
  assert.equal(isMemberPath('/directory'),false);
});

test('an expired session still lets the member request a fresh sign-in code',async t=>{
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async(url)=>url==='/api/status'
    ? Response.json({configured:true,email:true})
    : Response.json({error:{code:'sign_in_required'}},{status:401});
  await initialiseMembers({refresh:true});
  assert.equal(getMemberSession().user,null);
  const html=renderMemberPage({path:'/login'});
  assert.doesNotMatch(html,/type="submit" disabled/);
  assert.doesNotMatch(html,/Account activation required/);
});

test('password recovery has an email-code screen and no authenticator controls',()=>{
 const page=renderMemberPage({path:'/reset-password',lang:'en'});assert.match(page,/Send password-reset email/);assert.doesNotMatch(page,/authenticator|enrol-mfa|member-form="mfa"/i);
 const login=renderMemberPage({path:'/login',lang:'en'});assert.match(login,/href="\/reset-password"/);
});

test('claim form requires only source, email and code, with no required supporting text',()=>{
 const page=renderMemberPage({path:'/source-workspace',params:new URLSearchParams({claim:'sample'}),sources:[{id:'sample',name:'Sample source'}]});
 assert.match(page,/name="email"[^>]+required/);assert.match(page,/data-claim-step="email"/);assert.doesNotMatch(page,/name="token"/);
 const previous=globalThis.sessionStorage;globalThis.sessionStorage={getItem:()=>JSON.stringify({email:'editor@example.org',sentTo:'editor@example.org',evidence:'x'})};
 const codePage=renderMemberPage({path:'/source-workspace',params:new URLSearchParams({claim:'draft-source'}),sources:[{id:'draft-source',name:'Draft source'}]});globalThis.sessionStorage=previous;
 assert.match(codePage,/name="token"[^>]+required/);assert.match(codePage,/data-claim-step="code"/);
 assert.doesNotMatch(page,/<textarea name="evidence"[^>]*(?:required|minlength)/);
 assert.doesNotMatch(page,/<input name="evidenceUrl"[^>]*required/);
 assert.match(codePage,/Your form stays here/);assert.match(codePage,/Send claim/);
 const widget=renderContributionWidget({id:'sample'});assert.equal((widget.match(/data-rate="/g)||[]).length,5);assert.doesNotMatch(widget,/Save rating|rating-editor/);
});


test('a successful write followed by a failed refresh remains a confirmed success',async()=>{
 let writes=0;const result=await completeMutation({submit:async()=>{writes++;return {claim:{id:'recorded'}};},refresh:async()=>{throw Object.assign(Error('admin denied'),{status:403});}});
 assert.equal(writes,1);assert.equal(result.refreshPending,true);assert.equal(result.result.claim.id,'recorded');
});
test('a lost write response checks stored state before deciding the result',async()=>{
 let checked=0;const result=await completeMutation({submit:async()=>{throw Error('response lost');},confirm:async()=>{checked++;return true;}});assert.equal(checked,1);assert.equal(result.confirmed,true);
 await assert.rejects(completeMutation({submit:async()=>{throw Error('offline');},confirm:async()=>false}),e=>e.uncertain===true);
 const denied=Object.assign(Error('denied'),{status:403});await assert.rejects(completeMutation({submit:async()=>{throw denied;},confirm:async()=>{throw Error('must not read');}}),e=>e===denied&&!e.uncertain);
});
test('pending and approved claimants see their status instead of another claim form',async t=>{
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
 for(const managed of [false,true]){
  globalThis.fetch=async path=>Response.json(path==='/api/status'?{configured:true,email:true}:{user:{id:'claimant',emailConfirmed:true},managedSources:managed?[{slug:'claimed-source'}]:[],claims:[{slug:'claimed-source',name:'Claimed source',state:managed?'accepted':'review'}]});
  await initialiseMembers({refresh:true});const html=renderMemberPage({path:'/source-workspace',params:new URLSearchParams({claim:'claimed-source'}),sources:[{id:'claimed-source',name:'Claimed source'}]});
  assert.doesNotMatch(html,/data-member-form="claim"/);assert.match(html,managed?/You manage this source/:/Awaiting review/);
 }
});
test('approved source owners can propose every extended field and settings keep account proofs separate',async t=>{
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});globalThis.fetch=async path=>Response.json(path==='/api/status'?{configured:true,email:true}:{user:{id:'owner',email:'owner@example.org',emailConfirmed:true},managedSources:[{slug:'extended-source',role:'owner'}]});await initialiseMembers({refresh:true});
 const page=renderMemberPage({path:'/source-workspace',params:new URLSearchParams({edit:'extended-source'}),sources:[{id:'extended-source',name:'Extended source',about:'A descriptive public source summary.',url:'https://example.org',country:'United Kingdom',languages:['English'],content:['Original research'],topics:[],methods:[],contactEmail:'public@example.org'}]});
 for(const name of ['url','contactName','contactEmail','contactPage','social','logoUrl','portraitUrl','portraitSourceUrl','country','languages','imagePermission','removeLogo','removePortrait'])assert.match(page,new RegExp('name="'+name+'"'));
 assert.match(page,/value="public@example.org"/);assert.match(page,/value="English" selected/);assert.match(page,/administrator reviews/i);
 const settings=renderMemberPage({path:'/account'});assert.match(settings,/Download my account and saved sources/);assert.match(settings,/data-member-form="account-deletion"/);assert.match(settings,/Code from current email/);assert.match(settings,/Code from new email/);assert.match(settings,/does not immediately delete/);
});
test('recovery verified in the cookie-backed session survives a reload of the reset screen',async t=>{
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});globalThis.fetch=async path=>Response.json(path==='/api/status'?{configured:true,email:true}:{user:{id:'recovering',emailConfirmed:true},recoveryVerified:true});await initialiseMembers({refresh:true});const html=renderMemberPage({path:'/reset-password'});assert.match(html,/Save new password/);assert.doesNotMatch(html,/Send password-reset email/);
});
