# ID-EBP administrator traffic reporting

Prepared 18 November 2026 on the admin analytics feature branch.

## Overview

The protected page is /admin/traffic, linked from the existing administration navigation. Only a signed-in, active administrator may retrieve the API response. The existing Supabase directory RPC checks administrator status and the session before any external analytics request is made. The browser never receives analytics tokens, OAuth JWTs or service-account keys.

There are four independent sources. Do not add their numbers together: each uses a different measurement model and may have different data coverage.

| Source | What the page shows | Connection |
| --- | --- | --- |
| Cloudflare Web Analytics | Browser visits and page views, with retrieval timestamp and saved snapshot period | Existing beacon and private snapshot; report linked |
| GoatCounter | Tracked page hits, event count, daily trend and top pages | API token and active site tracker required |
| Google Analytics 4 | Sessions, estimated distinct users, page views, engaged sessions and daily sessions | GA4 property, active GA4 measurement tag and service-account access required |
| Google Search Console | Search clicks, impressions, CTR, weighted average position, daily clicks and top search terms | Verified Search Console property and service-account access required |

The 7, 28 and 90 day selector uses complete UTC days, excluding the current date. The Cloudflare snapshot is an independent historical retrieval and is always labelled with its own period: choosing 28 days cannot transform a seven-day Cloudflare snapshot into a 28-day result.

## Connect GoatCounter

1. Create or locate the ID-EBP website in GoatCounter; note the site code (the subdomain prefix, not an entire URL).
2. Confirm its tracking script is actually installed on www.id-ebp.org. The feature does not install a tracking beacon without a confirmed site code. Data recorded before installation cannot be recreated.
3. In GoatCounter, create an API key with statistics read permission, and add these secrets to Supabase project > Edge Functions > Secrets:
   - GOATCOUNTER_SITE – site code, e.g. mydirectory (illustrative).
   - GOATCOUNTER_API_TOKEN – private API token (never enter this into the browser or repository).
4. Re-deploy the Supabase directory-api Edge Function after the feature is merged, then open /admin/traffic and use Refresh.

Read-only endpoints: /api/v0/stats/total and /api/v0/stats/hits. The implementation refuses arbitrary hosts: it constructs a fixed https://<site-code>.goatcounter.com URL from an alphanumeric site code. Self-hosted GoatCounter sites need separate explicit support and should not be configured by supplying a URL in the code field.

## Connect Google (no GSC Wizard subscription required)

1. In Google Cloud, enable Google Analytics Data API and Search Console API in a project controlled by the ID-EBP administrator.
2. Create a service account. Give its email Viewer access to the correct GA4 property and appropriate read access to the verified ID-EBP property in Search Console.
3. Add these Supabase Edge Function secrets:
   - GOOGLE_SERVICE_ACCOUNT_JSON – complete private service-account JSON.
   - GOOGLE_GA4_PROPERTY_ID – numeric GA4 property ID, not the G- measurement ID.
   - GOOGLE_SEARCH_CONSOLE_SITE_URL – sc-domain:id-ebp.org, https://www.id-ebp.org/ or https://id-ebp.org/ as verified in the account.
4. Verify that the GA4 measurement tag is on the website. The reporting API does not automatically install the collection tag.
5. Redeploy directory-api, then sign in as administrator and check /admin/traffic.

The server signs a short-lived Google OAuth JWT and requests only webmasters.readonly and analytics.readonly scopes. Google reports run server-side. This integration calls Google APIs directly; the GSC Wizard subscription is not needed.

## Validation and publication

- The feature branch adds integration tests for missing connections, provider errors, date windows, proper GA4 distinct-user totals, secret non-disclosure and untrusted query escaping.
- Run npm test and verify both the website Worker and the Supabase Edge Function together on a staging environment.
- Confirm /api/admin/analytics returns 401/403 without an active administrator and includes Cache-Control: private, no-store.
- Verify that /admin/traffic is non-indexable and other administrator tabs still work.
- Refresh each provider and inspect that Connected appears only for real responses. Empty reports must show 0 only when the provider confirms a legitimate zero; lack of data or connection must show an unavailable indicator.
- Do not merge or deploy automatically without the appropriate release process. All credentials remain in Supabase secrets and are not exported.

## Privacy and interpretation

Google's distinct user count is a GA4 estimate for the whole selected period, not a sum of daily users. Search Console query rows can omit some low-volume or anonymised searches; the daily aggregation is used for total clicks and impressions. GoatCounter's counts exclude its event total from the displayed page-hit total; daily recorded activity can include events. Bot filtering and platform consent rules are handled by the provider's standard setup, not by browser fingerprinting.
