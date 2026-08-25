# Data Lifecycle Inventory

SC-012 adds operational export and non-destructive closure processing. It does
not establish legal retention or authorize physical deletion. A processed
request leaves workspace access and authoritative records intact; purge always
fails with `physical_purge_policy_required`.

| Data class                 | Durable location                                                        | Owner export                                                     | Treatment / authority                                                                                 |
| -------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Accounts/shared identities | users and Better Auth tables                                            | safe member identity only; no accounts/sessions/passwords/tokens | reset revokes sessions; suspension does not delete; retention needs founder/legal policy              |
| Delivery                   | workspace/client/project/planning/work/allocation/time                  | workspace/project NDJSON                                         | authoritative, non-destructive                                                                        |
| Commercial                 | source bytes and graph/history                                          | metadata NDJSON plus original files and SHA-256                  | immutable/superseding; retention needs policy                                                         |
| Client collaboration       | participant/projection/discussion/packet/action/acceptance/notification | yes; token hashes excluded                                       | revocation removes access, not evidence                                                               |
| Engineering/QA             | installation/repository/artifact/snapshot/link/verification/defect      | yes; no credentials/raw provider payload                         | reconciliation updates normalized current evidence and preserves history                              |
| AI                         | jobs/attempts/action evidence/context/result                            | yes; no credentials/raw payload                                  | expired leases fail safely and reservations release idempotently                                      |
| Import                     | sessions/rows/source identities and objects                             | yes                                                              | partial commits remain inspectable/retryable                                                          |
| Billing/usage              | local subscription, checkout/event hashes, usage                        | yes; no provider credentials/raw payload                         | signed replay-safe reconciliation; no live-pricing commitment                                         |
| Audit/client acceptance    | append-oriented audit and immutable actions                             | yes                                                              | preserved; closure processing cannot rewrite it                                                       |
| Lifecycle                  | state/operator UUID/blockers/linked export                              | yes                                                              | requested → in_review → blocked\|processed; blocked → in_review; cancel unprocessed; purge prohibited |
| Export                     | 24-hour run metadata and database-backed parts                          | prior metadata only; nested artifact bytes excluded              | exact retry until expiry; operational/open-format, not legal archive                                  |
| Incidents/alerts           | fingerprints, IDs, enums, counters, hashes, times, safe codes           | workspace incidents yes; global delivery evidence local          | reconcile open/resolved, digest/reminders/stale-claim retry                                           |
| Backups                    | operator-controlled PostgreSQL storage                                  | not embedded                                                     | encrypt, restrict, restore-test; production deletion needs approval                                   |

## Export boundary

`POST /api/v1/workspaces/{workspaceId}/exports` creates an owner-only 24-hour
export. Deterministic tar.gz parts remain below 15 MB and contain
`manifest.v1.json`, bounded NDJSON, content hashes, and original commercial
files. Same-origin POST downloads retry the exact stored part after interruption.

The exporter fails closed if a dataset exceeds 100,000 rows, one record exceeds
5 MB, a commercial source hash differs, or a compressed part exceeds its cap.
It never silently truncates. It is not a transactionally frozen legal archive,
e-discovery package, or final retention mechanism.

The exact-SHA final gate runs PostgreSQL 17 `pg_dump`/`pg_restore` into an
isolated database and compares commercial hashes plus client action, audit,
provider, AI, import, and lifecycle evidence counts.
