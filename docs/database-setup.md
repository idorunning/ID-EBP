# Database setup and verification

Updated 16 October 2026. The dedicated live project is `hvwmystbqlocjixvwgfl`; account APIs and ordered migrations are deployed there. Never use TAP, SEBP or another website’s database for this project.

Apply new migrations in filename order through the migration service, after `npm test` passes. Each is transactional. There is no destructive reset script. The repeatable seed adds public editorial records without replacing edited profiles or inventing owners/accounts. Regenerate with `npm run db:seed` only when changing editorial catalogue data and review its diff. The live published database is authoritative.

## Access model

| Caller | Direct database access |
| --- | --- |
| Anonymous visitor | Published source profiles and their public links, reviewed translations and ranking aggregates |
| Signed-in member | Public reads; read, add and remove only their own saved sources |
| RS or WA browser session | Same direct privileges as a member; privileged work requires the protected server API |
| Server service role | Manage application records; append/read audit records, but no audit updates, deletion or table truncation |

All application tables enable row-level security. Private tables have no client
grants. Do not add `private` to PostgREST's exposed schemas. Machine translation
drafts stay private even if someone mistakenly adds a review timestamp. Links to
unpublished directory targets are not included in public results.

The service role is powerful and bypasses RLS. Before using it for any request, the
server API must validate the user's token and check database-managed
ownership or admin permission. For administration it enforces the initial password change and private
role checks. Authenticator enrolment is not required. A claimed role in editable user metadata is not authority. Access to the
private schema requires a server database connection or narrowly scoped server
functions; a normal REST client cannot query an unexposed schema.

## Deployment and checks

Run `npm ci`, `npm test` and `npm run build`. Publish the tested migration, Edge Function and Worker as one compatible release. Preserve the Worker proxy secret, encrypted-session secret, Auth configuration and email binding. The Edge Function uses custom proxy authentication, with JWT verification disabled intentionally; do not expose service keys in browser code.

Cloudflare schedules the Worker every 30 minutes. It leases at most five due source checks and ten new workflow notifications. Source checks become due weekly; additions and website changes queue checks immediately. Image fetches accept bounded HTTPS PNG/JPEG/WebP bodies only. Suggestions remain private pending review; public link status is separate from ownership and evidence quality.

Tests run PostgreSQL through PGlite with disposable Auth/session fixtures and Supabase-style grants. They cover public/private visibility, cross-account denial, live-session checks, reviewed source edits, duplicates, saved collections, mailbox challenges, account requests, audit integrity and final-admin protection. Local tests do not validate Supabase Auth signatures, real email delivery, multiple concurrent database connections or physical-device behaviour.

After release, verify public endpoints, deployed code and scoped hosted operations in a rolled-back transaction; run database advisors. An intentional private RLS table with no browser policy is not a missing public access feature. Keep hosted acceptance limits and remaining tasks on the [single completion page](https://chatgpt.com/space/page_ff709a1995908191a3d2dfcc18660533).

Official references: [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [PGlite](https://pglite.dev/docs/). See `supabase-handover.md` for eventual organisational transfer.
