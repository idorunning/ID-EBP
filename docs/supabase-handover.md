# Supabase live setup and later handover

Updated 16 October 2026. The dedicated project `hvwmystbqlocjixvwgfl` is active in idorunning’s organisation. The schema, editorial catalogue, account API and authentication are connected. Provisioning is complete; no further project creation or deletion is needed. The current account billing remains authoritative; this document does not quote or approve new charges.

Keep ID-EBP separate from Nathan’s other sites. A future transfer to an IDEBP-owned organisation remains a separate, explicitly approved operation. Do not change plans, remove projects or add paid services to resolve unrelated connector failures.

## Keep the build portable

- Keep ordered schema migrations, the public editorial seed and their tests in GitHub. Never commit private account data, passwords, connection strings or tokens.
- Keep project URLs and public keys in configuration; keep privileged keys in deployment secrets. Avoid project references embedded in application logic.
- Record Auth redirect URLs, confirmation requirements, SMTP configuration, buckets, file limits, edge functions, scheduled jobs and webhook dependencies alongside the implementation.
- Maintain a permissions test covering anonymous visitors, members, source managers and administrators. Include cross-account denial and last-admin protection.
- Separate demonstration data from real registrations. Before launch, decide explicitly which development records should be retained.

## Preferred handover: transfer the existing project

Supabase supports organisation-to-organisation project transfer. Current prerequisites include ownership of the source organisation, membership of the destination and removal of transfer-blocking GitHub integrations, project-scoped roles or log drains. A transfer does not change the project's region. Plan changes can affect features and availability; a paid-to-Free transfer may cause brief downtime.

When the destination is ready:

1. Confirm its owner, plan, billing and administrators. Record the project reference and take a recoverable backup appropriate to the implemented services.
2. Check transfer eligibility in the dashboard and review any plan differences. Schedule a maintenance window if needed.
3. Transfer the named IDEBP project only after approval of the concrete destination and any new charges.
4. Verify database records, Auth sign-in/confirmation/reset, storage assets, source management, saved sources, ranking and administrative audit events through the deployed site.
5. Review access and deployment integrations. Rotate secrets where a new project or changed access requires it, then verify old access is removed only after the new access works.

If a transfer is unsuitable, prepare a tested migration into a new project. Treat database records, Auth identities, storage files and configuration as separate migration items. Preserve the original until the restored service has passed acceptance checks; do not promise that copying schema alone moves user accounts or assets.

## References

Official reference links (recheck transfer conditions before acting):

- [Supabase project transfers](https://supabase.com/docs/guides/platform/project-transfer)
- [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)

Provisioning and live account setup are complete. Backup restoration and organisational transfer have not been performed.
