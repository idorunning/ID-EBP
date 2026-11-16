# Legal and policy pages: record

Published 16 November 2026 (version 1.0). Source text: `public/legal.js`. Live at /ownership, /privacy, /terms, /cookies, /listing-policy, /legal and /support.

Supersedes `docs/privacy-notice-draft.md` as the public notice.

## Decisions recorded in the published text

- Owner: Thinking About Policing (not a company or charity). Operator and UK GDPR controller: Nathan Tracey, personal capacity; not affiliated with any police force or government body.
- Public contact: hello@thinkingaboutpolicing.org.
- Processors listed: Cloudflare, Supabase (Frankfurt), Proton, GitHub. Buy Me a Coffee is a separate controller.
- Outreach: organisational or role-based published addresses only; one invitation plus at most one follow-up; opt-out honoured and recorded.
- Removal: a source listing and its attached records are removed at the owning organisation's request; target 10 working days.
- Retention schedule as published on /privacy (30 days unconfirmed accounts and logs, 90 days ownership evidence, 12 months audit, 2 years correspondence, 6 years contribution records, backups within 12 months).
- Contributions: https://buymeacoffee.com/thinkingaboutpolicing (same page as TAP), worded as "Contribute to running costs"; support page explains ID-EBP is run in spare time and paid for personally by Nathan, with no grant, sponsor or advertising; no influence over listings; no Gift Aid. "Support ID-EBP" link in the top bar and footer.

## Still to confirm operationally

1. ICO data protection fee: done. Nathan Tracey is registered with the ICO, registration number ZC291698, published in the privacy notice (v1.1). Renew annually.
2. Scheduled deletion that matches the published retention periods. The notice says that until this is automated, records are reviewed and deleted by hand at least every three months; audit events cannot be deleted by the app role, so this needs an admin task.
3. Outreach emails must include an opt-out line and a suppression list must be checked before sending.
4. French and Spanish users see a note that the English text applies; translate if needed.

## Robots.txt

Source checks (`inspectSource` in `backend/maintenance.mjs`) read robots.txt first for the `ID-EBP` agent and `*`. Disallowed pages, or a 5xx robots response, are recorded as `restricted` with `robotsDisallowed: true` and not read.

## Changing a policy

Edit `public/legal.js`, bump the document's `version`, update `LEGAL_EFFECTIVE` if needed and add a line to `LEGAL_HISTORY`. The /legal page shows the record.
