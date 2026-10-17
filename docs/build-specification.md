# IDEBP — design and build specification

14 October 2026 · Draft 0.4 · Project 1410-03

## Purpose and identity

**International Directory of Evidence-Based Policing (IDEBP)** is an international directory of websites and organisations that publish policing research, learning, practical experience and ideas. Visitors follow links to the original publisher. The directory does not host a duplicate research library or interpret findings.

**Mission:** To bring together sources of policing research, learning and practice from around the world, making them easier to find and supporting better policing.

**Domain:** `id-ebp.org`, registered by Nathan. The public brand remains IDEBP. Both hostnames are attached to Cloudflare; the Worker redirects `www.id-ebp.org` to `https://id-ebp.org`. TLS certificates are active and public HTTPS responses were verified on 14 October 2026.

**Public description:** Find policing research sources and evidence-based policing societies from around the world.

**Boundary:** Directory only. Listings do not certify research quality or endorse an intervention.

**Owner and credit:** Designed and built by Nathan Tracey. Whether the service will later be owned by a company is a separate decision. Do not present IDEBP as an incorporated organisation or registered charity before that exists. Decide ownership of the domain, code, accounts, data-controller responsibilities and future income together before a commercial launch; no company formation is undertaken in this phase.

## Design system

| Role | Colour |
| --- | --- |
| Page background | White `#FFFFFF` |
| Body text | Ink `#172B3A` |
| Headings and primary actions | Navy `#132C45` |
| Links and information | Blue `#23588A` |
| Panels and category backgrounds | Pale blue `#EDF4FA` |
| Small accents and active indicators | Copper `#A65A32` |

Public Sans is self-hosted in variable WOFF2 format with its SIL Open Font License. All headings are upright sans-serif; no italic headline treatments are used. The IDEBP wordmark and vector favicon use navy, blue and pale blue. White surfaces, restrained borders, 6–10px corner radii and consistent source-card proportions establish the visual language. Source cards and profiles use genuine publisher logos on appropriate backgrounds. College of Policing and CEPOL have text-only identities pending logo-use permission. No logo implies affiliation or registration. Brand and verification provenance is recorded in `research/*-sources.json`.

Target WCAG 2.2 AA. Include keyboard operation, visible focus, semantic labels, useful error messages, reduced-motion support and tested contrast. Colour must not be the sole status cue. Test at 320–1440px and 200% zoom, with screen-reader checks before launch. The live application has semantic controls and responsive layouts; production accessibility certification is not claimed.

## Roles and permissions

| Role | Permissions |
| --- | --- |
| Anonymous directory user (DU) | Browse, search, filter, view profiles and follow source links without an account |
| Member DU | All browsing functions, synchronised collections, optional private notes, one recommendation per source, export and account deletion |
| Research Source (RS) | Register or claim a website/society; maintain only authorised profiles, contacts, branding, languages, links and verification evidence |
| Website Admin (WA) | Review claims, amend and hide profiles, manage taxonomy/translations, resolve reports, review ranking signals, invite admins, approve communications and inspect audit events |

An RS is also a DU; roles are additive. A person may represent more than one source. A source may have several authorised managers. Admin privileges are granted only through a protected server-side process. Hiding a page or checking a frontend role is never authorisation.

## Information architecture

Home; directory results; EBP societies; source/society profile; register or claim a source; account confirmation/recovery; optional member collection; source management; admin; mission/about; ranking explanation; privacy; terms and report-a-problem.

Societies are a first-class organisation category. They use the same registration, ownership confirmation and editorial management workflow. This phase manages society **directory profiles and authorised representatives**, not the society's own membership fees, elections or private membership database.

## Profile questionnaire

Required: source name, canonical website URL, private account email, factual description (600 characters), organisation country, at least one organisation type, at least one content type, content languages and authority-to-manage declaration.

Optional: publisher/legal name, coverage countries and regions, logo and banner, public contact name/role/email, separate staff profiles, public contact website, social links, related sources, affiliation to an EBP society with supporting URL, access conditions, topics, research methods, publication formats, update frequency, source language, translation availability and accessibility information. Public staff details require the representative's permission to publish them. Private account and verification addresses are never automatically made public.

Multiple selections are permitted:

- Organisation: EBP society, professional association, police/government, academic institution, charity, company, independent publication, blog, research collection, practice collection, learning provider.
- Material: original research, systematic/evidence reviews, research summaries, practice examples, implementation guidance, learning resources, commentary, datasets, practitioner stories.
- Methods represented: randomised controlled trials, quasi-experimental studies, qualitative research, observational studies, mixed methods, process/economic evaluation, systematic reviews, not specified.
- Editorial process: peer-reviewed material, internal professional review, external review, editorial review, self-published or mixed. This describes material carried by the site, not a blanket quality designation. Link to the source's stated review policy when available.
- Orientation: academic, operational/practitioner, policy, education or mixed.

The live application implements these classification fields. Staff repeaters and separate banner upload are in the production backlog.

## Translation and country/language discovery

Interface language and research language are independent fields. The initial interface has English, French and Spanish drafts, with a dictionary structure for expansion. Native-language editorial review is required before production. Store interface locale as a preference; do not silently translate the publisher's description or claim the external material is translated.

Registrants select all languages in which their actual research or learning resources are available. The live application provides research-language choices and stores BCP 47 codes, supports multilingual descriptions with provenance and distinguishes full-text language, summary-only language and machine-translated availability. A French interface must not cause English-only resources to match a French-content filter.

Countries are split into organisation base (ISO country code) and geographical coverage. The directory supports all countries rather than requiring UK-style email domains. Society status, country, coverage and content language can be combined. A profile declaring affiliation is not automatically marked confirmed; the society relationship must be verified. Do not infer affiliation from a hyperlink.

## Registration and confirmation

1. Registrant submits profile and creates an account. Run input validation, duplicate URL/domain checks and abuse protection. Save a private draft immediately; account creation is self-service.
2. Send a single-use, expiring confirmation link. Require explicit completion on a confirmation page so automated email scanners do not consume the action silently. Handle expiry, resend cooldowns, typo correction, duplicate accounts and generic responses that do not reveal registered addresses.
3. Confirm control of the source. An exact organisational email/domain match is one route; alternatives are DNS TXT, a verification file or a manual documented review. Public mailboxes remain eligible. Compare registrable domains using a public suffix library, not string suffix tricks. A confirmed email is not proof of site ownership by itself.
4. Validate required metadata and website accessibility. Automatically list ordinary complete, verified profiles. Route duplicate claims, conflicting ownership, suspicious activity and disputed affiliations to WA. Self-registration does not give immediate unchecked publication rights.
5. Notify the source of publication or the reason for review. Mark whether data is source-declared or editor-checked. Record check dates and provide correction/report routes.
6. For an existing editor-added listing, verify ownership before assigning manager permissions. Preserve previous public data and audit the claim decision.

Changes to verified domains, ownership and public contact permissions require re-verification. Ordinary factual edits are versioned. Admins can hide/reinstate entries with reasons; deleted-account handling does not silently remove legitimate public organisational records.

## Ranking proposal

Apply hard filters first. Rank query relevance ahead of source signals. Visitors can choose alphabetical or country order. With no query, transparent source signals order matching entries. Publish the weights and change history.

| Signal | Maximum | Conditions |
| --- | ---: | --- |
| Confirmed organisational identity | 12 | Business, academic or police/public identity checked through a documented route; other constituted organisations can also qualify |
| Website control | 8 | Domain/file verification or documented review |
| Linked social presence | 5 | 2.5 each, at most two independently confirmed profiles; no follower-count boost |
| References from other RS | 8 | Two each, at most four independent organisations; verify live referring page |
| Member recommendations | 7 | `min(7, log2(1 + eligible_unique_members))`; one per confirmed member and source |

These weights are an initial product proposal, not a validated measure of source credibility. Do not label scores as evidence quality, reliability or proven effectiveness. A company site can receive identity points without its claims being academically reviewed.

Recommendations require confirmed accounts, an account-age threshold and abuse checks. Do not count the source's own managers. Capped/logarithmic scoring limits popularity advantage. Anonymous users can browse, but public recommendations require membership. Preview thumbs are local and never influence shared rankings.

Cross-links from commonly owned sites, circular exchanges and duplicate domains must not count independently. References that disappear lose their boost after recheck. Keep manual overrides reasoned, time-limited and audited. No paid ranking advantage. Publish ownership conflicts; Nathan's own source is identified in its profile and receives no special placement signal. Account recommendations should have a transparent eligibility/appeal process, not opaque profiling.

## Branding import

After website ownership confirmation, an RS can ask the server to suggest a favicon, Open Graph image or declared logo from its own website. Preview choices, permit upload/replacement and require rights confirmation. Do not scrape staff lists or publish contacts automatically.

Fetch through a bounded server-side service: HTTPS, size/time limits, public IP validation before every redirect, restricted MIME types, no credentials, no loopback/private/link-local or metadata endpoints, and no arbitrary SVG/script execution. The current implementation serves approved PNG/JPEG/WebP addresses through a bounded first-party proxy with restrictive MIME checks; dedicated upload/re-encoding and permanent image storage remain future extensions. Provide a neutral placeholder when no suitable logo exists.

## Administration

Dashboard for new/changed/flagged sources, society directory, pending claims, failed links, verification evidence, duplicate merges, user invitations, content taxonomy, translations and communications. Each privileged change records actor, target, timestamp and reason in an append-only audit log. Audit entries exclude passwords, tokens and unnecessary private data.

Founding administrator invitation: `contact@id-ebp.org`. Require verified email and a changed initial password before moderation. Authenticator enrolment is not required. Additional administrators need a private invitation from an active administrator. The database prevents removal of the last enabled administrator. Credentials are never committed.

## Technical build

| Service | Intended role | Current position |
| --- | --- | --- |
| Cloudflare | Preview/production Workers hosting, domain/DNS, TLS, abuse protection and scheduled background work | Live at id-ebp.org on Cloudflare Workers |
| GitHub | Source control, review, build/test workflow and releases | `idorunning/international_ebp-directory`, write access confirmed |
| Supabase | Dedicated PostgreSQL project, authentication, row-level permissions and source assets | Dedicated project hvwmystbqlocjixvwgfl is active; a future organisational transfer remains separate. |
| Canva | Editable visual specification and future social templates | Design board created; updated naming/content revisions are an unsaved Canva editing draft |
| Wix | Existing account examined for site/domain tools | No duplicate Wix-hosted site; custom Cloudflare application remains the agreed architecture |
| Metricool | Candidate connector for LinkedIn/X scheduling | Suggested; connection/channel approval required |
| Email provider | Transactional confirmation/recovery mail and optional separately consented newsletter | Cloudflare Email Service connected for codes and transactional workflow mail; newsletter not enabled |

The live application is deployed as a Worker with static assets and a protected Supabase account API. Public profiles and hubs use clean, crawlable URLs, server-rendered metadata, structured data and a dynamic sitemap. Member/admin pages and the workers.dev address remain noindex. The public catalogue excludes hidden records.

Use Supabase Auth for identity. Use user-scoped database access for public reads and private saved collections. Server-side workflow endpoints use a service role only after validating the user's JWT and database permissions. Never trust editable user metadata for admin status. Keep service keys and provider tokens in secret bindings. Apply rate limiting and Turnstile to signup/claim/report routes as appropriate.

Ordered migrations, the repeatable editorial seed and PostgreSQL permissions/workflow tests are implemented and deployed to the dedicated project. Reviewed source editing, member settings, reversible moderation, scheduled maintenance and transactional workflow mail are implemented. See `docs/database-setup.md` and the [single completion checklist](https://chatgpt.com/space/page_ff709a1995908191a3d2dfcc18660533) for current publication and acceptance evidence.

## Communication workflow

On first publication of a source, prepare a factual LinkedIn post, an X post within the connected account's limit, and a newsletter entry. Include name, country, content languages, categories and a canonical IDEBP profile link. Avoid automatic claims about research success or quality.

Queue states: draft → approved → scheduled → sent, with rejected/failed/cancelled alternatives. A WA previews and approves exact text, destination account and schedule. Automated preparation is permitted; public posting requires the configured publishing authorisation. Do not publish profile edits repeatedly. Use one idempotency key per source/channel/publication event; store provider IDs and retry only known transient failures.

Newsletter suggestion: monthly new-source digest. Separate unticked opt-in; confirm subscription before inclusion; unsubscribe from every message; maintain a minimal suppression record. Registering an RS or DU must not subscribe them automatically. Transactional account mail and newsletters use separate templates and preferences. No newsletter subscription or public social-posting workflow is enabled.

## Delivery phases and acceptance

1. **Design preview:** responsive pages, actual sample sources, societies/country/language discovery, three interface languages, registration demonstration, local collections, WA/RS demonstrations, palette and draft policies.
2. **Private functional beta:** dedicated Supabase project, migrated schema and seeded sources, email confirmation, ownership proofs, role/row-level tests, real member/RS/admin accounts, image import and admin audit trail. Verify inbox delivery and recovery before opening registrations.
3. **Public directory launch:** domain, DNS/TLS, reviewed privacy/terms, reviewed translations, anti-abuse controls, crawlable routes, approved initial content, backup/restore exercise, accessibility review and monitoring.
4. **Outreach:** connected LinkedIn/X channels, approval queue, tested opt-in newsletter and documented posting authority.

No production completion is claimed by delivering a design preview. Company formation, payments, study appraisal, automatic study appraisal, society membership billing and a full social network are outside this build phase.
