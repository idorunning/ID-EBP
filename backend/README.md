# Account and directory service

The live site uses the dedicated Supabase project `hvwmystbqlocjixvwgfl`. `api.mjs` is shared by the protected Edge Function and the Worker build. The public Worker authenticates upstream with a secret binding; its hash lives in private runtime configuration. Browser callers cannot supply that authority or execute scheduled-task routes.

Supabase Auth issues email codes. Cloudflare Email Service delivers verification codes and new workflow notifications from `sign-in@auth.id-ebp.org`. Sessions are encrypted HttpOnly cookies, with same-origin and CSRF protection. Service-role database functions validate live sessions, confirmed email, active membership and stored source/admin roles. User metadata grants no administrator authority.

`maintenance.mjs` performs bounded HTTPS checks and consumes leased private maintenance/outbox jobs. Public metadata candidates are reviewed before publication. Uncertain email sends are held, not automatically retried. No historical claim mail or bulk invitations are backfilled.

Ordered migrations and the repeatable editorial seed live in `supabase/`. `npm test` runs API, rendering, collection and real PostgreSQL permission/workflow checks locally; tests neither send real mail nor modify the hosted database. See `docs/database-setup.md` for deployment and validation limits.
