# ID-EBP code, security and reliability review

Date: 17 October 2026. Baseline: `idorunning/ID-EBP` commit `52dc2fb628ee4e1a6987468262d041761913b447`.

## Decision

The baseline passed all 95 existing tests, but additional adversarial tests reproduced security and workflow defects. The accompanying patch corrects those verified defects and adds regression checks. The changes are prepared for review; they have **not been deployed to the live Worker, Edge Function or database**.

The code has useful foundations: server-checked identities, encrypted HttpOnly session cookies, CSRF checks, private database privileges, reviewed publication, an audit trail and a leased notification queue. It is not yet demonstrated to be ready for a large simultaneous login event. Shared-network limits, provider limits, real database contention and operational recovery still need acceptance.

## Ratings

These are engineering judgements on a ten-point scale, not a certification, measured uptime or a percentage of code coverage. A score of 8 means a strong implementation with material integration/operational checks outstanding; 10 would require evidence this audit does not supply. Patched scores describe the reviewed candidate code, not the current live service. Operational assurance requires deploying the compatible release and completing its acceptance checks.

| Area | Baseline | Patched code | Main remaining limitation |
| --- | ---: | ---: | --- |
| API security and session handling | 6.5 | 8 | Live Auth settings, leaked-password protection and upstream client-IP handling |
| Database integrity and approval workflows | 6 | 8 | Independent PostgreSQL-session contention and deployment preflight |
| Browser workflow resilience | 6 | 8 | Real mailbox, physical mobile device and assistive-technology acceptance |
| Worker and scheduled processing | 6 | 8 | Provider behaviour, DNS/egress controls and queue throughput |
| Automated release checks | 4 | 7 | Branch protection and a deployment pipeline still need configuration |
| Demonstrated production load readiness | 5 | 5 | No sustained hosted load test has been performed |

**Overall assessment: existing live setup 6/10; revised code approximately 8/10, subject to release validation.** Passing isolated concurrency tests does not raise the production capacity rating.

## Corrected findings

| Finding | Risk | Correction and evidence |
| --- | --- | --- |
| Team mutation routes accepted GET | Medium | Exact method checks return 405 before privileged RPC dispatch. Existing SQL prevented role changes with absent payloads, but a revoke attempt could write an audit entry. |
| Refresh outages removed valid session cookies | Medium | Transient failures preserve the cookie; definitive credential rejection still clears it. Tests cover outage and incomplete-token replies. |
| OTP guessing budgets depended on IP | Medium | Login and source-claim verification share a mailbox budget of ten attempts per ten minutes, in addition to IP limits. |
| Malformed successful JSON was treated as success | Medium | Backend and client reject invalid replies; upstream sizes are bounded. A timeout or lost response does not establish whether a write committed. |
| A suspended claimant could be approved | High for access integrity | Approval rechecks suspension. Common ordered member locks coordinate suspension and access-grant operations. A regression proves rejection after suspension; independent-session timing still needs staging. |
| No database constraint enforcing one owner per source | High for access integrity | Added a partial unique index. Pre-existing conflicts cause deployment to fail for review rather than silently removing access. |
| Worker batches selected leases by transaction timestamp | High for duplicate processing | Each batch returns the rows acquired by that call using `UPDATE ... RETURNING`. Repeated claims at one timestamp no longer return earlier batches. |
| Public profile reads took write locks | Medium for availability | Read paths use non-locking selects; a read-only PostgreSQL transaction now succeeds. |
| Repeated identical profile edits could create duplicate review work | Medium | Exact pending retries use the same revision under source/member locks. Changed proposals remain separate and revoked managers remain blocked. |
| Stale browser replies could restore previous-account state | Medium | Session-generation checks guard reads and writes; private caches clear across account changes. Independent review added a delayed-rating-write regression. |
| Refresh bursts generated duplicate requests | Medium for load | Client refresh calls share in-flight work; 25 simultaneous refresh requests issue two service requests in the fixture instead of 50. |
| Automatic refreshes rebuilt forms and save controls | Medium for usability | Save state updates in place; automatic public refreshes preserve typed input, and member forms retain their draft workflow. |
| Direct backend response could expose OTP delivery metadata | High if that deployment mode were used | The Worker strips internal delivery fields on both direct and proxied paths, including error replies. Live hosting uses the proxied path. |
| Proxy and scheduled work had insufficient bounds | Medium | Request/response limits, deadlines, stream cancellation and controlled errors reduce resource retention. Private responses always use `no-store`. |
| One background acknowledgement failure stopped later jobs | Medium | Continue other leased jobs and report failures afterwards. An uncertain mail send is held rather than automatically repeated. |
| Invalid/trailing-dot private media hosts and malformed URLs | Medium | Stronger URL checks and controlled 404 responses. DNS rebinding/egress controls are not certified by this change. |
| No repeatable GitHub gate | Medium | Added pinned Actions, read-only permissions, Node 22/24 build/tests, dependency audit and Dependabot. No deployment secret is used by tests. |
| Local historical migration versions differed from live history | Medium for deployment | Renamed ten files only after all 13 original SQL bodies were matched byte-for-byte to live history. Independent review confirmed the renamed files did not change content. |

The patch also adds HSTS on HTTPS Worker responses, corrects HEAD responses, and changes catalogue lookups from repeated linear scans to a map.

## Verification and what it proves

The baseline installation/build/test run passed **95/95 tests**, with zero failures or skips. `npm audit` reported zero known dependency vulnerabilities for the installed lockfile at audit time. A tracked-file credential-pattern scan found no matches; it is not proof that no secret exists in history or external configuration.

The final integrated run passed **146/146 tests**, with zero failures or skips. Built Worker syntax and `git diff --check` also passed. The independent reviewer found no remaining merge blocker in the reviewed patch. New tests are in `tests/backend-security.test.mjs`, `tests/client-workflows.test.mjs`, `tests/database/concurrency.test.mjs`, `tests/worker-reliability.test.mjs`, with extensions to the existing Edge, saved-source and maintenance tests.

| Check | Result / interpretation |
| --- | --- |
| 64 distinct-user simultaneous logins | Mocked Auth responses kept identity, cookie and CSRF state separate. |
| 16 simultaneous session refreshes | Consistent identity/CSRF under mocked provider refresh-token reuse. This does not validate the live reuse interval. |
| 64 password logins from one IP | Default application policy accepts 12 and throttles 52; configured allowance of 120 accepts all 64 in the enforced mock limiter. |
| Per-mailbox password protection | Remains eight attempts per ten minutes even when the IP allowance is raised. |
| 100 concurrent proxied account requests | Response identities and cookies remained separate and uncacheable. |
| 200 simultaneous public requests | One upstream catalogue read within one Worker isolate/environment; a later withdrawal is not served from a retained cache. |
| PostgreSQL fixture checks | Real PGlite constraints, grants, procedures and transaction behaviour, but one connection. No independent-session throughput or deadlock measurement. |
| Live public browser smoke check | Homepage rendered 115 sources/35 countries; directory search found Thinking About Policing and its profile opened. This checked the live baseline, not the unpublished patch. |
| Live hosting inspection | Correct domains, certificates, bindings and cron; healthy Supabase; no overdue source checks or stale leases at inspection. See the companion hosting audit. |

## Load constraints that must be addressed before an event

1. **Shared-network login policy.** `AUTH_PASSWORD_IP_LIMIT` accepts an integer from 12 to 240 per ten minutes, falling back to 12. Set it in the Edge Function environment only after agreeing the expected office/conference usage and abuse budget. Raising it does not change the per-mailbox cap or the provider's limits.
2. **Provider-side IP aggregation.** The current server proxy does not implement supported end-user IP forwarding to Supabase Auth. The provider can therefore aggregate users into its server-egress buckets. Supported forwarding requires a modern secret API key, explicit Auth configuration and a trusted `Sb-Forwarded-For` value. Merely adding that header is insufficient. [Official requirements](https://supabase.com/docs/guides/auth/rate-limits).
3. **Email-code budgets.** Existing login-code requests permit 20/hour/IP and 100/hour globally. Claim-code requests have a separate 15/hour/IP and 100/hour budget. These limits were not silently raised. Delivery quotas and abuse controls need reviewing together.
4. **Workflow-notice delay.** The half-hourly scheduler takes at most ten workflow messages, giving a theoretical drain ceiling of 20/hour. A batch of 64 queued notices arriving just after a run could take about 3.5 hours to finish, before delivery delays. This is separate from immediate sign-in codes. Consider a five-minute schedule or a dedicated queue consumer, with a confirmed mail budget and backlog alerts.
5. **Source maintenance throughput.** Five checks per half hour gives 240/day, currently sufficient for 115 weekly checks. That arithmetic is not a measured provider throughput figure.
6. **Database and assets.** The observed database connection limit was 60, with 19 connections at one inspection; it is not a 60-user limit. Auth allocation is fixed at ten connections. Static assets are embedded in a roughly 7 MB Worker source; splitting assets into Cloudflare static assets is a later efficiency improvement, subject to deployment-size/startup measurements.

## Release and operational acceptance

Keep this as the audit evidence; the existing project completion page remains the task tracker.

- Run the complete test suite and review CI before merging. Configure required branch checks so a failed suite cannot be bypassed accidentally.
- Before applying the new migration, check for duplicate active owners, match the existing migration history, and verify the latest successful backup. Do not reset production or reapply renamed historical migrations. Apply only the new migration transactionally.
- Deploy the matching migration, Edge Function and Worker as one compatible release, preserving secret/email bindings. Refresh live configuration immediately before release to account for other work.
- Verify public endpoints, cross-account denial, source submission/approval and queue state using disposable staging records. Keep real-mail acceptance separate and intentional.
- Enable leaked-password protection; raise minimum TLS from the observed 1.0 to 1.2. HSTS is added in the patch but absent from the inspected live baseline. Review domain coverage without assuming `includeSubDomains` is safe.
- Configure a real build/deployment connection to `idorunning/ID-EBP`. Cloudflare currently has no Git build configuration, triggers or build history for this Worker, so a green GitHub build alone will not update the website.
- Run a staged concurrency test with independent PostgreSQL connections and actual provider test accounts: normal traffic, shared-NAT bursts, token refresh, approval/suspension conflicts and a sustained session. Record latency percentiles, 429/5xx rates, duplicate effects, lock waits and recovery after the burst. Establish pass thresholds before the test.
- Verify a restore into an isolated environment, with an agreed recovery-time/recovery-point target. A paid plan or the existence of a backup option does not establish a successful restoration.
- Add alerts for authentication errors, rejected requests, failed cron runs, expired leases and outbox age. Sampling logs at 10% is not evidence that alerts will reach an operator.

No production load test, backup restoration, mailbox-delivery test, bulk outreach or production data mutation was performed during this audit.

Other retained limitations: very large admin/whole-catalogue reports are not paginated; email changes span separate Auth and database operations; simultaneous offline signed-in tabs share a pending-save journal with last-writer-wins browser storage. These require separate targeted improvements and should not be described as solved by the new tests.

## Review of the agents' output

Five specialist workstreams were followed by a sixth independent review. Each implementation agent supplied reproducible tests and scoped limitations. The independent reviewer found three gaps after initial fixes: the claim-approval/suspension timing risk, a delayed rating response crossing an account switch, and a draft-key collision between administrative forms. Those findings were returned for correction before the integrated review.

Output quality: **8/10**. The strongest evidence is reproduced failures followed by behavioural regressions, and explicit separation of fixtures from live capacity. The remaining weaknesses are lack of actual multi-connection/staging load evidence and incomplete real-device/provider acceptance. The passing baseline is not used to claim the absence of vulnerabilities.
