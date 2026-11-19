import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { applySql, reportSql, stageSql, validateReviews } from '../../scripts/advance-research-stages.mjs';

const url = 'https://example.org/research/article';
const fields = ['title','authors','year','source','summary','tags','url'];
const now = Date.now();

test('invalid evidence, duplicate IDs and stale final link checks are rejected', () => {
  const item={id:'record',fingerprint:'a'.repeat(32),reviewer:'Reviewer',
    evidence:Object.fromEntries(fields.map(field=>[field,url]))};
  assert.throws(()=>validateReviews([item,item]),/unique record ID/);
  assert.throws(()=>validateReviews([{...item,evidence:{...item.evidence,title:'file:///tmp/proof'}}]),/title/);
  assert.throws(()=>validateReviews([{...item,final:{
    relevance_evidence:url,checked_url:url,duplicate_reviewed:true,
    link_verified_at:new Date(now-8*86400000).toISOString()
  }}],now),/last seven days/);
});

test('assurance advances only evidenced records and repeat runs preserve the same checkpoint',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create schema private;
      create table public.research_records(id text primary key,title text,url text,authors text,year int,source text,
        source_slug text,summary text,tags text[],kind_std text,related_terms text,doi text,search_vector text);
      create table public.sources(id int,slug text,status text);
      create table public.research_search_documents(record_id text,content_hash text,title_text text);
      create table private.doi_enrichment_queue(record_id text,status text,doi text,evidence_url text);
      create table private.non_doi_enrichment_queue(record_id text,publisher_status text,publisher_evidence_url text,
        publisher_metadata jsonb,status text,evidence_url text,metadata jsonb);
      create table private.research_duplicate_review(record_ids text[],review_status text);
      create table private.verification_programmes(id integer,name text,status text);
      create table private.verification_batches(id integer generated always as identity,programme_id int,batch_number int,status text,
        target_count int,rules_version text,started_at timestamptz,completed_at timestamptz,checkpoint_at timestamptz,summary jsonb);
      create table private.verification_items(batch_id int,record_id text,baseline_record jsonb,
        baseline_fingerprint text,selected_reason text,assessment_status text,checks jsonb,assessed_at timestamptz);
      create table private.issues(record_id text,reported_at timestamptz);
      create function public.research_clean_summary(text) returns text language sql as 'select btrim($1)';
      create function public.research_normalise(text) returns text language sql as 'select lower($1)';
      create function private.enrichment_dashboard_assurance() returns table(record_id text,assessment_status text,
        assessed_at timestamptz,checks jsonb,baseline_fingerprint text,reported_at timestamptz) language sql as $$
        select distinct on (i.record_id) i.record_id,i.assessment_status,i.assessed_at,i.checks,
          i.baseline_fingerprint,e.reported_at from private.verification_items i
          left join private.issues e on e.record_id=i.record_id order by i.record_id,i.assessed_at desc nulls last,i.batch_id desc
      $$;
      insert into private.verification_programmes values (1,'ID-EBP catalogue assurance baseline 2026-11','active');
      insert into public.sources values (1,'source','published');
      insert into public.research_records values
        ('record','Title','${url}','Named author',2025,'Institution','source','Summary',array['Topic'],'article',null,'10.1234/example',null),
        ('unconfirmed','Another title','${url}','Named author',2025,'Institution','source','Summary',array['Topic'],'article',null,null,null);
      insert into private.doi_enrichment_queue values ('record','verified','10.1234/example','https://doi.org/10.1234/example');
      insert into public.research_search_documents values ('record',md5('Title. Topic. Summary'),'title');
      insert into private.verification_items values
        (0,'record',null,null,null,'automatic_screened','{}',now()-interval '1 hour'),
        (0,'unconfirmed',null,null,null,'automatic_screened','{}',now()-interval '1 hour');
    `);
    const [fingerprint]=(await db.query(stageSql({})+`select fingerprint from assessment where id='record'`)).rows;
    const item={id:'record',fingerprint:fingerprint.fingerprint,reviewer:'Reviewer',
      evidence:Object.fromEntries(fields.map(field=>[field,url])),
      final:{relevance_evidence:url,checked_url:url,duplicate_reviewed:true,link_verified_at:new Date(now).toISOString()}};
    const review=validateReviews([item],now);
    async function counts(){
      return Object.values((await db.query(reportSql({}))).rows[0])[0].counts;
    }
    assert.deepEqual(await counts(),{'1':0,'2':1,'3':1,'4':0,'5':0});
    await db.exec(applySql(review));
    assert.deepEqual(await counts(),{'1':0,'2':1,'3':0,'4':1,'5':0});
    await db.exec(applySql(review));
    assert.equal((await db.query('select count(*)::int n from private.verification_batches')).rows[0].n,1);
    review.record.live_found=true;
    await db.exec("insert into private.issues values ('record',now())");
    await db.exec(applySql(review));
    assert.deepEqual(await counts(),{'1':0,'2':1,'3':0,'4':1,'5':0});
    await db.exec('delete from private.issues');
    await db.exec(applySql(review));
    assert.deepEqual(await counts(),{'1':0,'2':1,'3':0,'4':0,'5':1});
    await db.exec("update public.research_records set summary='Changed summary' where id='record'");
    await db.exec(applySql(review));
    assert.deepEqual(await counts(),{'1':0,'2':1,'3':1,'4':0,'5':0});
  } finally { await db.close(); }
});
