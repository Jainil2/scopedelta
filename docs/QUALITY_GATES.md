# Quality and merge gates

## Purpose

ScopeDelta optimizes elapsed time from implementation to merge. Ordinary pull
request validation catches obvious breakage quickly. After CEO/product approves
the behavior of an exact head, one authoritative automatic gate runs the
repository-owned quality and production-readiness bar on that merge candidate.
Browser and desktop suites remain available as optional exact-SHA manual actions.

This changes when expensive validation runs; it does not reduce the pre-merge
bar or require a paid CI/security service.

## Development and review path

For ordinary PR events, `.github/workflows/ci.yml` runs two breakage-focused jobs
in parallel:

- `Fast static and unit` installs frozen dependencies, type-checks the project,
  and runs unit tests.
- `Fast PostgreSQL integration` applies migrations once to a fresh PostgreSQL
  service and runs the integration suite.

Production build, HTTP smoke, container build, formatting, lint,
migration-definition checks, and migration-idempotency checks are intentionally
deferred. Browser and desktop validation are not PR-triggered. Superseded runs
for the same PR are cancelled. An unrelated PR label event is a no-op and uses a
separate concurrency group, so it cannot cancel an active merge-candidate run.

Codex should run the smallest relevant local tests for changed behavior before
requesting CEO/product review. The full hosted gate is not a prerequisite for
review.

## Exact-head final gate

After CEO/product reports no remaining functional or security blockers:

1. Freeze ordinary feature scope and record the current 40-character PR head
   SHA.
2. Apply the maintainer-controlled `merge-candidate` label. If the label is
   already present after a head change, remove it and apply it again.
3. The PR-associated label event checks out and verifies that exact head. It
   reruns the fast jobs with their deferred final-only checks and runs the
   production job.
4. Merge only when `Full merge gate` and all other branch-protection checks are
   green on the latest head.

The complete merge-candidate run contains:

- production deploy-guard verification;
- migration-definition checks and two consecutive migration applications;
- formatting, lint, typecheck, unit tests, and PostgreSQL integration tests;
- final-only `pnpm test:ga` scale/query-plan/export proof;
- PostgreSQL 17 dump/restore into an isolated database with comparison of
  commercial/client/audit/provider/AI/import/lifecycle evidence;
- production build and HTTP smoke test;
- production container build;

`Full merge gate` is emitted only by the PR-associated `merge-candidate` event
after every workflow-owned final job succeeds. GitHub branch protection requires
that signal on the latest head. A new commit shares the candidate concurrency
group, cancels stale expensive work, and invalidates every check on the older
SHA.

## Failure classification

- For a functional, product, security, authorization, architecture, or migration
  behavior regression, fix it, run focused regression coverage, and request CEO
  re-review when the fix can affect the approved behavior or risk boundary.
- For formatting, lint, or another mechanical code-quality-only failure, Codex
  fixes it autonomously, runs the relevant focused check, and validates the new
  merge-candidate SHA without another CEO review cycle.
- For an infrastructure or flaky failure, retry or repair the CI path without a
  source change where possible.

Do not suppress a failure or weaken the automatic final gate to avoid another
run.

## Optional manual browser and desktop evidence

The `Browser` and `Desktop` workflows use `workflow_dispatch` only. Neither is
automatic or required by branch protection. Both require a lowercase
40-character commit SHA and verify the checked-out commit before testing.

`Browser` runs the two isolated Playwright shards with ephemeral PostgreSQL and
Mailpit services. Each shard builds the web application, caches only Chromium by
the complete lockfile hash, installs system packages on the fresh runner, and
retains failure diagnostics for seven days.

`Desktop` always runs the complete manual suite: Linux Rust and TypeScript
checks, the locked malicious-crate denylist, RustSec audit, Windows preference
replacement, and the Windows, offline-WebView2 Windows, macOS universal, and
Linux installer matrix. Partial manual desktop runs are not supported.

These actions are additional diagnostic or release evidence. A failure still
represents evidence to investigate, but the actions do not produce a required
merge context.

## Security and cache boundary

ScopeDelta does not use repository-scoped GitGuardian or SonarCloud checks.
Secret-handling policy remains unchanged: never commit credentials or paste them
into logs, issues, fixtures, or review comments. If a secret is exposed, stop
the merge, revoke or rotate it, and remove it from the branch and any necessary
history.

Node setup caches pnpm's content-addressed store while every job performs a
frozen install with dependency scripts disabled. Source, build output,
databases, test results, and containers are never restored from cache.
