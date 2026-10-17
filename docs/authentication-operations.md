# Authentication operations

The application runs behind the Cloudflare Worker and the proxy-protected Supabase Edge Function. Authentication tokens stay inside encrypted, secure, HttpOnly cookies. The Edge Function verifies the Worker credential before trusting its client-IP metadata. Database authorisation still checks the live member, session and role.

## Shared-network limits

The defaults support an office or conference network while retaining per-mailbox controls. All limits are enforced by the shared database rate limiter, rather than in-memory state inside one Worker.

| Edge Function environment variable | Default | Accepted integer range | Window and scope |
| --- | ---: | ---: | --- |
| `AUTH_PASSWORD_IP_LIMIT` | 120 | 12–240 | Password attempts per client IP per 10 minutes |
| `AUTH_EMAIL_IP_LIMIT` | 120 | 15–500 | Combined sign-in, reset and source-claim code requests per client IP per hour |
| `AUTH_EMAIL_GLOBAL_LIMIT` | 150 | 25–150 | Combined sign-in, reset, source-claim and account-action code requests across the directory per hour |
| `AUTH_EMAIL_DAILY_LIMIT` | 150 | 25–150 | Combined authentication-code reservations over a rolling 24-hour period |
| `AUTH_VERIFY_IP_LIMIT` | 120 | 20–500 | Combined sign-in and source-claim verification attempts per client IP per 10 minutes |

Missing, fractional, non-numeric and out-of-range settings use the documented default. The deployment can set the defaults explicitly for clarity:

```dotenv
AUTH_PASSWORD_IP_LIMIT=120
AUTH_EMAIL_IP_LIMIT=120
AUTH_EMAIL_GLOBAL_LIMIT=150
AUTH_EMAIL_DAILY_LIMIT=150
AUTH_VERIFY_IP_LIMIT=120
```

The following narrower protections remain unchanged:

- Password attempts: eight per mailbox per 10 minutes.
- Login/reset code requests: three per mailbox per 10 minutes.
- Source-claim code requests: three per mailbox per 10 minutes.
- Code guesses: ten per mailbox per 10 minutes, shared across login and claim forms.
- Account-action code requests: three per member and action per 10 minutes.

Code-request responses remain neutral about whether an account exists. The email transport and Supabase have their own quotas; increasing application limits does not increase provider capacity. The currently observed mail allowance is 200 messages per day. The application reserves at most 150 authentication codes over any rolling 24 hours, leaving 50 for separately limited workflow notifications. Account-action codes use the same authentication allowance. Both the API configuration and database enforce the 150-code maximum; a higher allowance requires a deliberate code/database change after confirming a higher provider quota. Other sites or services sharing the provider account can consume its allowance, so these reservations cannot guarantee delivery capacity for the whole provider account.

The `reserve_auth_email` service-only RPC reserves capacity before code generation, including requests that result in no email and deliveries with uncertain outcomes. This is deliberately conservative. The shared ledger does not reset at midnight or when a session secret rotates. Other rate limits retain their fixed database windows. Deploy the rolling email-budget migration before deploying the API that calls this RPC.

## Forwarding the verified client IP to Supabase Auth

This is an opt-in deployment feature. Enable it only after confirming Supabase Auth's `security_sb_forwarded_for_enabled` setting is true and that a modern secret API key is available inside the Edge Function.

Set the Edge Function environment variable:

```dotenv
AUTH_CLIENT_IP_FORWARDING_ENABLED=true
```

The API chooses its modern Auth key in this order:

1. `DIRECTORY_AUTH_SECRET_KEY`, an explicitly supplied secret beginning `sb_secret_`.
2. `SUPABASE_AUTH_SECRET_KEY`, a compatibility alias where the runtime permits it.
3. The `default` entry in the platform-injected `SUPABASE_SECRET_KEYS` JSON dictionary.

For a new explicit custom secret, use `DIRECTORY_AUTH_SECRET_KEY`: Supabase reserves the `SUPABASE_` prefix for platform variables. Do not put any secret in the repository, public assets, generated files or browser configuration. An explicitly supplied invalid key does not fall back to another dictionary entry. Missing or malformed key dictionaries leave forwarding inactive.

The trust chain is:

1. Cloudflare supplies `CF-Connecting-IP` to the Worker.
2. The Worker overwrites `X-IDEBP-Client-IP` using that platform value and sends its secret proxy credential.
3. The Edge Function verifies the proxy credential before creating a trusted client-IP context.
4. The API accepts one syntactically valid IPv4 or IPv6 address from that context. Comma-separated chains, ports, zone identifiers and invalid addresses are ignored.
5. Only Auth requests receive `Sb-Forwarded-For`, and only when opt-in, a modern key and trusted IP are all present. Browser-provided forwarding headers are never copied into upstream Auth requests. Database RPC requests do not receive the forwarding header or the Auth-specific key.

User-authenticated Auth requests retain the member's Bearer token. Modern API keys are used in the `apikey` header and are never sent as Bearer JWTs. Without the full configuration, sign-in continues through the existing credentials without forwarding; provider-side shared-egress throttling may therefore remain.

References checked on 17 October 2026:

- [Supabase Auth rate limits and IP forwarding](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase Edge Function environment variables](https://supabase.com/docs/guides/functions/secrets)
- [Migration to modern API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)

## Verification and operational limits

`tests/backend-security.test.mjs` exercises concurrent isolated sign-ins with an enforced local limiter: 64 distinct users, 64 users sharing one IP, and 64 complete email-code sign-ins sharing one IP. It also checks the combined 120/IP and 150/global hourly budgets, pre-generation reservations against the 150-message rolling allowance, preserved mailbox limits, trusted forwarding boundaries, malformed upstream responses and session recovery after transient provider failures. `tests/backend-edge.test.mjs` checks proxy verification before client-IP trust. The database email-budget tests separately verify the rolling ledger's time behaviour.

These tests mock Supabase Auth. They demonstrate application isolation and policy behaviour; they are not measurements of live capacity, provider token rotation or email delivery. Before a large event, verify the live Auth forwarding setting and mail quota, then run a bounded staging exercise with dedicated test users.

Upstream account responses are limited to 4 MiB. Invalid successful JSON is treated as an incomplete response, not a confirmed success. A lost response after a committed remote write can still leave its outcome uncertain; check the latest status before resubmitting. Temporary refresh failures preserve the session cookie, while explicitly rejected credentials clear it.
