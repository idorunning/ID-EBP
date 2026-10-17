# Claims and saved-source verification

Scope: items 1–3 of the existing [ID-EBP completion checklist](https://chatgpt.com/space/page_ff709a1995908191a3d2dfcc18660533). The remaining checklist items are unchanged.

The account API separates committed claims from subsequent session reads. The interface separates successful submissions from failed dashboard refreshes, checks claim/review/rating state after lost responses, and gives specific permission explanations. Claims proceed through email, code and submission, then show pending or approved access. Supporting details have no minimum length and remain optional; drafts survive app/tab switching and reloads without storing codes.

Account saved sources use the existing member-owned table. Guest imports merge additively; per-source changes are idempotent. Account-specific pending operations survive connection interruptions. Sign-out and account switching isolate collections. The API checks the live member, matching account, CSRF and source publication status; existing RLS policies remain in force.

Validation: `npm test` passes 79 tests. New coverage exercises saved-claim/failed-session refresh, mutation/refresh separation, lost-response confirmation, progressive claim screens, pending and managed states, two-device collection synchronisation, guest import, account switching, interrupted writes, rapid changes during reads/writes, CSRF, identity binding and database permissions. Full mobile browser and real mailbox acceptance remain in original item 11; no browser session was available in this execution environment.
