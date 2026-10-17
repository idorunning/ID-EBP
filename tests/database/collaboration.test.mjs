import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const ids={member:'10000000-0000-4000-8000-000000000001',owner:'10000000-0000-4000-8000-000000000002',other:'10000000-0000-4000-8000-000000000003',admin:'10000000-0000-4000-8000-000000000004',unconfirmed:'10000000-0000-4000-8000-000000000005'};
const session=id=>id.replace(/^1/,'2');
test('member collaboration authorisation, review and rating integrity',async t=>{
  const db=new PGlite();await db.waitReady;t.after(()=>db.close());
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,created_at timestamptz default now(),last_sign_in_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
    grant usage on schema public,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
  const folder=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
  for(const [name,id] of Object.entries(ids)){
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[id,name==='owner'?'researcher@university.test':name+'@mail.test',name==='unconfirmed'?null:new Date().toISOString()]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session(id),id]);
  }
  const source=(await db.query(`insert into public.sources(slug,name,website_url,canonical_domain,about,country_code,kinds,content_types,research_languages,access_type,status)
    values('university-fixture','University research','https://university.test/research','university.test','Published research from a test university.','GB',array['University'],array['Original research'],array['en'],'free','published') returning id`)).rows[0].id;
  await db.query('insert into public.source_signals(source_id) values($1)',[source]);
  await db.query("insert into private.admin_roles(user_id,state,must_set_password) values($1,'active',false)",[ids.admin]);
  const rpc=async(action,payload={},name='member',aal='aal1',overrideSession)=>{
    await db.exec('begin;set local role service_role;');
    try{const result=(await db.query('select public.directory_api($1,$2,$3,$4,$5) as result',[action,JSON.stringify(payload),name?ids[name]:null,name?(overrideSession||session(ids[name])):null,aal])).rows[0].result;await db.exec('commit');return result;}catch(error){await db.exec('rollback');throw error;}
  };
  await t.test('public clients cannot call privileged functions or read private member records',async()=>{
    for(const role of ['anon','authenticated']){
      assert.equal((await db.query("select has_function_privilege($1,'public.directory_api(text,jsonb,uuid,uuid,text)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
      await db.exec('begin;set local role '+role+';');
      await assert.rejects(db.query('select * from private.source_ratings'),{code:'42501'});await db.exec('rollback');
    }
  });
  await t.test('server-verified identity also requires confirmed account, live session and active membership',async()=>{
    await assert.rejects(rpc('session',{},'unconfirmed'),{code:'42501'});
    await assert.rejects(rpc('session',{},'member','aal1',session(ids.owner)),{code:'42501'});
    await db.query("insert into private.member_profiles(user_id,state) values($1,'suspended')",[ids.other]);
    await assert.rejects(rpc('session',{},'other'),{code:'42501'});
    await db.query("update private.member_profiles set state='active' where user_id=$1",[ids.other]);
    assert.equal((await rpc('session')).admin,false);
  });
  await t.test('zero is a rating, upsert does not duplicate and removal restores unrated null',async()=>{
    let result=await rpc('rate_source',{slug:'university-fixture',stars:0});assert.deepEqual(result.rating,{average:0,count:1,own:0});
    result=await rpc('rate_source',{slug:'university-fixture',stars:5});assert.deepEqual(result.rating,{average:5,count:1,own:5});
    result=await rpc('rate_source',{slug:'university-fixture',stars:3},'other');assert.equal(result.rating.average,4);assert.equal(result.rating.count,2);
    await assert.rejects(rpc('rate_source',{slug:'university-fixture',stars:5.1}),{code:'22023'});
    await rpc('remove_rating',{slug:'university-fixture'},'other');result=await rpc('remove_rating',{slug:'university-fixture'});assert.deepEqual(result.rating,{average:null,count:0,own:null});
  });
  await t.test('tags stay private until an approved administrator publishes them',async()=>{
    const tag=await rpc('suggest_tag',{slug:'university-fixture',label:'  Procedural   justice  '});assert.equal(tag.suggestion.label,'Procedural justice');
    assert.deepEqual((await rpc('community',{},null)).sources['university-fixture'].tags,[]);
    await assert.rejects(rpc('admin_review'),{code:'42501'});
    assert.ok((await rpc('admin_review',{},'admin')).tags);
    await rpc('moderate',{kind:'tag',id:tag.suggestion.id,decision:'approve',reason:'Relevant public research topic'},'admin','aal2');
    assert.deepEqual((await rpc('community',{},null)).sources['university-fixture'].tags,['Procedural justice']);
    await assert.rejects(rpc('suggest_tag',{slug:'university-fixture',label:'<script>bad</script>'}),{code:'22023'});
    await assert.rejects(rpc('suggest_tag',{slug:'university-fixture',label:'Visit https://spam.test'}),{code:'22023'});
  });
  await t.test('AI descriptions are explicitly labelled, bound to current public text and separate from human translations',async()=>{
    await db.query(`insert into public.source_ai_translations(source_id,locale,about,original_about) values
      ($1,'fr','Description de recherche assistée par IA.','Published research from a test university.'),
      ($1,'es','Descripción antigua.','A former English description.')`,[source]);
    await db.exec('begin;set local role anon;');
    const visible=(await db.query('select locale,origin from public.source_ai_translations')).rows;
    await db.exec('rollback');assert.deepEqual(visible,[{locale:'fr',origin:'ai_translation'}]);
    let translated=(await rpc('community',{},null)).sources['university-fixture'].profile.translations;
    assert.equal(translated.fr.origin,'ai_translation');assert.equal(translated.es,undefined);
    await db.query("insert into public.source_translations(source_id,locale,about,origin,reviewed_at) values($1,'fr','Human-reviewed source description.','human_translation',now())",[source]);
    translated=(await rpc('community',{},null)).sources['university-fixture'].profile.translations;
    assert.equal(translated.fr.origin,'human_translation');
    await assert.rejects(db.query("insert into public.source_translations(source_id,locale,about,origin,reviewed_at) values($1,'de','AI text cannot use the human/source table.','ai_translation',now())",[source]),{code:'23514'});
    await assert.rejects(db.query("update public.source_ai_translations set origin='human_translation' where source_id=$1",[source]),{code:'23514'});
  });
  await t.test('claims require mailbox proof and admin review while supporting details are optional',async()=>{
    const evidence={slug:'university-fixture',mailboxVerified:true,contactEmail:'researcher@university.test',evidence:'I lead this research team. My official staff page confirms my responsibility.',evidenceUrl:'https://university.test/staff/researcher'};
    await assert.rejects(rpc('claim_source',{slug:'university-fixture'}),{code:'22023'});
    const pending=await rpc('claim_source',evidence);assert.equal(pending.claim.state,'review');
    assert.equal((await rpc('session')).managedSources.length,0);
    await db.query("update auth.users set email='student@university.test' where id=$1",[ids.other]);
    const domainOnly=await rpc('claim_source',evidence,'other');assert.equal(domainOnly.claim.state,'review');
    let community=(await rpc('community',{},null)).sources['university-fixture'];assert.equal(community.domainConfirmed,false);assert.equal(community.organisationConfirmed,false);
    assert.equal((await rpc('session',{},'other')).managedSources.length,0);
    await db.query("insert into private.source_contacts(source_id,contact_email) values($1,'researcher@university.test')",[source]);
    await rpc('rate_source',{slug:'university-fixture',stars:5},'owner');
    const claim=await rpc('claim_source',evidence,'owner');assert.equal(claim.claim.state,'review');
    assert.equal((await rpc('session',{},'owner')).managedSources.length,0);
    await assert.rejects(rpc('moderate',{kind:'claim',id:claim.claim.id,decision:'approve',reason:'Email matches'},'admin','aal2'),{code:'22023'});
    await rpc('moderate',{kind:'claim',id:claim.claim.id,decision:'approve',reason:'Authority confirmed independently with published research director',verificationUrl:'https://university.test/staff/researcher',independentCheck:true},'admin','aal2');
    assert.equal((await rpc('session',{},'owner')).managedSources.length,1);
    community=(await rpc('community',{},null)).sources['university-fixture'];assert.equal(community.domainConfirmed,true);assert.equal(community.organisationConfirmed,true);assert.equal(community.ratingCount,0);
    await assert.rejects(rpc('rate_source',{slug:'university-fixture',stars:5},'owner'),{code:'42501'});
    assert.equal((await rpc('session',{},'other')).claims[0].state,'review');
  });
  await t.test('source edits are constrained, audited, owner-only and reviewed before publication',async()=>{
    const profile={name:'University research updated',about:'Updated public description of published university research.',topics:['Problem-solving'],methods:['Trial'],contentTypes:['Original research']};
    await assert.rejects(rpc('edit_profile',{slug:'university-fixture',profile}),{code:'42501'});
    await assert.rejects(rpc('edit_profile',{slug:'university-fixture',profile:{...profile,domainConfirmed:true}},'owner'),{code:'22023'});
    for(const field of ['topics','methods','contentTypes'])await assert.rejects(rpc('edit_profile',{slug:'university-fixture',profile:{...profile,[field]:[null]}},'owner'),{code:'22023'});
    assert.equal((await rpc('edit_profile',{slug:'university-fixture',profile},'owner')).state,'review');
    assert.equal((await rpc('profile',{slug:'university-fixture'},null)).profile.name,'University research');
    const queue=await rpc('admin_review',{},'admin','aal2');
    await rpc('moderate',{kind:'revision',id:queue.revisions[0].id,decision:'approve',reason:'Confirmed the revised public description'},'admin','aal2');
    assert.equal((await rpc('profile',{slug:'university-fixture'},null)).profile.name,profile.name);
    assert.deepEqual((await rpc('community',{},null)).sources['university-fixture'].profile.translations,{});
    assert.ok((await db.query("select count(*)::int as count from private.audit_events where action='edit_profile'")).rows[0].count>0);
  });
  await t.test('new submissions require review and confer no automatic ownership',async()=>{
    const submitted=await rpc('submit_source',{name:'Another research centre',url:'https://centre.test/research',about:'A university research centre with publicly available policing research.',country:'GB',languages:['en'],types:['University']});
    assert.equal(submitted.submission.state,'review');
    await rpc('moderate',{kind:'submission',id:submitted.submission.id,decision:'approve',reason:'Checked the public centre and its research'},'admin','aal2');
    assert.equal((await db.query("select count(*)::int as count from public.sources where canonical_domain='centre.test' and status='published'")).rows[0].count,1);
    assert.equal((await rpc('session')).managedSources.length,0);
    await assert.rejects(rpc('submit_source',{name:'Bad source',url:'javascript:alert(1)',about:'This source has an invalid website URL.',country:'GB',languages:['en'],types:['Academic']}),{code:'22023'});
    const valid={name:'Null-array source',url:'https://safe.test/research',about:'A sufficiently long public source description.',country:'GB',languages:['en'],types:['University'],contentTypes:['Original research'],topics:[]};
    for(const field of ['languages','types','contentTypes','topics']){
      for(const invalid of [null,7,{bad:'object'}])await assert.rejects(rpc('submit_source',{...valid,[field]:[invalid]}),{code:'22023'});
    }
  });
  await t.test('rate limiting persists across API instances and expires by server time',async()=>{
    await rpc('rate_limit',{key:'local-fixture:opaque-hash',limit:2,seconds:3600},null);
    await rpc('rate_limit',{key:'local-fixture:opaque-hash',limit:2,seconds:3600},null);
    await assert.rejects(rpc('rate_limit',{key:'local-fixture:opaque-hash',limit:2,seconds:3600},null),error=>error.message==='rate_limited');
  });
  await t.test('owners can invite verified editors for only their own source; editors cannot delegate',async()=>{
    await assert.rejects(rpc('invite_editor',{slug:'university-fixture',email:'student@university.test'}),{code:'42501'});
    await rpc('invite_editor',{slug:'university-fixture',email:'student@university.test'},'owner');
    const invitation=(await rpc('session',{},'other')).teamInvitations[0];assert.ok(invitation);
    await assert.rejects(rpc('accept_editor',{slug:'university-fixture',invitationId:invitation.id}),{code:'42501'});
    await rpc('accept_editor',{slug:'university-fixture',invitationId:invitation.id},'other');
    assert.equal((await rpc('session',{},'other')).managedSources[0].role,'editor');
    await assert.rejects(rpc('invite_editor',{slug:'university-fixture',email:'someone@mail.test'},'other'),{code:'42501'});
    await rpc('revoke_editor',{slug:'university-fixture',userId:ids.other},'owner');
    assert.equal((await rpc('session',{},'other')).managedSources.length,0);
    await db.query("update auth.users set email='changed@university.test' where id=$1",[ids.owner]);
    assert.equal((await rpc('session',{},'owner')).managedSources.length,0);
    await assert.rejects(rpc('invite_editor',{slug:'university-fixture',email:'student@university.test'},'owner'),{code:'42501'});
    await db.query("update auth.users set email='researcher@university.test' where id=$1",[ids.owner]);
  });
  await t.test('admin rights require a private invitation, confirmed mailbox and initial password change',async()=>{
    assert.equal((await rpc('session',{},'other')).admin,false);
    await db.query("insert into private.admin_invitations(email) values('student@university.test')");
    const accepted=await rpc('session',{},'other');assert.equal(accepted.admin,true);assert.equal(accepted.mfaRequired,undefined);
    assert.equal(accepted.passwordChangeRequired,true);
    await assert.rejects(rpc('admin_review',{},'other'),error=>error.message==='password_change_required');
    await rpc('password_changed',{},'other');
    assert.ok((await rpc('admin_review',{},'other')).tags);
    assert.ok((await rpc('admin_people',{},'other')).members);
    await assert.rejects(rpc('admin_people',{},'member'),{code:'42501'});
    assert.equal((await db.query("select state from private.admin_invitations where email='student@university.test'")).rows[0].state,'accepted');
  });
  await t.test('admin may review their own mailbox-verified claim; rich reports remain admin-only',async()=>{
    const ownSource=(await db.query(`insert into public.sources(slug,name,website_url,canonical_domain,about,country_code,kinds,content_types,research_languages,access_type,status) values('admin-source','Admin source','https://admin-source.test','admin-source.test','Public administrator source.','GB',array['Blog'],array['Commentary'],array['en'],'free','published') returning id`)).rows[0].id;
    await db.query('insert into public.source_signals(source_id) values($1)',[ownSource]);
    const claim=await rpc('claim_source',{slug:'admin-source',mailboxVerified:true,contactEmail:'editor@admin-source.test'},'admin');
    await rpc('moderate',{kind:'claim',id:claim.claim.id,decision:'approve',reason:'',verificationUrl:'https://admin-source.test/about',independentCheck:true},'admin');
    const source=(await rpc('admin_sources',{},'admin')).sources.find(s=>s.slug==='admin-source');assert.equal(source.verified,true);assert.equal(source.representatives[0].contactEmail,'editor@admin-source.test');assert.equal(source.verifications[0].verifiedBy,'admin@mail.test');assert.ok(source.verifications[0].verifiedAt);
    for(const action of ['admin_sources','admin_people','admin_analytics'])await assert.rejects(rpc(action,{},'member'),{code:'42501'});
    assert.ok((await rpc('admin_people',{},'admin')).members.find(m=>m.id===ids.admin).createdAt);
    await db.query("update auth.users set email='changed-admin@mail.test' where id=$1",[ids.admin]);
    assert.equal((await rpc('community',{},null)).sources['admin-source'].organisationConfirmed,false);
    await db.query("update auth.users set email='admin@mail.test' where id=$1",[ids.admin]);
  });
  await t.test('account collections merge, persist and isolate users without exposing hidden sources',async()=>{
    assert.deepEqual((await rpc('saved_sources')).saved,[]);
    await rpc('import_saved_sources',{slugs:['university-fixture','university-fixture','unknown-source']});
    assert.deepEqual((await rpc('saved_sources')).saved,['university-fixture']);
    await rpc('save_source',{slug:'admin-source'});await rpc('save_source',{slug:'admin-source'});
    assert.equal((await rpc('saved_sources')).saved.length,2);
    assert.deepEqual((await rpc('saved_sources',{},'other')).saved,[]);
    await rpc('remove_saved_source',{slug:'university-fixture'},'other');assert.equal((await rpc('saved_sources')).saved.length,2);
    await rpc('remove_saved_source',{slug:'university-fixture'});await rpc('remove_saved_source',{slug:'university-fixture'});
    assert.deepEqual((await rpc('saved_sources')).saved,['admin-source']);
    await assert.rejects(rpc('saved_sources',{},null),{code:'42501'});
    await assert.rejects(rpc('saved_sources',{},'member','aal1',session(ids.owner)),{code:'42501'});
    for(const slugs of [null,{},[null],[7],['<script>'],Array(201).fill('university-fixture')])await assert.rejects(rpc('import_saved_sources',{slugs}),{code:'22023'});
    await db.query("update public.sources set status='hidden' where id=$1",[source]);
    await assert.rejects(rpc('save_source',{slug:'university-fixture'}),{code:'P0002'});
    await rpc('import_saved_sources',{slugs:['university-fixture']});assert.deepEqual((await rpc('saved_sources')).saved,['admin-source']);
    await db.query("update public.sources set status='published' where id=$1",[source]);
    await assert.rejects(rpc('review_status',{kind:'claim',id:'00000000-0000-4000-8000-000000000000'}),{code:'42501'});
  });
  await t.test('extended source changes stay private until scoped review and preserve core revision integrity',async()=>{
    const profile={name:'University research',about:'A reviewed source description with public professional information.',publisher:'University',topics:[],methods:[],contentTypes:['Original research'],url:'https://university.test/new',country:'FR',languages:['fr','en'],publicDetails:{contactName:'Public editor',contactEmail:'public@university.test',social:['https://social.test/profile'],logoUrl:'https://university.test/logo.png',portraitUrl:'https://university.test/person.jpg',portraitSourceUrl:'https://university.test/team',imagePermission:true}};
    await assert.rejects(rpc('edit_profile',{slug:'university-fixture',profile}),{code:'42501'});
    const edited=await rpc('edit_profile',{slug:'university-fixture',profile},'owner');assert.ok(edited.revisionId);
    let live=(await rpc('community',{},null)).sources['university-fixture'].profile;assert.notEqual(live.country,'FR');assert.equal(live.publicDetails.contactEmail,undefined);
    await rpc('moderate',{kind:'revision',id:edited.revisionId,decision:'approve',reason:'Public fields and permission independently checked'},'admin');
    live=(await rpc('community',{},null)).sources['university-fixture'].profile;assert.equal(live.country,'FR');assert.equal(live.url,profile.url);assert.deepEqual(live.languages,['fr','en']);assert.equal(live.publicDetails.contactEmail,'public@university.test');assert.equal(live.publicDetails.summaryGenerated,false);
    assert.equal((await rpc('review_status',{kind:'revision',id:edited.revisionId},'admin')).state,'applied');
    await assert.rejects(rpc('edit_profile',{slug:'university-fixture',profile:{...profile,publicDetails:{logoUrl:'https://university.test/logo.png',imagePermission:false}}},'owner'),{code:'22023'});
  });
  await t.test('duplicate decisions redirect and preserve records, can be undone, and cannot be made by members',async()=>{
    await rpc('save_source',{slug:'university-fixture'});
    await assert.rejects(rpc('admin_manage',{operation:'merge_duplicate',slug:'university-fixture',targetSlug:'admin-source',reason:'Reviewed duplicate relationship'}),{code:'42501'});
    await rpc('admin_manage',{operation:'merge_duplicate',slug:'university-fixture',targetSlug:'admin-source',reason:'Reviewed duplicate relationship'},'admin');
    let live=await rpc('community',{},null);assert.equal(live.sources['university-fixture'],undefined);assert.equal(live.redirects['university-fixture'],'admin-source');assert.ok((await rpc('saved_sources')).saved.includes('admin-source'));
    await assert.rejects(rpc('admin_manage',{operation:'publish_source',slug:'university-fixture',reason:'Cannot bypass duplicate decision'},'admin'),{code:'22023'});
    await rpc('admin_manage',{operation:'undo_duplicate',slug:'university-fixture',reason:'Separate collections confirmed by review'},'admin');live=await rpc('community',{},null);assert.ok(live.sources['university-fixture']);assert.equal(live.redirects['university-fixture'],undefined);
  });
  await t.test('account export is scoped and email/deletion proofs expire and limit wrong attempts',async()=>{
    await rpc('account_update',{displayName:'Updated member name'});assert.equal((await rpc('session')).displayName,'Updated member name');const exported=await rpc('account_export');assert.equal(exported.email,'member@mail.test');assert.ok(Array.isArray(exported.savedSources));assert.equal(exported.profile.displayName,'Updated member name');
    const hash='a'.repeat(64),wrong='b'.repeat(64);await rpc('account_challenge',{kind:'deletion',targetEmail:'member@mail.test',hash});
    await assert.rejects(rpc('account_delete_request'),{code:'42501'});for(let n=0;n<5;n++)assert.equal((await rpc('account_verify',{kind:'deletion',hash:wrong})).verified,false);assert.equal((await rpc('account_verify',{kind:'deletion',hash})).verified,false);
    await rpc('account_challenge',{kind:'deletion',targetEmail:'member@mail.test',hash});await db.query("update private.member_challenges set expires_at=now()-interval '1 second' where user_id=$1",[ids.member]);assert.equal((await rpc('account_verify',{kind:'deletion',hash})).verified,false);
    await rpc('account_challenge',{kind:'deletion',targetEmail:'member@mail.test',hash});assert.equal((await rpc('account_verify',{kind:'deletion',hash})).verified,true);assert.equal((await rpc('account_delete_request')).requested,true);assert.equal((await rpc('session')).deletionRequested,true);assert.ok((await rpc('admin_workflows',{},'admin')).accountRequests.some(r=>r.email==='member@mail.test'));
    await rpc('account_challenge',{kind:'email_current',targetEmail:'member@mail.test',hash});await rpc('account_challenge',{kind:'email_new',targetEmail:'new@mail.test',hash});await rpc('account_verify',{kind:'email_current',hash});await assert.rejects(rpc('account_email_ready'),{code:'42501'});await rpc('account_verify',{kind:'email_new',hash});assert.equal((await rpc('account_email_ready')).email,'new@mail.test');
  });
  await t.test('ownership replacement requires independent checks and revokes previous source access atomically',async()=>{
    const claim={claim:(await rpc('session')).claims.find(c=>c.slug==='university-fixture'&&['pending','review'].includes(c.state))};assert.ok(claim.claim);
    const operation={operation:'resolve_ownership',slug:'university-fixture',claimId:claim.claim.id,reason:'Replacement representative independently checked',verificationUrl:'https://university.test/team'};
    await assert.rejects(rpc('admin_manage',operation,'admin'),{code:'22023'});assert.ok((await rpc('session',{},'owner')).managedSources.some(s=>s.slug==='university-fixture'));
    await rpc('admin_manage',{...operation,independentCheck:true},'admin');assert.equal((await rpc('session',{},'owner')).managedSources.some(s=>s.slug==='university-fixture'),false);assert.ok((await rpc('session')).managedSources.some(s=>s.slug==='university-fixture'&&s.role==='owner'));await rpc('admin_manage',{operation:'revoke_manager',slug:'university-fixture',userId:ids.member,reason:'End scoped replacement fixture access'},'admin');
  });
  await t.test('member reinstatement restores contribution access without resurrecting source roles',async()=>{
    await rpc('admin_manage',{operation:'suspend_member',userId:ids.owner,reason:'Temporary local fixture suspension'},'admin');await assert.rejects(rpc('session',{},'owner'),{code:'42501'});
    await rpc('admin_manage',{operation:'reinstate_member',userId:ids.owner,reason:'Independent reinstatement review complete'},'admin');assert.deepEqual((await rpc('session',{},'owner')).managedSources,[]);
  });
  await t.test('maintenance and notification leases do not duplicate work and publish only safe check status',async()=>{
    const notifications=(await rpc('admin_workflows',{},'admin')).notifications;assert.ok(notifications.some(n=>n.event_key.startsWith('claim-receipt:')));assert.ok(notifications.some(n=>n.event_key.startsWith('claim-decision:')));assert.ok(notifications.some(n=>n.event_key.startsWith('editor-invitation:')));
    const batch=await rpc('outbox_take',{},null);assert.ok(batch.messages.length);assert.equal((await rpc('outbox_take',{},null)).messages.length,0);const message=batch.messages[0];await rpc('outbox_complete',{id:message.id,lease:message.lease,sent:true},null);
    await db.query("update private.workflow_outbox set leased_at=now()-interval '16 minutes' where state='sending'");await rpc('outbox_take',{},null);assert.ok((await rpc('admin_workflows',{},'admin')).notifications.some(n=>n.state==='uncertain'));
    const jobs=await rpc('maintenance_take',{},null);assert.ok(jobs.jobs.length);assert.equal((await rpc('maintenance_take',{},null)).jobs.length,0);const job=jobs.jobs.find(j=>j.slug==='university-fixture');assert.ok(job);
    await rpc('maintenance_complete',{id:job.id,lease:job.lease,result:{status:'working',httpStatus:200,suggestions:{publicEmails:['draft@public.test']}}},null);const live=(await rpc('community',{},null)).sources['university-fixture'].profile;assert.equal(live.linkAudit.status,'working');assert.equal(live.linkAudit.suggestions,undefined);assert.equal(live.publicDetails.contactEmail,'public@university.test');assert.equal((await rpc('maintenance_complete',{id:job.id,lease:job.lease,result:{}},null)).updated,false);
  });
  await t.test('deleting a member removes their rating from public aggregates',async()=>{
    await rpc('rate_source',{slug:'university-fixture',stars:0},'member');
    await db.query('delete from auth.sessions where user_id=$1',[ids.member]);
    await db.query('delete from auth.users where id=$1',[ids.member]);
    const aggregate=(await rpc('community',{},null)).sources['university-fixture'];assert.equal(aggregate.ratingAverage,null);assert.equal(aggregate.ratingCount,0);
  });
});
