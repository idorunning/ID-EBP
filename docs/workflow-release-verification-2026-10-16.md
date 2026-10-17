# Workflow release verification — 16 October 2026

The implementation was merged in [PR 4](https://github.com/idorunning/international_ebp-directory/pull/4), merge b5a534652ee1032805b9b5faf81307c9ed9569bb. All 95 local tests passed, including PostgreSQL authorisation, extended reviewed profiles, ownership replacement, duplicate reversal, member reinstatement, account proofs/export/deletion requests, notification leases, maintenance requests and interrupted recovery/storage paths.

## Deployment evidence

The full Supabase migration request expired before execution twice. A read confirmed no schema change. The same tested SQL then succeeded as three ordered migrations: 20261016095243 storage, 20261016095306 triggers and 20261016095334 API. Repository files mirror those exact applied boundaries and versions; their concatenation equals the tested original SQL. No destructive reset was used.

The protected directory-api Edge Function is active at version 10, preserving its custom proxy authentication. Cloudflare deployment 9043db9ba5e1410e9568ea928bf19151 contains the tested Worker, verified before upload by exact length 7,047,117 and build checksum 3677753181. Existing secret/email bindings were inherited. Both fetch and scheduled handlers are active; cron */30 * * * * is configured. The initial maintenance queue contains 115 sources and the notification queue contains zero historical messages.

The live homepage renders 115 sources in 35 countries. GET /api/status returned 200 with accounts, registrations, email, saved sources and source management enabled. Anonymous account export returned 401; the public internal outbox route returned 404.

A hosted transaction used existing live owner/admin sessions to verify the extended edit → administrator approval → recorded revision state, scoped account export, private maintenance/notification reports and browser-table denial. All checks returned true. The transaction was rolled back, leaving no test revisions, contacts, account requests, notifications or audit decisions behind.

Security advisors reported private tables with RLS and no browser policies, intentionally closed to clients, and the existing Auth leaked-password-protection warning. This release did not change Auth policy. The provider’s remediation reference is https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Reporting and acceptance limits

A real Cloudflare Web Analytics query, excluding identified bots, returned 33 page views and 16 visits for 9–16 October 2026 UTC. These are visits, not unique people. The private admin report shows the retrieval timestamp, and a daily connected-tool refresh is enabled. Google reporting, property verification and sitemap submission remain blocked by GSC Wizard’s expired subscription.

No real mailbox messages were sent for testing and no bulk/source outreach was sent. Automated tests verify notification generation and provider acknowledgement handling; this does not prove inbox delivery. The available browser verified public rendering but provides no mobile viewport control or authenticated mailbox session. Full physical-device/email acceptance stays open under item 11 of the [same completion checklist](https://chatgpt.com/space/page_ff709a1995908191a3d2dfcc18660533).
