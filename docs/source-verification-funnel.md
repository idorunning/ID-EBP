# Source-verification funnel (19 November 2026)

This is an operator-facing measurement of how people move through the existing homepage Verify your source link, the source-claim form, the optional member registration form and administrator approval. It does not identify people or reconstruct individual journeys.

## Events and their meaning

| Metric | Trigger | Important limit |
| --- | --- | --- |
| `verify_click` | A first-party link to the verification workspace is clicked | Clicks, not unique people |
| `claim_view` | Visitor opens the source-verification workspace | Page entries, not sessions |
| `register_view` | Visitor opens /register | Page entries, not unique people |
| `register_code_issued` | Supabase has generated a code after a Join the community request | Generation is not confirmation that email was accepted or delivered |
| `claim_code_issued` | Supabase has generated a source-claim code | Generation is not confirmed email delivery |
| `signin_code_verified` | An email login/registration code has been accepted | Includes existing members; not equivalent to new registrations |
| `claim_submitted` | The claim has been committed for administrator review | Claims may still be awaiting authority checks |
| `auth_request_failed`, `claim_request_failed`, `signin_verify_failed`, `claim_submit_failed` | The relevant API request failed | Does not include a Cloudflare Email Delivery exception after API code generation |

The read-only admin report also counts newly created `auth.users`, source claims committed within the period, claims approved within the period and outstanding claims (current status).

## Data minimisation and access

Only a UTC calendar date, an allowlisted event name, an aggregate counter and an update timestamp are stored in `private.registration_funnel_daily`. No email address, IP, source ID, member ID, token, visitor or session identifier is saved in funnel analytics. The existing security rate limiter uses a keyed IP-derived hash in its separate operational records, subject to the existing service access restrictions. The public event endpoint accepts only three benign view/click events, checks same-origin and enforces a shared-IP request budget. Server events cannot be submitted as public click events.

The table enables RLS, has no anonymous or authenticated grants and is only accessible through service-role-only RPCs. The administrator must pass the existing role and session checks before the report is returned. All displays label incomplete configuration as unavailable rather than a misleading zero.

## Deployment and acceptance

Deploy the checked migration `20261119150500_registration_funnel_aggregates.sql`, then the protected `directory-api` Edge Function (retain verify_jwt=false and its proxy checking), and the built Cloudflare Worker. Test a homepage verification click and a real source-claim email, check the aggregate count rises, inspect the private admin Traffic & search page, and verify anonymous requests to admin reports and direct funnel RPCs remain denied.

This instrumentation deliberately does not force people to register and does not alter the approved current homepage design. Do not infer that a visitor abandoned a step from aggregate differences: request counters can count retries, existing member sign-ins, different devices and unsuccessful delivery attempts.
