import assert from 'node:assert/strict';
import test from 'node:test';
import { authorMissing, longestSharedRun, summaryProblems } from '../scripts/editorial-batch.mjs';

const abstract = 'This rapid evidence review examined 17 studies on pathways to the onset of child sexual abuse material offending and identified eight factors';
test('drafted summaries must be original, short and free of markup', () => {
  assert.equal(longestSharedRun('a review that examined 17 studies on pathways to the onset of offending', abstract), 9);
  assert.deepEqual(summaryProblems('Rapid evidence review of seventeen studies on how offending involving abuse material begins. It groups contributing factors as developmental, motivational and situational.', [abstract]), []);
  assert.match(summaryProblems('This rapid evidence review examined 17 studies on pathways to the onset of child sexual abuse material offending.', [abstract]).join(), /copies 1\d consecutive words/);
  assert.match(summaryProblems('Too short.').join(), /length/);
  assert.match(summaryProblems('A study of patrol deployment and its effect on crime in two cities, see https://example.org for more.').join(), /links or markup/);
  assert.match(summaryProblems('Stage 2 inventory record of patrol research items listed by the source organisation for later review.').join(), /placeholder/);
});
test('author placeholders match the database gate', () => {
  for (const v of ['', 'none listed', 'Editor', 'Not stated', 'unknown author']) assert.equal(authorMissing(v), true, v);
  for (const v of ['Kent and Medway Violence Reduction Unit', 'Jerry Ratcliffe']) assert.equal(authorMissing(v), false, v);
});
import { sqlCall } from '../scripts/editorial-batch.mjs';
test('printed SQL cannot be broken out of by record content', () => {
  const run = '00000000-0000-4000-8000-000000000000';
  const sql = sqlCall('research_editorial_signoff', run, [{ checked_url: 'https://x.org/$j$::jsonb); drop table x; --' }]);
  const tag = sql.match(/(\$ed_[0-9a-f]{16}\$)/)[1];
  assert.equal(sql.split(tag).length, 3);
  assert.ok(sql.endsWith(`${tag}::jsonb);`));
  assert.throws(() => sqlCall('x', 'not-a-run', []), /--run/);
});
