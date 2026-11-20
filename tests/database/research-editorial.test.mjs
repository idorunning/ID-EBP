import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { reportSql, stageSql } from '../../scripts/advance-research-stages.mjs';
import { buildMigration, stageFunctionSql, MIGRATION } from '../../scripts/build-research-editorial-migration.mjs';

const url = 'https://example.org/research/article';
const evidence = Object.fromEntries(['title','authors','year','source','summary','tags','url'].map(f => [f, url]));
const summary = 'Evaluates a police-led diversion scheme for young people in one English force area. It compares reoffending among participants and a matched group.';

test('the database gates are generated from the runner SQL and are up to date', () => {
  const migration = readFileSync(MIGRATION, 'utf8');
  assert.equal(migration, buildMigration());
  assert.ok(migration.includes(stageFunctionSql()));
});

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role; create schema private;
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
    create function public.directory_api(text,jsonb,uuid,uuid,text) returns jsonb language sql as 'select ''{}''::jsonb';
    create function private.live_enrichment_report() returns jsonb language sql as 'select ''{"status":"idle"}''::jsonb';
    create function private.enrichment_dashboard_assurance() returns table(record_id text,assessment_status text,
      assessed_at timestamptz,checks jsonb,baseline_fingerprint text,reported_at timestamptz) language sql as $$
      select distinct on (i.record_id) i.record_id,i.assessment_status,i.assessed_at,i.checks,
        i.baseline_fingerprint,e.reported_at from private.verification_items i
        left join private.issues e on e.record_id=i.record_id order by i.record_id,i.assessed_at desc nulls last,i.batch_id desc
    $$;
    insert into private.verification_programmes values (1,'ID-EBP catalogue assurance baseline 2026-11','active');
    insert into public.sources values (1,'source','published');
    insert into public.research_records values
      ('blank','Diversion evaluation','${url}','Named author',2025,'Institution','source',
        'Stage 2 source inventory record for a collection/index. Author publication list',array['Topic'],'report',null,'10.1234/a',null),
      ('noauthor','Annual report','${url}','none listed',null,'Institution','source','A short existing summary of the report.',array['Topic'],'report',null,'10.1234/b',null);
    insert into private.doi_enrichment_queue values ('blank','verified','10.1234/a','https://doi.org/10.1234/a'),
      ('noauthor','verified','10.1234/b','https://doi.org/10.1234/b');
    insert into private.verification_items values
      (0,'blank',null,null,null,'automatic_screened','{}',now()-interval '1 hour'),
      (0,'noauthor',null,null,null,'automatic_screened','{}',now()-interval '1 hour');
  `);
  await db.exec(readFileSync(MIGRATION, 'utf8'));
  return db;
}
const one = async (db, sql, params) => Object.values((await db.query(sql, params)).rows[0])[0];
const fp = (db, id) => one(db, `select md5((to_jsonb(r)-'search_vector')::text) from public.research_records r where id=$1`, [id]);

test('placeholder summaries are blank and database stages match the runner', async () => {
  const db = await fixture();
  try {
    assert.equal(await one(db, `select public.research_clean_summary('Stage 2 source inventory record for a collection')`), '');
    assert.equal(await one(db, `select public.research_clean_summary('[Skip to content](https://x.org) # Title')`), '');
    assert.equal(await one(db, `select public.research_clean_summary('### Purpose\n\nFairness in policing')`), '');
    assert.equal(await one(db, `select public.research_clean_summary('A real summary of a report.')`), 'A real summary of a report.');
    const script = Object.values((await db.query(reportSql({}))).rows[0])[0].counts;
    const fn = await one(db, `select jsonb_object_agg(g::text,(select count(*) from private.research_stage_rows() a where a.stage=g)) from generate_series(1,5) g`);
    assert.deepEqual(fn, script);
    const blockers = (await db.query(stageSql({}) + `select id,stage4_blockers from assessment order by id`)).rows;
    assert.ok(blockers[0].stage4_blockers.includes('summary_missing'));
    assert.ok(blockers[1].stage4_blockers.includes('author_or_organisation_missing'));
    assert.ok(blockers[1].stage4_blockers.includes('publication_year_missing'));
  } finally { await db.close(); }
});

test('editorial job: claim, evidence-checked writes, stale and invalid input, Stage 4 then Stage 5', async () => {
  const db = await fixture();
  try {
    assert.equal((await one(db, `select private.refresh_research_stage_state()`)).total, 2);
    const seed = await one(db, `select private.research_editorial_seed()`);
    assert.equal(seed.queued, 2);
    assert.deepEqual((await one(db, `select private.research_editorial_seed()`)).queued, 2, 'seeding is idempotent');
    const claim = await one(db, `select private.research_editorial_claim(10,'Claude (automated evidence review)')`);
    assert.deepEqual(claim.ids, ['blank', 'noauthor']);
    assert.deepEqual((await one(db, `select private.research_editorial_claim(10,'Other')`)).ids, [], 'claimed rows are leased');
    const submit = items => one(db, `select private.research_editorial_submit($1,$2::jsonb)`, [claim.run, JSON.stringify(items)]);
    const fpBlank = await fp(db, 'blank'), fpNo = await fp(db, 'noauthor');
    await assert.rejects(submit([{ id: 'blank', fingerprint: fpBlank, summary: 'Too short.', evidence }]), /editorial checks/);
    await assert.rejects(submit([{ id: 'blank', fingerprint: fpBlank, summary: summary + ' See https://x.org.', evidence }]), /editorial checks/);
    await assert.rejects(submit([{ id: 'noauthor', fingerprint: fpNo, summary, evidence }]), /replace_reason/);
    await assert.rejects(submit([{ id: 'blank', fingerprint: fpBlank, authors: 'Someone', summary, evidence }]), /already recorded/);
    await assert.rejects(submit([{ id: 'blank', fingerprint: fpBlank, summary, evidence: { ...evidence, tags: 'file:///x' } }]), /evidence URL/);
    const stale = await submit([{ id: 'noauthor', fingerprint: '0'.repeat(32), hold: 'x', evidence }]);
    assert.equal(stale.stale, 1);
    const result = await submit([{ id: 'blank', fingerprint: fpBlank, summary, evidence }]);
    assert.deepEqual([result.written, result.stage4_recorded], [1, 1]);
    assert.equal(await one(db, `select summary from public.research_records where id='blank'`), summary);
    assert.equal(await one(db, `select count(*)::int from private.research_field_evidence where record_id='blank'`), 7);
    await assert.rejects(db.exec(`delete from private.research_field_evidence`), /append-only/);
    assert.equal(await one(db, `select stage from private.research_stage_rows() where id='blank'`), 4);
    // Repeating the same submission is refused because the lease is spent: no double write.
    assert.equal((await submit([{ id: 'blank', fingerprint: await fp(db, 'blank'), summary, evidence }])).skipped, 1);
    // Stage 5 needs a current search document, then a live match and a recent link check.
    await db.exec(`insert into public.research_search_documents select id,
      md5(left(concat_ws('. ',title,nullif(array_to_string(tags,', '),''),nullif(related_terms,''),nullif(public.research_clean_summary(summary),'')),1600)),
      lower(title) from public.research_records where id='blank'`);
    const now = new Date().toISOString();
    const signoff = items => one(db, `select private.research_editorial_signoff($1,$2::jsonb)`, [claim.run, JSON.stringify(items)]);
    assert.equal((await signoff([{ id: 'blank', live_found: false, checked_url: url, link_verified_at: now }])).stage5_signed_off, 0);
    assert.equal((await signoff([{ id: 'blank', live_found: true, checked_url: url + '/other', link_verified_at: now }])).stage5_signed_off, 0);
    assert.equal((await signoff([{ id: 'blank', live_found: true, checked_url: url, link_verified_at: now }])).stage5_signed_off, 1);
    assert.equal(await one(db, `select stage from private.research_stage_rows() where id='blank'`), 5);
    const run = await one(db, `select private.research_editorial_finish($1,'test')`, [claim.run]);
    assert.equal(run.signed_off, 1);
    const report = await one(db, `select private.research_stage_report()`);
    assert.equal(report.counts['5'], 1);
    assert.equal(report.last24h.advancedRecords, 1);
    assert.equal(report.last24h.reachedStage5, 1);
    assert.ok(report.reliableSince);
    const dash = await one(db, `select public.directory_live_enrichment(null,null,null)`);
    assert.equal(dash.status, 'idle');
    assert.equal(dash.stages.total, 2);
    // Author/year fill only where missing, and held records keep a specific reason.
    const c2 = await one(db, `select private.research_editorial_claim(10,'Claude (automated evidence review)')`);
    assert.deepEqual(c2.ids, ['noauthor']);
    const filled = await one(db, `select private.research_editorial_submit($1,$2::jsonb)`, [c2.run, JSON.stringify([
      { id: 'noauthor', authors: 'Example Violence Reduction Unit', year: 2025, evidence }])]);
    assert.equal(filled.filled, 2);
    assert.deepEqual((await db.query(`select authors,year from public.research_records where id='noauthor'`)).rows[0],
      { authors: 'Example Violence Reduction Unit', year: 2025 });
    await assert.rejects(db.query(`insert into private.research_editorial_queue(record_id,reasons,priority,status) values ('x','{}',1,'held')`));
  } finally { await db.close(); }
});
