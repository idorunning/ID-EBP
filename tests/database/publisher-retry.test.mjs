import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { classifyFailure, publisherFailure, HostBreaker, PUBLISHER_MAX_ATTEMPTS, NON_SCHOLARLY_KINDS }
  from '../../supabase/functions/_shared/publisher-retry.ts';

test('publisher failures are classified without treating them as missing publications', () => {
  const timeout = new Error('signal timed out'); timeout.name = 'TimeoutError';
  assert.equal(classifyFailure(timeout).kind, 'timeout');
  assert.deepEqual(classifyFailure(new Error('Publisher HTTP 503')), { kind: 'server', detail: 'HTTP 503' });
  assert.equal(classifyFailure(new TypeError('error sending request: connection reset')).kind, 'network');
  assert.equal(classifyFailure(new Error('Too many redirects')).kind, 'permanent');
});

test('transient failures retry on a widening schedule, then stop with a specific reason', () => {
  const url = 'https://www.aic.gov.au/publications/tandi/tandi734';
  const first = publisherFailure(0, new Error('Publisher HTTP 503'), url, 0);
  assert.equal(first.status, 'pending');
  assert.match(first.note, /HTTP 503 \(aic\.gov\.au\); retry 2 of 6/);
  const delay = attempts => publisherFailure(attempts, new Error('x'), url, 0).retry.getTime() - Date.now();
  assert.ok(delay(0) >= 29 * 60_000 && delay(0) <= 31 * 60_000);
  assert.ok(delay(1) > delay(0) && delay(2) > delay(1) && delay(3) > delay(2) && delay(4) > delay(3));
  const last = publisherFailure(PUBLISHER_MAX_ATTEMPTS - 1, new Error('x'), url, 0);
  assert.equal(last.status, 'error');
  assert.equal(last.retry, undefined);
  assert.match(last.note, /unreachable after 6 attempts: connection error \(aic\.gov\.au\)/);
  const bad = publisherFailure(0, new Error('Unsafe or invalid redirect'), url, 0);
  assert.equal(bad.status, 'error');
});

test('host breaker skips a failing host for the rest of a chunk only', () => {
  const breaker = new HostBreaker(2);
  breaker.fail('https://www.aic.gov.au/a');
  assert.equal(breaker.isOpen('https://aic.gov.au/b'), false);
  breaker.fail('https://aic.gov.au/c');
  assert.equal(breaker.isOpen('https://www.aic.gov.au/d'), true);
  assert.equal(breaker.isOpen('https://crestresearch.ac.uk/x'), false);
  breaker.succeed('https://aic.gov.au/e');
  assert.equal(breaker.isOpen('https://aic.gov.au/f'), false);
  assert.ok(NON_SCHOLARLY_KINDS.includes('blog-post') && !NON_SCHOLARLY_KINDS.includes('journal-article'));
});

test('requeue migration returns only transient publisher errors to the queue', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private;
      create table private.non_doi_enrichment_queue(record_id text primary key, status text, publisher_status text,
        publisher_attempts int, publisher_note text, publisher_next_attempt_at timestamptz default now());
      insert into private.non_doi_enrichment_queue values
        ('a','queued','error',3,'Publisher fetch failed',now()),
        ('b','queued','error',6,'Publisher fetch failed',now()),
        ('c','verified','error',3,'Publisher fetch failed',now()),
        ('d','queued','error',1,'Publisher link unusable: Too many redirects (x.org)',now()),
        ('e','queued','mismatch',1,'Publisher identity or existing citation fields need review',now());`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261120090000_publisher_retry_backoff.sql', import.meta.url), 'utf8'));
    const { rows } = await db.query(`select record_id, publisher_status,
      publisher_next_attempt_at between now() and now()+interval '24 hours' spread
      from private.non_doi_enrichment_queue order by 1`);
    assert.deepEqual(rows.map(r => [r.record_id, r.publisher_status]),
      [['a','pending'],['b','error'],['c','error'],['d','error'],['e','mismatch']]);
    assert.equal(rows[0].spread, true);
  } finally { await db.close(); }
});
