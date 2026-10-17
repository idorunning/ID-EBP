# ID-EBP search visibility and visitor reporting

Updated 16 October 2026.

## Implemented foundation

Public source profiles now have clean `/source/<slug>` URLs. Existing `/#/source/<slug>` links migrate in the browser. The server returns readable source descriptions and real links before JavaScript executes. Every profile has its own title, description, canonical URL, Open Graph preview and structured WebPage/Breadcrumb data. Auto-generated source summaries are labelled; approved source revisions receive a reviewed-source label. The structured data deliberately makes no promise of review stars in Google.

`/sources/<category>`, `/countries/<country-code>` and `/topics/<topic>` provide focused discovery pages. The sitemap uses the authoritative published catalogue, so additions and removals appear automatically. Private member/admin screens and search/filter combinations return noindex. Unknown or withdrawn profiles return HTTP 404. The production host is indexable; the workers.dev preview remains noindex. www and HTTP redirect to HTTPS id-ebp.org.

`/catalogue.json` exposes public, labelled source metadata without account emails, ownership evidence or moderation records. `/llms.txt` points machine readers to the catalogue, source guide and ranking explanation. This helps discovery; it does not guarantee inclusion or citations in any AI system.

## Next steps for organic discovery

1. Verify the `id-ebp.org` domain in Google Search Console and Bing Webmaster Tools, then submit `https://id-ebp.org/sitemap.xml`. Inspect the home page, a profile and a category page after deployment. The connected GSC Wizard service is currently blocked by an expired subscription; no submission or Google property verification is claimed.
2. Target useful intents: “evidence-based policing sources”, “policing research directory”, “EBP societies”, “policing evidence reviews”, and specific topic/country combinations. Each hub should answer a real discovery need. Avoid duplicate, thin location pages and repeated keyword lists.
3. Expand the source guide with practical, referenced explanations of finding reviews, assessing methods and translating research into practice. Link these guides to relevant profiles and topic hubs. Distinguish directory summaries from independent appraisal.
4. Ask listed providers to confirm their information and link to their own directory profiles from appropriate resource pages. Prioritise accurate institutional references, EBP societies and professional networks. No outreach is sent by this change.
5. Review search queries, impressions, clicks, indexed URLs and page experience monthly. Improve pages that attract relevant impressions but few clicks. Check broken links and source freshness as part of the existing source-review workflow. Indexing and positions depend on the search engines; no ranking is guaranteed.

## Traffic measurement

Cloudflare Web Analytics has been created specifically for id-ebp.org and its cookie-free browser beacon is included. The property was created on 15 October 2026. Browser collection is live; earlier history cannot be recreated. The admin area links to the live Cloudflare report and distinguishes browser visits/page views from raw edge requests. Ordinary non-JavaScript crawlers are not browser visits, but browser automation may still appear. Visits are not distinct people and must not be labelled unique users.

The admin service shows a timestamped Cloudflare retrieval snapshot in private runtime configuration. A daily connected-tool refresh keeps the seven complete UTC days current without giving a Cloudflare API credential to the browser. This is explicitly a snapshot, not a continuously refreshed report. Embedded live Cloudflare API reports require a read-only analytics credential; the connected Cloudflare authorisation does not permit creating one. No account credential is exposed to the browser.

GA4 and Search Console are separate services: GA4 estimates distinct users, sessions and engagement; Search Console measures search impressions, clicks and queries. The current Google reporting connector requires a subscription and cannot expose those accounts or link them. The admin screen shows this setup state instead of fabricated numbers. Once access is restored, link the correct GA4 property and domain property; exclude known bot traffic and internal/admin visits using the supported platform controls. Do not add IP-based homemade visitor fingerprints or present raw request counts as human users.

Administrator member reports are already live account data: email confirmation, join date, last sign-in, membership state, source roles, claims, ratings and recorded decisions. These are restricted to administrators and exportable. Anonymous traffic is a separate aggregate dataset.

## Acceptance checks

Local tests cover server-readable profiles, individual canonical URLs, public/private indexing rules, sitemap/catalogue privacy, live-source withdrawal, mailbox challenge binding, optional claim evidence, preserved administrator identity, self-review auditing and private report permissions. Browser interaction and real mailbox round-trips still need user acceptance checks; no browser test is claimed.

## Publication status

The tested update is prepared on `codex/source-claims-ratings-seo`. Automatic approval review blocked a direct update to `main`; production publication of the new frontend is pending Nathan's approval. The account API was restored to the published version and the transition migration preserves the current claim form. Database support for administrator self-review and the private report queries is already installed. Publish the new account API and Worker together after approval; do not describe the new frontend as live before that happens.
