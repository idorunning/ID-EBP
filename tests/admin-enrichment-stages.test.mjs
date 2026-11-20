import assert from 'node:assert/strict';
import test from 'node:test';
import { stagePanelView } from '../public/admin-enrichment.js';

test('stage panel shows counts, shares of the whole catalogue and 24-hour movement', () => {
  const html = stagePanelView({ total: 200, takenAt: '2026-11-20T10:40:00Z', reliableSince: '2026-11-20T10:00:00Z',
    counts: { 1: 0, 2: 50, 3: 100, 4: 10, 5: 40 }, blockers: { summary_missing: 90, '<b>x</b>': 1 },
    last24h: { advancedRecords: 41, reachedStage5: 38, reviewAttempts: 60, reviewedRecords: 50, summariesWritten: 3 },
    byStage24h: { 5: 38, 4: 3 }, editorialQueue: { queued: 120, held: 5 } });
  assert.match(html, /Stage 3 · Publication confirmed<\/strong>\s*<span>100 of 200 records/);
  assert.match(html, /aria-valuetext="50%"/);
  assert.match(html, /aria-valuetext="20%"/);
  assert.match(html, /Records advanced \(unique\)<\/dt><dd>41/);
  assert.match(html, /Reached this stage in 24h: 38/);
  assert.match(html, /Summary missing · 90/);
  assert.ok(!html.includes('<b>x</b>'), 'blocker keys are escaped');
  assert.match(stagePanelView(undefined), /not been recorded yet/);
});
