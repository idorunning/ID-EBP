# Database safety and backups

Set up 16 November 2026. This covers the guard on the master tables, the change history, and the nightly off-site backup.

## 1. Safety catch (migration `20261116100605_database_safety_catch`)

Applies to `public.sources` and `public.research_records`.

| Limit per transaction | sources | research_records |
| --- | --- | --- |
| Rows updated | 25 | 500 |
| Rows deleted | 1 | 25 |
| TRUNCATE | always refused | always refused |

- Counts add up across the whole transaction, so a loop of single-row changes is caught too.
- Inserts are never blocked. Inserts of more than 500 rows in one statement are written to `private.bulk_change_audit`.
- Every UPDATE and DELETE copies the old rows into `private.source_history` or `private.research_record_history`. Both are append-only, as is `private.bulk_change_audit`.
- Website and admin actions change one row per request, so they never meet the limit.

**To make an intended bulk change** (for example promoting a crawl run), run this in the same transaction first:

```sql
select private.allow_bulk_change('Promote crawl run 7 - approved by Nathan');
select staging.candidate_promote(7);
```

The permission is tied to that transaction's id, so a reason left over in a pooled session cannot approve a later transaction.

**To restore a changed record** from history:

```sql
select old_row from private.research_record_history where record_id = 'IDEBP-R123' order by changed_at desc limit 5;
```

**Rollback** of the guard (history is kept): `ops/rollback/20261116100605_database_safety_catch.down.sql`.

Tests: `tests/ops/safety-catch.pglite.mjs` (21 cases). The migration was reviewed by an independent agent before it was applied, and all its findings were fixed.

## 2. Nightly off-site backup

| Part | Where |
| --- | --- |
| Export | Supabase Edge Function `backup-export` (read-only, repeatable-read snapshot, JSON Lines) |
| Store | Cloudflare Worker `idebp-backup`, cron 02:23 UTC daily |
| Bucket | R2 `idebp-backups` (Western Europe) |
| Encryption | AES-256-GCM per backup; the AES key is wrapped with an RSA-4096 public key. Only Nathan holds the private key (`idebp-backup-private-key.pem`). |
| Retention | `daily/` 30 days, `monthly/` (1st of each month) 365 days, `manifests/` 400 days. Bucket lock stops deletion of daily copies for 29 days and monthly copies for 364 days. |
| Alerts | Email to hello@thinkingaboutpolicing.org if a backup fails, is older than 36 hours, or row counts fall below 134 sources / 17,080 records. Weekly summary every Sunday. |

What is included: every table in `public`, `private` and `staging`, plus `auth.users` and `auth.identities`. Excluded because they can be rebuilt: `public.research_search_documents` (search index and embeddings), `private.research_index_jobs`, staging label claims, and the `snapshot_*` tables.

Each night the Worker re-reads the object it stored, checks its SHA-256 hash, and writes `manifests/<date>.json` and `latest.json` (row counts only, not encrypted).

Auth between Worker and export: a random token held only as a Worker secret (`EXPORT_TOKEN`); the database stores only its SHA-256 in Vault (`backup_export_token_sha256`). To rotate it, generate a new token, set it on the Worker, and update the Vault hash.

### Restoring

1. Download `daily/<date>.idebp.enc` from the R2 bucket (Cloudflare dashboard → R2 → idebp-backups).
2. `pip install cryptography`, then `python3 ops/backup-worker/decrypt-backup.py idebp-backup-private-key.pem <file> backup.jsonl`
3. The file starts with a header line, then for each table a `table` line (columns and types) followed by `row` lines, and ends with a `footer` line holding row counts. Load the tables needed back into a fresh project after applying `supabase/migrations/`.

Supabase's own daily backups (Pro plan, 7 days) remain a second, independent route.

## 3. Other checks done 16 November

- Row-level security switched on for `private.promotion_log`, the 15 November snapshots and `staging.label_suggestions_haiku_20261116`.
- Six staging functions given a fixed `search_path`.
- The unused 10 November staging import token was revoked.
- The OpenAlex harvester now runs without an API key at a low rate; add Vault secret `openalex_api_key` for the full free allowance.
