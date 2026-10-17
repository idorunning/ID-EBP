# Independent PostgreSQL sessions and restore verification

The database audit now has a real PostgreSQL integration runner, in addition to
the PGlite tests. Run `node scripts/test-postgres.mjs` as a normal operating-system
user with PostgreSQL 16 server and client binaries installed. Set
`ID_EBP_POSTGRES_BIN=/usr/lib/postgresql/16/bin` if they are not discovered.

The dedicated **PostgreSQL 16 concurrency and restore** GitHub Actions job uses
Ubuntu 24.04 and official Ubuntu PostgreSQL packages. It preserves its JSON
result and synthetic server log as a 14-day workflow artifact. No npm database
driver or production secret is required.

## What the runner verifies

| Check | Evidence required to pass |
|---|---|
| Approval races a later suspension | A second administrator blocks in a different PostgreSQL session, then suspension removes management access. |
| Suspension races a later approval | Approval blocks until suspension commits, then fails with SQLSTATE `42501`; the claim remains under review. |
| Two simultaneous owner insertions | The second session waits on the unique constraint, then fails with `23505`; only one owner exists. |
| Concurrent outbox workers | Separate sessions reserve 25 distinct messages in batches of 10, 10 and 5. Delivery-budget serialisation is allowed. |
| Duplicate revision retry | The competing request waits, returns the same revision ID and leaves one revision and one audit entry. |
| Concurrent account-session database requests | Forty distinct confirmed synthetic accounts complete in independent connections. p50/p95 include process and connection startup. |
| Logical backup and restore | `pg_dump`/`pg_restore` reconstruct every synthetic row with matching counts and digests; RLS, privileged RPC restrictions, owner uniqueness, revision sequence and a session query also survive restoration. |

The race tests inspect `pg_stat_activity` and `pg_blocking_pids` to establish a
real lock wait. They do not infer synchronisation from a delay or from checking
the SQL source text.

## Isolation and limits

The runner initialises its own cluster in a private temporary directory, enables
only a Unix socket, and strips PostgreSQL connection environment variables. It
never accepts `DATABASE_URL`, connects to a remote server or reads production
data. It stops and removes the cluster on completion. If shutdown fails, it
reports failure and preserves the synthetic cluster path for explicit cleanup.

The Auth tables contain synthetic fixtures. This verifies application database
sessions and transaction handling; it does **not** measure Supabase Auth token
refresh, email delivery, edge latency, production connection-pool limits, or
production backup recovery. The logical restore is a fixture recovery test,
not a claim that production backups have been downloaded or restored.

## Local execution status, 17 October 2026

The Work Mode execution environment could not run the real PostgreSQL server:

- No `postgres`, `psql`, `pg_ctl`, `initdb`, Docker or Podman executable was present.
- `/proc/self/uid_map` and `gid_map` mapped only UID/GID 0; all process capability
  sets were zero.
- `apt-get update` failed while attempting `setgroups`, `setegid` and `seteuid`.
- PostgreSQL requires a non-root server user, so the runner explicitly refused
  to initialise a cluster. No privilege or PostgreSQL safeguard was bypassed.

JavaScript syntax was checked locally. The JSON report recorded this execution
as **failed with zero executed integration checks**, rather than treating the
environmental blocker as a pass. The CI job must finish successfully before
these independent-session and restore checks are described as verified.

References: [PostgreSQL 16 initdb](https://www.postgresql.org/docs/16/app-initdb.html),
[PostgreSQL logical dumps](https://www.postgresql.org/docs/16/backup-dump.html),
[official Ubuntu PostgreSQL 16 package updates](https://lists.ubuntu.com/archives/noble-changes/2026-August/058341.html).
