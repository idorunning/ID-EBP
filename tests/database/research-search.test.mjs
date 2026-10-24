import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../helpers/database.mjs';
import {researchSearchBody} from '../../backend/research.mjs';

export async function searchFixture(){
 const db=new PGlite();await db.waitReady;
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema private;grant usage on schema private,public to service_role;grant usage on schema public to anon,authenticated;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
 for(const file of ['20261024020000_research_catalogue.sql','20261024020430_topic_hybrid_search.sql','20261024022002_improve_search_relevance.sql','20261024023325_refine_search_catalogue_text.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 const fixtures=[
 ['da','Domestic violence prevention','Programmes to reduce repeated assaults.',['domestic abuse'],'alpha'],
 ['ipv','Intimate partner violence','Evaluation of an intervention to reduce abuse.',['partner violence'],'alpha'],
 ['control','Coercive control','Patterns of coercive and controlling behaviour.',[],'beta'],
 ['burglary','Housebreaking prevention','Preventing repeat residential burglary using target hardening.',[],'alpha'],
 ['burglary2','Burglary of commercial premises','Security at business premises.',[],'beta'],
 ['robbery','Street robbery','Armed robbery and muggings.',[],'alpha'],
 ['unrelated','Domestic cats','Veterinary care for pets.',[],'beta'],
 ['boilerplate','Survey methodology','Stage 2 inventory record: this research/resource was identified from a publicly accessible source page. Item-level review has not yet been performed.',[],'beta'],
 ['author','Analysis of witness recall','Cognitive interview methods.',[],'alpha'],
 ['meaning','Protecting former partners from recurrent assaults','Reducing repeated harm in abusive relationships.',[],'alpha']
 ];
 for(const [id,title,summary,tags,source] of fixtures)await db.query('insert into public.research_records(id,source,source_slug,title,url,summary,tags,authors) values($1,$2,$2,$3,$4,$5,$6,$7)',[id,source,title,'https://fixture.test/'+id,summary,tags,id==='author'?'Alice Smith':'']);
 return db;
}
function args(query,other={}){const p=new URLSearchParams({q:query,...other});return researchSearchBody(p).body;}
async function search(db,query,other={},embedding=null){const b=args(query,other);return (await db.query('select public.search_research_v2($1,$2,$3,$4,$5,$6,$7) as result',[b.q,b.selected_tags,b.page_number,b.source_filter,JSON.stringify(b.search_plan),embedding?JSON.stringify(embedding):null,b.exact_match])).rows[0].result;}

test('topic and meaning search retrieves expected records while retaining boundaries and access controls',async t=>{
 const db=await searchFixture();t.after(()=>db.close());
 await t.test('DA, DV, domestic and full phrases share direct results',async()=>{
 const expected=(await search(db,'domestic abuse')).results.map(r=>r.id).sort();assert.ok(expected.includes('da'));assert.ok(expected.includes('ipv'));assert.ok(expected.includes('control'));
 for(const q of ['DA','DV','domestic','domestic violence','domestic viiolence'])assert.deepEqual((await search(db,q)).results.map(r=>r.id).sort(),expected,q);
 assert.ok(!expected.includes('burglary'));assert.ok(!expected.includes('unrelated'));
 });
 await t.test('burglary variants find housebreaking and never silently become robbery',async()=>{
 for(const q of ['burglary','burgulary','burglaries']){const ids=(await search(db,q)).results.map(r=>r.id);assert.ok(ids.includes('burglary'));assert.ok(ids.includes('burglary2'));assert.ok(!ids.includes('robbery'));}
 const ids=(await search(db,'domestic burglary')).results.map(r=>r.id);assert.deepEqual(ids,['burglary']);
 });
 await t.test('questions preserve topic and rank intervention evidence',async()=>{
 const result=await search(db,'how to reduce domestic violence');assert.ok(result.results.slice(0,2).some(r=>r.id==='da'));assert.ok(result.results.every(r=>!['burglary','robbery'].includes(r.id)));
 });
 await t.test('tags use shared topics, source filters remain strict and authors remain searchable',async()=>{
 assert.equal((await search(db,'',{tag:'DA',source:'beta'})).results[0].id,'control');
 assert.deepEqual((await search(db,'Alice Smith')).results.map(r=>r.id),['author']);
 });
 await t.test('literal mode does not expand abbreviations or quoted phrases',async()=>{
 assert.equal((await search(db,'DA',{exact:'1'})).total,0);
 assert.deepEqual((await search(db,'"domestic violence"')).results.map(r=>r.id),['da']);
 assert.equal((await search(db,'inventory record')).total,0);
 });
 await t.test('sparse acronym records match their subject without matching unrelated words',async()=>{
 await db.query("insert into public.research_records(id,source,source_slug,title,url,summary) values ('acronym-ipv','alpha','alpha','Responding to IPV','https://fixture.test/ipv','Public repository metadata entry. Eligibility and the underlying publication have not been verified.'),('acronym-da','alpha','alpha','DA Matters: Police responders training initial report','https://fixture.test/da','Publisher-listed resource. Metadata recorded for discovery; independent evidence appraisal pending.'),('data','alpha','alpha','Data analysis','https://fixture.test/data','')");
 const ids=(await search(db,'domestic')).results.map(r=>r.id);assert.ok(ids.includes('acronym-ipv'));assert.ok(ids.includes('acronym-da'));assert.ok(!ids.includes('data'));
 const indexed=(await db.query("select embedding_text from public.research_search_documents where record_id in ('acronym-ipv','acronym-da')")).rows;
 assert.ok(indexed.every(r=>!r.embedding_text.includes('Metadata recorded')&&!r.embedding_text.includes('metadata entry')));
 });
 await t.test('meaning results are genuine stored vectors and cannot bypass filters',async()=>{
 const vector=Array(384).fill(0);vector[0]=1;
 await db.query("update public.research_search_documents set embedding=$1,embedding_model='@cf/baai/bge-small-en-v1.5:cls:v1' where record_id='meaning'",[JSON.stringify(vector)]);
 const result=await search(db,'protect people after separation',{},vector);assert.ok(result.results.some(r=>r.id==='meaning'&&r.match_type==='meaning'));
 assert.equal((await search(db,'protect people after separation',{source:'beta'},vector)).total,0);
 assert.equal((await search(db,'domestic burglary',{},vector)).results.some(r=>r.id==='meaning'),false);
 });
 await t.test('editing metadata invalidates vectors and stale jobs cannot overwrite new text',async()=>{
 const jobs=(await db.query('select public.research_index_take(1) as b')).rows[0].b.jobs;assert.equal(jobs.length,1);const j=jobs[0];
 await db.query('update public.research_records set title=title||$1 where id=$2',[' updated',j.id]);
 const vector=Array(384).fill(0);vector[0]=1;
 const done=(await db.query('select public.research_index_complete($1) as b',[JSON.stringify([{...j,embedding:vector}])])).rows[0].b;assert.equal(done.completed,0);
 });
 await t.test('anonymous users can search but cannot mutate records, index or jobs',async()=>{
 await db.exec('set role anon');assert.ok((await search(db,'DA')).total>0);
 for(const q of ["delete from public.research_search_documents","select public.research_index_take(1)","select public.research_reindex('',1)","select * from private.research_index_jobs"])await assert.rejects(db.query(q),{code:'42501'});
 await db.exec('reset role');
 });
 await t.test('pagination is complete, deterministic and clamps out-of-range pages',async()=>{
 for(let i=0;i<43;i++)await db.query("insert into public.research_records(id,source,source_slug,title,url) values($1,'pages','pages','Burglary test','https://fixture.test/pages')",['page'+String(i).padStart(3,'0')]);
 const ids=[];for(let i=1;i<=3;i++)ids.push(...(await search(db,'burglary',{source:'pages',page:String(i)})).results.map(r=>r.id));assert.equal(new Set(ids).size,43);assert.equal((await search(db,'burglary',{source:'pages',page:'99'})).page,3);
 });
});
