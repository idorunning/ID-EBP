import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { searchAllowance, retryAfterMs, retryDelayMs } from '../../supabase/functions/_shared/openalex-policy.ts';

test('OpenAlex allowance leaves budget for other consumers and respects retry windows', () => {
  assert.equal(searchAllowance(7), 0);
  assert.equal(searchAllowance(1019), 1);
  assert.equal(searchAllowance(10000), 35);
  assert.equal(searchAllowance(NaN), 0);
  const now = Date.parse('2026-11-19T15:00:00Z');
  assert.equal(retryAfterMs('2', now), 2000);
  assert.equal(retryAfterMs('Thu, 19 Nov 2026 15:02:00 GMT', now), 120000);
  assert.equal(retryDelayMs(3, 0, 0.5), 135000);
  assert.equal(retryDelayMs(3, 3600000, 0.5), 3600000);
});

test('hourly batch lease, expiry, retry eligibility and exhaustion', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema private;
      create table private.non_doi_enrichment_queue(record_id text, status text, publisher_status text,
        next_attempt_at timestamptz default now(), publisher_next_attempt_at timestamptz default now());
      create table private.doi_enrichment_queue(record_id text, status text);
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261119144557_hourly_research_enrichment.sql', import.meta.url), 'utf8'));
    const start = async () => (await db.query('select private.start_enrichment_hourly_batch(250) id')).rows[0].id;
    assert.equal(await start(), null);
    await db.exec(`insert into private.non_doi_enrichment_queue(record_id,status,publisher_status)
      values ('one','queued','pending'), ('two','queued','pending');
      insert into private.doi_enrichment_queue values ('two','verified');`);
    const first = await start();
    assert.ok(first);
    assert.equal(await start(), null);
    await db.exec(`update private.enrichment_hourly_batches set lease_until=now()-interval '1 second';`);
    const second = await start();
    assert.notEqual(first, second);
    assert.equal((await db.query('select status from private.enrichment_hourly_batches where id=$1',[first])).rows[0].status,'failed');
    const { rows } = await db.query('select private.finish_enrichment_hourly_batch($1,null) batch',[second]);
    assert.equal(rows[0].batch.remaining, 1);
    await db.exec(`update private.non_doi_enrichment_queue set publisher_status='broken_link' where record_id='one';
      update private.enrichment_provider_state set retry_after=now()+interval '1 hour';`);
    assert.equal(await start(), null);
  } finally {
    await db.close();
  }
});
