# Source review — 15 October 2026

Reviewed all 115 catalogue records in five parallel batches, alongside an independent GET check of 115 primary URLs and 89 supporting URLs. Read official public pages or corroborating official indexed pages; record access limitations instead of calling blocked requests dead links.

- All 115 profiles have factual summaries labelled **Auto-generated summary** and dated link-check metadata.
- Added 88 publicly published professional email addresses, 113 contact-page links, and 113 social-profile links across 79 sources. No mailbox deliverability or provider approval is claimed.
- Added 14 optimised professional portraits, each of a listed individual or explicitly named institutional contact, with attribution and the public biography/profile page. Original image URLs remain in the audit. Public availability does not establish an open reuse licence.
- Corrected the Children's Society toolkit route, removed cookie-error tokens from two Springer links, and used the observed KICJ and Delito y Sociedad catalogue destinations.
- Kept archive/older-publication qualifications, including the Cambridge journal archive and the Children's Society toolkit's 2018 date. A reachable collection does not imply that every item is current.
- Twelve profiles record access restrictions and two record a direct check that could not be confirmed. Ninety-nine were directly working in their review and two had verified redirects. The independent pass produced somewhat different transient responses; both observations are retained.
- Checked 209 newly added public page/contact/social links. Removed an institution-linked LinkedIn address that returned HTTP 404; access restrictions remain distinct from broken links.
- Synchronised the already approved live logo into GitHub, keeping the current website identity.
- Added the site-wide correction/removal message directing readers to **contact@id-ebp.org**.

The checked-in [audit evidence](../research/source-audit-2026-10-15.json) records source-level findings and the independent request outcomes. Scraped email/social candidates were reviewed before inclusion; unrelated mailboxes and uncertain UNAFEI addresses were excluded. Public discovery contacts never become approved login/ownership contacts.

Run another read-only link check from the repository root:

```sh
python scripts/check-source-links.py public/data.js /tmp/id-ebp-link-review.json --workers 10 --timeout 18
```

This checks public GET responses and extracts contact candidates. It sends no messages, verifies no mailbox, and does not modify the published catalogue. Review results against official pages before editing `public/data.js`. Regenerate the editorial SQL seed with `npm run db:seed` after catalogue changes, then run `npm test`.

Validation: catalogue integrity, safe contact URLs/emails, summary labels, portrait packaging, existing directory behavior and database access tests. Browser preview is unavailable in this session; no visual browser acceptance claim is made.
