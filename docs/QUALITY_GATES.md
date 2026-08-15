# Quality and merge gates

## Purpose

ScopeDelta optimizes elapsed time from implementation to merge. Ordinary pull
request validation catches obvious breakage quickly. After CEO/product approves
the behavior of an exact head, one authoritative gate runs the complete quality,
regression, deployment, and security bar on that merge candidate.

This changes when expensive validation runs; it does not reduce the pre-merge
bar or require a paid CI/security service.

## Development and review path

For ordinary PR events, `.github/workflows/ci.yml` runs two breakage-focused jobs
in parallel:

- `Fast static and unit` installs frozen dependencies, type-checks the project,
  and runs unit tests.
- `Fast PostgreSQL integration` applies migrations once to a fresh PostgreSQL
  service and runs the integration suite.

Browser/E2E, production build, HTTP smoke, container build, formatting, lint,
migration-definition checks, and migration-idempotency checks are intentionally
deferred. Superseded runs for the same PR are cancelled. An unrelated PR label
event is a no-op and uses a separate concurrency group, so it cannot cancel an
active merge-candidate run.

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
   browser and production jobs in parallel.
4. Merge only when `Full merge gate` and all other branch-protection checks are
   green on the latest head.

The complete merge-candidate run contains:

- production deploy-guard verification;
- migration-definition checks and two consecutive migration applications;
- formatting, lint, typecheck, unit tests, and PostgreSQL integration tests;
- migrated-database Playwright browser journeys;
- production build and HTTP smoke test;
- production container build;
- the repository's required GitGuardian secret check and any enabled external
  quality signal.

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

Do not suppress a failure or weaken the final gate to avoid another run.

## Security and cache boundary

GitGuardian remains an always-on branch-protection signal. If it detects a
secret, stop the merge, revoke or rotate the credential, remove it from the
branch and any necessary history, and rerun the check. Never paste the secret
into logs, issues, fixtures, or review comments.

Node setup caches pnpm's content-addressed store while every job performs a
frozen install with dependency scripts disabled. The full browser gate runs two
isolated Playwright shards, each with ephemeral PostgreSQL and Mailpit services.
Each shard caches only the Chromium binary, keyed by the complete lockfile hash;
system packages are installed on each fresh runner. Failure diagnostics are
retained for seven days. Source, build output, databases, test results, and
containers are never restored from cache.
