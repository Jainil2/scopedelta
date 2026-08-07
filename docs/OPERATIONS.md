# Production Operations

## Status

Accepted for SC-003. This runbook covers the public landing page and paid-pilot
lead path only. It does not authorize a custom domain, paid plan, database, CRM,
analytics, authentication, or any Week-2 product capability.

## Production services

- **Application host:** Netlify Free, connected to the `Jainil2/scopedelta`
  GitHub repository. Netlify's Free plan permits commercial projects and has a
  hard monthly limit rather than automatic overage charges.
- **Lead receiver:** a founder-owned Formspree form on its free plan. It accepts
  the existing versioned JSON webhook without adding client-side credentials or
  coupling application code to the provider.
- **Canonical origin:** the public `https://<site-name>.netlify.app` URL. A
  custom domain is optional and is not a launch dependency.

The production branch is `main`. Netlify builds each merged `main` commit using
the checked-in `netlify.toml`, `.nvmrc`, `packageManager` declaration, and pnpm
lockfile. Deploy previews and branch deploys should remain disabled while they
are not needed so the free build allowance is reserved for production.

## Required production environment

Set these variables in Netlify for the Production deploy context only:

| Variable           | Value                                      | Exposure                 |
| ------------------ | ------------------------------------------ | ------------------------ |
| `APP_URL`          | Exact public Netlify origin, without slash | Builds and Functions     |
| `LEAD_WEBHOOK_URL` | Founder-owned Formspree form endpoint      | Builds and Functions[^1] |

[^1]:
    Netlify Free does not offer per-variable scope restrictions. Use only the
    Production deploy-context value and mark it as containing secret values.

Do not prefix either variable with `NEXT_PUBLIC_`. Treat the Formspree endpoint
as an operational secret even though it is not a bearer credential: exposing it
would allow submissions to bypass ScopeDelta's validation and honeypot. Never
copy lead values into Netlify build logs, function logs, issue comments, test
fixtures, or deployment screenshots.

After changing environment variables, trigger a new production deploy. Next.js
server functions do not receive a changed deploy environment until the new
deploy is published.

## First deployment

1. In a founder-controlled Netlify account, import `Jainil2/scopedelta` from
   GitHub and select the Free plan. Do not add billing details or accept a paid
   upgrade.
2. Confirm `main` is the production branch, `pnpm build` is the build command,
   and `.next` is the publish directory. Repository configuration should supply
   these values; do not override it with different dashboard values.
3. Keep the generated `netlify.app` URL. Set project visibility to Public, and
   disable unneeded deploy previews and branch deploys.
4. In a founder-controlled Formspree account, create one form named
   `ScopeDelta paid-pilot applications`. Keep notification recipients limited
   to founder/company-controlled mailboxes.
5. Add `APP_URL` and `LEAD_WEBHOOK_URL` in the Netlify Production deploy context,
   mark the webhook value secret, and deploy `main`.
6. Record the public origin and successful delivery evidence in the SC-003 pull
   request. Do not paste the webhook URL or submitted lead fields.

## Launch verification

Use synthetic, non-confidential data dedicated to this check.

1. Open the public origin in a private browser window and confirm HTTPS, a 200
   response, the ScopeDelta heading, the hero image, and the paid-pilot form.
2. Submit one test application with a unique address or plus-tag, such as
   `founder+sc003-<date>@your-company-domain.com`, and a scope challenge that
   says it is synthetic launch verification. Never use a real prospect's data.
3. Confirm the browser shows the success state exactly once.
4. In Formspree, confirm one new submission has the event name
   `pilot_interest.submitted`, schema version `1.0`, matching submission UUID,
   timestamp, source, and normalized lead fields.
5. Confirm the Formspree notification arrives at the controlled mailbox, if
   notifications are enabled.
6. Check the Netlify function logs only for execution errors. Do not add logging
   of request bodies, webhook bodies, email addresses, names, or challenges.

The public flow is operational only after steps 1-4 pass. A 200 page response
alone does not prove lead delivery.

## Routine lead handling

Review new submissions in the founder-controlled Formspree dashboard. Use the
submission UUID to identify duplicates; the application sends it as both a
field and `Idempotency-Key`, but the receiver may not enforce idempotency. Export
only when necessary, store exports in approved company storage, and delete
synthetic verification entries after the check. Apply the shortest practical
retention period and remove stale prospect data regularly.

Formspree plan or rate-limit failures appear to visitors as the same recoverable
submission error as other upstream failures. The form preserves their fields
and reuses the submission UUID when they retry. Investigate receiver status and
limits before asking anyone to resubmit.

## Rollback and disable procedures

### Roll back a bad application deploy

1. In Netlify, open **Deploys** and select the last known-good production deploy.
2. Publish that deploy as the current production deploy.
3. Verify the public origin and submit a new synthetic lead end to end.
4. Revert the faulty Git commit through a pull request so the repository and
   deployed state converge. Do not force-push `main`.

### Disable lead intake only

Remove `LEAD_WEBHOOK_URL` from the Production deploy context and publish a new
deploy. The landing page remains available, while submissions fail safely and
retain the visitor's input. Restore the value and redeploy to re-enable intake.

### Disable the public site

Stop Netlify auto-publishing, then unpublish the project in Netlify. This is the
emergency path for a privacy or security incident. Do not delete the Netlify or
Formspree project; preserving reversible history is safer than destructive
cleanup. Re-enable publishing only after the incident is resolved and the full
launch verification passes.

## Service limits and follow-up triggers

The selected services are intentionally low-cost validation infrastructure.
Monitor the Netlify credit allowance and Formspree submission allowance in their
dashboards. Do not add billing or upgrade either plan without founder approval.
Revisit the receiver architecture only after validated volume, retention,
workflow, or reliability needs justify a database, queue, CRM, or another
approved integration.
