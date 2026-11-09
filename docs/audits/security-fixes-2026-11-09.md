# Security and quality fixes — 9 November 2026

Release status: code prepared in PR #12; not merged or deployed. The live scheduler was corrected independently. The Supabase migration requests were cancelled before completion; the live migration ledger still contains no `audit_security_reliability` entry. Do not claim the account/database fixes are live.

| Finding | Change | Status |
| --- | --- | --- |
| R01 Email quota exhaustion | Validate display names before quota/provider calls; reserve delivery capacity only for a valid code; server-side Turnstile verification protects all code-email entry points, checks hostname/action and fails closed. | Code tested; widget and Worker secret configured; enforcement awaits Worker release. |
| R02 Indefinite administrator invitations | Seven-day expiry, issuer revalidation, automatic cancellation when issuer access is removed, explicit cancellation and pending-invitation list. | Database and UI changes tested; awaiting migration/release. |
| R03 Compromised-password screening | Clear weak-password feedback added. Supabase's provider setting requires its dashboard; browser reached the sign-in page and had no authenticated session. | Not enabled; dashboard sign-in required. |
| R04 Invalid year range remains stuck | Recalculate custom validity on input/change and scope changes, so correcting either year restores submission. | Code and real-browser regression passed; awaiting release. |
| R05 Password succeeds but acknowledgement fails | Record a durable pre-write fingerprint of Auth's salted hash. Reconcile committed changes on an authenticated session/retry; return success when the provider committed, even if acknowledgement is unavailable. No submitted passwords are stored. | Database and API fault-injection regressions passed; awaiting migration/release. |
| R06 Expired editor invitation blocks a new one | Revoke expired matching invitations under the existing source lock before creating a replacement. | Real database regression passed; awaiting migration/release. |
| R07 Scheduler differs from repository | Live Worker schedule changed from `*/30` to `*/5`; subsequent GET confirmed it. Existing notification budgets and half-hour source-maintenance guard remain in place. | Live and verified at 22:09 UTC. |
| R08 Migration-history drift | Six filenames aligned to hosted versions, two hosted feedback migrations restored verbatim. Added guarded SQL generator for the catalogue foundation's missing ledger entry. | Repository reconciliation done; guarded ledger repair still needs execution. |
| R09 Obsolete browser acceptance tests | Replace obsolete selectors/routes with current topic selection, search modes, native year validation, anonymous admin gating, error reporting and 320/390px layout checks. Add pinned Playwright dependency and a CI browser job. | Five browser checks passed in GitHub Actions. |
| R10 Incomplete source-search cache signature | Signature and index share every normalised searchable field; regenerate the bundled index and check it in the test command. | Fifteen mutation regressions passed; awaiting release. |

## Evidence

Initial change commit: `226528ca3aba80f53b982d9b775da62c8da8cf43`.
CI run: https://github.com/idorunning/ID-EBP/actions/runs/42701456875

- Node 22 and Node 24: 226 tests passed, none failed or skipped.
- Browser: five tests passed using installed Chromium in CI. Local Chromium was blocked by the runtime's socket restrictions; local launch failures are not browser-test passes.
- PostgreSQL 16: independent-session concurrency and synthetic backup/restore job passed.
- Dependency audit: zero known vulnerabilities.
- Additional API fault-injection test confirms a committed password change returns success through a failed acknowledgement and a same-password retry; passed locally with the database regressions.

Tests use synthetic accounts and mocked provider/network responses where indicated. No real mailbox delivery, successful production account login/reset or challenge completion has been claimed. Passing these checks is not proof that the whole website is vulnerability-free.

## Remaining release sequence

1. Enable Supabase Auth Email compromised-password protection in project `hvwmystbqlocjixvwgfl` after dashboard sign-in. Confirm the provider setting or security advisor no longer reports it disabled. Do not weaken other Auth settings.
2. Generate the reviewable missing-history repair with `node scripts/prepare-migration-repair.mjs`. Its SQL verifies the existing catalogue foundation and inserts only the missing history entry; it does not recreate tables or replace current search functions. Execute only after reviewing the current hosted ledger.
3. Apply `supabase/migrations/20261109211628_audit_security_reliability.sql` through the migration service. It was tested from a fresh database but has not run in production. If the service assigns another timestamp, rename the local migration to that hosted version and verify SQL parity before merging.
4. Deploy the existing `directory-api` Edge Function with the updated `backend/api.mjs` and existing entry-point configuration. Preserve its proxy authentication and current JWT configuration.
5. Build and deploy `dist/worker.mjs`, preserving existing bindings and secrets. Apply `AUTH_HUMAN_CHECK_REQUIRED=true` and the public Turnstile site key recorded in `wrangler.jsonc`; `TURNSTILE_SECRET` is already stored as a Worker secret. Never commit the secret.
6. Verify status exposes the expected public challenge configuration; missing/invalid challenge proof cannot reach email generation; foreign-origin requests are rejected; anonymous/forged sessions cannot use admin APIs; search/year correction works on desktop/mobile; scheduler and migration ledger match source.
7. Complete an authorised test-account email/login/reset flow and challenge check. Close the outstanding audit findings only after these deployed checks succeed.

No further database deployment retry was made after the second cancellation. PR #12 is the durable continuation point.
