// Generates the research editorial migration from its template and the stage-gate SQL, so the
// database function and scripts/advance-research-stages.mjs evaluate exactly the same gates.
import { readFileSync, writeFileSync } from 'node:fs';

export const MIGRATION = new URL('../supabase/migrations/20261120100000_research_stage_gates_and_editorial_job.sql', import.meta.url);
export function stageFunctionSql() {
  const gates = readFileSync(new URL('./research-stage-assessment.sql', import.meta.url), 'utf8')
    .split('\n').filter(line => !line.startsWith('--')).join('\n').trim();
  return gates.replace('__REVIEWS__', 'p_reviews')
    .replace('__REVIEW_SCOPE__', 'where (not p_reviewed_only or v.id is not null)');
}
export function buildMigration() {
  const template = readFileSync(new URL('./research-editorial.template.sql', import.meta.url), 'utf8');
  return template.replace('__STAGE_SQL__', () => stageFunctionSql());
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const check = process.argv.includes('--check');
  const built = buildMigration();
  if (check) {
    if (readFileSync(MIGRATION, 'utf8') !== built) { console.error('Migration is out of date; run node scripts/build-research-editorial-migration.mjs'); process.exit(1); }
  } else writeFileSync(MIGRATION, built);
}
