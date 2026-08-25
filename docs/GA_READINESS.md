# GA Readiness — SC-012

## Recommendation

**GO WITH EXPLICIT LIMITATIONS**, conditional on focused evidence passing, CEO
review finding no blocker, the complete exact-SHA merge gate passing (including
PostgreSQL 17 scale/restore proof), and production operator ownership being
established. Any critical authorization isolation, restore corruption, lost
commercial/client/audit evidence, or unrecoverable async failure changes this
to **NO-GO** until corrected.

## Evidence

- Layer 0–7 authorization matrix, route contract, negative tenant/role/token
  coverage, and private surface headers.
- Migration `0020_ga_hardening`: operator actors, lifecycle/export evidence,
  incidents/SMTP evidence, and stale-work indexes.
- Owner-only multipart tar.gz export with manifests, NDJSON, hashes, original
  commercial bytes, secret omissions, integrity checks, and retry downloads.
- Operator lifecycle CLI with blocker rechecks, non-destructive processing, and
  fail-closed purge.
- Content-free SMTP digest/reminders, stale claim recovery, disabled/no-outbound
  self-host behavior, and 15-minute Netlify scheduling.
- Expired AI lease/reservation recovery, GitHub delivery recovery, post-auth
  throttles, and expired limiter cleanup.
- Final-only 500-member, 101-project, 5,050-item scale, bounded query/export
  proof, query-plan assertion, and PostgreSQL 17 restore comparison.

## Explicit limitations

- No SSO/SAML, SCIM, arbitrary RBAC, residency, certification, SLA, or global
  operator web console.
- No physical deletion/final legal-retention policy. Processed requests leave
  access and data intact.
- No live pricing/payment launch commitment.
- SMTP is the only outbound operator-alert transport; no alert webhook.
- Without `OPERATOR_ALERT_TO`, self-host remains local-only and makes no alert
  network call.
- Export artifacts live in PostgreSQL, expire after 24 hours at the API boundary,
  and are not a legal point-in-time archive. Multipart parts stay below 15 MB
  because Netlify streams are capped.
- The GA fixture is a practical boundary, not unbounded scale. Scale up when DB
  IO/size, query latency, queue delay, connection pressure, export part count,
  or incident volume approaches operator thresholds.

## Sign-off

- [ ] `pnpm production:validate` passes in the production environment.
- [ ] Direct migration and pooled runtime credentials are separate.
- [ ] Encrypted backups are access-restricted and restore-tested.
- [ ] SMTP recipient is monitored, or local-signal ownership is assigned.
- [ ] AI/GitHub/Paddle/SMTP containment and recovery owners are known.
- [ ] Dependency/security maintenance cadence is assigned.
- [ ] CEO reviewed limitations and exact PR head.
- [ ] Complete exact-SHA merge candidate gate is green.
