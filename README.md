# IDEBP

**International Directory of Evidence-Based Policing**

Created and operated by Nathan Tracey. Repository: `idorunning/ID-EBP`.

## Mission

To bring together sources of policing research, learning and practice from around the world, making them easier to find and supporting better policing.

IDEBP helps people locate external sources. It does not interpret research, rate scientific quality or certify interventions. EBP societies have directory profiles alongside research websites.

## Run and validate

Member accounts use email verification codes or passwords. Source owners require independent administrator approval; profile changes are reviewed before publication. Administrators must replace the starter password and verify their email before accessing moderation.

```sh
npm ci
npm run dev
npm test
```

The build creates a self-contained Cloudflare Worker. Public files contain no service keys or account tokens. Browser sessions use encrypted, HttpOnly cookies.

## Code review and release checks

The [17 October code/security review](docs/audits/2026-10-17-code-review.md) records the tested fixes, ratings and concurrency limitations. The [hosting audit](docs/audits/2026-10-17-hosting.md) records live configuration and the coordinated deployment runbook. GitHub Actions runs the build and tests on Node 22 and 24; this does not deploy the site. Database migrations, the Edge Function and the Worker must be released together after acceptance checks.

## Project guide

| Location | Purpose |
| --- | --- |
| `public/app.js` | Directory and source/society profiles |
| `public/i18n.js` | Interface translations and taxonomy labels |
| `public/data.js` | Initial factual source records, countries and language options |
| `public/ranking.js` | Relevance-first search and capped source signals |
| `public/styles.css` | Responsive design, accessibility and print rules |
| `src/worker.mjs` | Static serving, security headers and authenticated API proxy |
| `docs/build-specification.md` | Roles, workflows, scope, ranking and integrations |
| `docs/privacy-notice-draft.md` | Proposed production notice and publication gates |
| `supabase/migrations/` | Ordered database migrations, applied to the dedicated project and tested locally |
| `supabase/seed.sql` | Repeatable public editorial seed, with no accounts or claimed ownership |
| `tests/database/` | Isolated PostgreSQL access-control and integrity tests |
| `docs/database-setup.md` | Database privileges, deployment order and hosted acceptance gates |
| `docs/launch-checklist.md` | Current launch status and link to the single completion checklist |
| `docs/supabase-handover.md` | Temporary build organisation, cost decision and later ownership transfer |

## Hosting and domains

Preview Worker: `idebp-preview`, under Nathan's Cloudflare account. Published preview: https://idebp-preview.ntracey.workers.dev.

Nathan registered `id-ebp.org` on 14 October 2026. Cloudflare custom domains attach `id-ebp.org` and `www.id-ebp.org` to the preview Worker. The Worker redirects the www hostname and plain HTTP to `https://id-ebp.org`, preserving paths and queries. TLS certificates are active. Public HTTPS checks on 14 October returned 200 for the main address and 308 to the main address for www. The workers.dev preview address also remains available.

The GitHub repository is the source of truth. A production Cloudflare build connection should run the build and tests before deployment. Configure deployment secrets in Cloudflare/GitHub, never in this repository.

## Account service

The dedicated Supabase project is `hvwmystbqlocjixvwgfl`, with server-only account operations in `backend/api.mjs` and `supabase/functions/directory-api/index.ts`. The website Worker authenticates to this service using a rotated secret binding; only its hash is stored in the private database. Cloudflare Email Service sends sign-in codes from `sign-in@auth.id-ebp.org` with SPF, DKIM and DMARC configured.

The initial administrator invitation belongs to `contact@id-ebp.org`. The one-use starter credential is never committed. First use requires email verification and a new password. No authenticator enrolment is required.

Published sources in the database are authoritative. Source suggestions require administrator approval and confer no ownership. Home counters derive from unique published listings and countries, refresh on return to the page and every minute, and update after moderation. Browser-held records remain readable during an account-service outage. Server rendering fails with HTTP 503 rather than re-publishing withdrawn listings.

See `docs/source-ownership-process.md` for access rules and operational checks. Migrations are versioned in `supabase/migrations`; local PostgreSQL tests and API tests run through `npm test`.

## Current workflows

Account settings support display-name changes, JSON export of the member’s account and saved sources, mailbox-verified deletion requests, and email changes proved through both old and new mailboxes. Source management remains tied to the verified source email, so changing an account email can require a new ownership review. A deletion request is not automatic deletion.

Owners and invited editors propose profile changes, including public contact/social details, website, country, languages and permission-confirmed logo/photo URLs. An administrator reviews each revision; stale revisions and revoked access cannot publish. Approved remote raster images are served through bounded first-party requests.

Administrators can hide/restore sources, reverse duplicate decisions, replace ownership after independent checks, and reinstate members. Duplicate handling redirects the hidden listing and adds the retained source to saved collections; ratings and source roles stay separate. Every decision retains audit history.

Cloudflare runs a small maintenance batch every 30 minutes; each published source is checked weekly and after addition or website changes. Descriptions, published contacts, logo candidates and same-domain duplicates are suggestions for review, never automatic ownership evidence. The same job sends new claim receipts/decisions and editor invitations using a leased outbox. Uncertain deliveries are held to avoid duplicate mail. No historical invitations or bulk source outreach are sent.

The single completion checklist is https://chatgpt.com/space/page_ff709a1995908191a3d2dfcc18660533. Google reporting/search setup and full real-email mobile acceptance remain separately recorded there.

## Source import

Imported on 17 October 2026 from `idorunning/international_ebp-directory` at commit `bfd20b39a4613b7c3677e853a65adfa16c294677`, including the source-change submission confirmation. Existing folders and relative paths are preserved. The import passed the build and all 95 automated tests.

This repository contains application source and public assets, not production account data or runtime secrets. Copying the code does not change the live hosting connection or migrate the production database.
