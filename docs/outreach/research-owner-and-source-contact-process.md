# ID-EBP — source and research-owner outreach

Updated 18 November 2026. Owner: Nathan Tracey. Primary sending address: **hello@thinkingaboutpolicing.org**.

## Purpose and scope

Send a single, low-key, factual notice to the verified published contact for a newly listed policing research source or, where lawful and appropriate, an individual policing research publication or blog. The notice explains that a listing exists, offers free registration to keep directory profile/contact details accurate, and welcomes corrections or removal. No donation, endorsement, research contribution or response is required.

**Priority:** contact the 134 current source organisations first; then include newly discovered sources and research records in the same process. Do not email every author of every paper indiscriminately. One initial introduction per mailbox, even where that contact is linked to many papers.

## Agreed initial message

Subject: Introducing ID-EBP — your policing research listing

Dear **[Verified recipient name or organisation/team name]**,

I am writing to introduce the **International Directory of Evidence-Based Policing (ID-EBP)**, where **[exact source or research title]** is included.

[Direct ID-EBP listing link]

ID-EBP is a free international, searchable directory dedicated to policing research. It currently brings together more than 17,000 records from 134 sources, organised by research topic and linked to original publications.

**Registration and source claims are free.** If you represent a listed research source, you are welcome to claim its profile so that authorised representatives can keep organisational and contact details up to date. There is no charge, obligation or request for a contribution.

ID-EBP is independently developed, funded and maintained by me as a project of [Thinking About Policing](https://www.thinkingaboutpolicing.org).

If any information needs correcting, or you would prefer a listing removed, please reply to this email. Feedback is welcome, and you can also reply if you would prefer no further contact.

Kind regards,

**Nathan Tracey**  
Founder, ID-EBP and Thinking About Policing  
https://www.id-ebp.org  
https://www.thinkingaboutpolicing.org  
https://www.linkedin.com/in/nathan-tracey-3b85a9427

Adapt the wording for research-only records: do not imply authors can claim a whole source or that ID-EBP has independently appraised the study.

## Discovery and review procedure

1. The daily `private.refresh_outreach_queue()` job registers each published source and catalogue research record as an outreach target. It imports any source-maintenance `mailto:` suggestions as **unverified private candidates**. Existing evidence in `docs/outreach/category-invitation-list.csv` is a historical *draft*, not a verified send list. Never infer that an email address belongs to a researcher merely from the domain or paper metadata.
2. For a source, prefer an official published generic/role-based organisational email, verified against a current contact page. Record the source URL, date, recipient's published name if known and contact classification. For a publication, record the actual publisher, blog or author contact route and its permission basis; do not guess or scrape personal mailboxes.
3. An administrator must confirm the address, matching target, contact category, UK GDPR lawful basis, and whether the proposed message is permitted under PECR and the published ID-EBP privacy notice. Candidate status remains `needs_review` otherwise. Personal and unknown addresses cannot be marked approved by the database constraint.
4. Check `private.outreach_suppression`, historical delivery logs, prior correspondence and source-ownership status. The service never sends to someone who has objected, to a withdrawn source or to Nathan's own addresses. Individual subscribers (including sole traders) should not receive unsolicited promotional emails without an applicable PECR exception/consent. For overseas recipients, consider local rules too.
5. Use the sender **hello@thinkingaboutpolicing.org** only after the sending service is verified as able to send from that address. Never use the auth-code sender `sign-in@auth.id-ebp.org` for introductions, and never use the transactional `private.workflow_outbox` for outreach.
6. Personalise the greeting and listing link. After a confirmed delivery, record recipient, target, provider message identifier and timestamp in `private.outreach_delivery_log`. For an uncertain sender result, mark `uncertain` and reconcile before any retry. No automatic resend of an uncertain delivery.
7. Record objections and removal requests immediately in `private.outreach_suppression`, and direct listing-removal requests to the existing publication workflow. Retain only minimum suppression details; no publication of scraped emails. Maximum one initial introduction to an address, with a separate approved follow-up only if justified and consistent with the live contact policy.

## Current operational boundaries

- 134 published source listings. The existing draft CSV contains 115 rows, 88 with contact *candidates*, not approved recipients. Existing source-maintenance results have some candidate addresses but are not sufficient proof of consent or a verified contact.
- The ChatGPT-connected Gmail sender for `hello@thinkingaboutpolicing.org` failed with an internal tool error on 18 November 2026. **No successful send was confirmed.** A future sender needs authenticated access and a deliberate end-to-end send/receipt test.
- The nightly database job **only discovers and queues**. It does not dispatch. Enable an outbound dispatcher only after the account connection, opt-out handling, deduplication, and real message test are functioning.
- The directory's published policy currently limits proactive contact to published organisational or role-based email addresses. Individual author correspondence needs a specific legal/privacy assessment or an opt-in; simply finding an email does not confer permission to use it.
- UK ICO guidance: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/ and https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-checklist/.

## Monitoring queries

```sql
select target_kind,status,count(*) from private.outreach_targets group by 1,2 order by 1,2;
select review_status,contact_kind,count(*) from private.outreach_contact_candidates group by 1,2;
select count(*) as approved_to_send from private.outreach_eligible;
select state,count(*) from private.outreach_delivery_log group by 1;
select jobname,schedule,active from cron.job where jobname='outreach-target-refresh-daily';
```
