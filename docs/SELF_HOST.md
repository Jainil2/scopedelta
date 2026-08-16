# ScopeDelta Self-Host Operations

## Scope and license boundary

This runbook operates the shared ScopeDelta core on customer-controlled
infrastructure. It does not publish the private repository or grant rights
beyond the license ultimately approved under LIC-001. Until that gate closes,
obtain the application image/source through the founder-approved private
distribution path.

Self-host mode is free of ScopeDelta Cloud billing and phone-home requirements
for Local/LAN capability. Customers remain responsible for infrastructure,
backups, SMTP, AI providers, network access, upgrades, and applicable provider
terms/costs.

## Required production shape

- Linux host/VM/container platform suitable for Node.js 24 containers;
- PostgreSQL 17-compatible database on persistent protected storage;
- one migration job using a direct schema-owner credential;
- application runtime using a separate pooled least-privilege credential;
- maintained TLS reverse proxy with the canonical host/scheme forwarded;
- customer SMTP/local mail relay when outbound mail is required;
- optional explicit hosted BYO AI credential or protected local Ollama endpoint;
- encrypted database backups stored outside the primary host.

Mailpit in `compose.yaml` is development-only. Do not expose PostgreSQL, Mailpit,
or Ollama to an untrusted LAN or the public internet.

## Initial deployment

1. Copy `.env.compose.example` to an untracked `.env.compose` and set strong
   database/auth secrets and the canonical HTTPS `APP_URL`.
2. Keep `DISTRIBUTION_MODE=self_host`, `MANAGED_AI=false`, and
   `MANAGED_EMAIL=false`. Do not configure Paddle values.
3. Configure customer-controlled SMTP. If email is unavailable, authorized
   users can still distribute generated client invitation links manually.
4. Keep AI disabled or configure exactly one explicit provider/model. Ollama is
   installed and secured independently; ScopeDelta never downloads a model.
5. Build and migrate before starting the application:

   ```bash
   docker compose --env-file .env.compose build
   docker compose --env-file .env.compose run --rm migrate
   docker compose --env-file .env.compose up -d app
   ```

6. Put the app behind TLS, then verify signup/recovery, workspace creation,
   client/project workflows, commercial history, client collaboration, local QA,
   and any configured provider integrations with synthetic data.

## Upgrade procedure

1. Read the release notes and migration section in `docs/OPERATIONS.md`.
2. Take and verify an encrypted PostgreSQL backup.
3. Pull or load the exact approved application release; never deploy an
   unreviewed floating image tag.
4. Build the new image.
5. Run the one-shot migration service once. Do not run schema migration from
   multiple hosts concurrently.
6. Replace the application container only after migration succeeds.
7. Perform the synthetic release verification.

Migrations are forward-only. Never edit an applied SQL migration or drop new
schema objects to roll back. If the application fails after an additive
migration, restore the prior compatible application image and fix forward.

## Backup and restore

Use the direct database credential only in a restricted operator environment:

```bash
pg_dump --dbname="$DATABASE_MIGRATION_URL" --format=custom --no-owner --file=scopedelta-UTC_TIMESTAMP.dump
pg_restore --list scopedelta-UTC_TIMESTAMP.dump
```

Encrypt and restrict the dump; it contains customer-confidential commercial,
delivery, client, engineering, QA, and AI history. Regularly restore into a new
isolated database and run the verification journey. Never use `--clean` against
production. A production restore is destructive and requires founder approval
and an explicit incident plan.

## Provider-independent operation

- Local/LAN account, workspace, project, commercial, client, QA, and audit
  behavior uses the local application and PostgreSQL only.
- SMTP may be local, externally hosted by the customer, or omitted where manual
  link delivery is acceptable.
- AI may be disabled, customer-hosted, or customer-credentialed. No managed-AI
  credit is required in self-host mode.
- GitHub integration is optional. Local QA/readiness remains usable without it.
- Billing settings show the self-host core state and expose no cloud checkout.

## Recovery signals

Use stable error codes, database/provider health, fixed event log names, and
sanitized IDs. Never copy document bodies, request text, email destinations,
tokens, provider responses, credentials, or full webhook payloads into logs or
tickets.
