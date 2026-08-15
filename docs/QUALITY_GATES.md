# Quality and merge gates

## Purpose

ScopeDelta uses two CI tiers. Pull-request pushes receive fast feedback that is
useful during implementation and CEO review. After functional approval, an
explicit full gate validates the exact frozen PR head. This changes when the
expensive work runs; it does not remove migration, integration, browser, build,
smoke, container, quality, or security coverage from the merge boundary.

No paid CI or security product is required by this design.

## Required PR signals

`main` protection requires these checks on the latest PR head:

| Check                         | Owner                      | Meaning                                                                                                                 |
| ----------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Fast static and unit`        | GitHub Actions             | Deploy guard, migration definitions, formatting, lint, typecheck, unit tests, and executable unit LCOV evidence passed. |
| `Fast PostgreSQL integration` | GitHub Actions             | The complete migration chain applies twice and PostgreSQL integration tests produce executable LCOV evidence.           |
| `SonarCloud Code Analysis`    | SonarQube Cloud GitHub App | PR-relative new-code static analysis meets the configured quality gate.                                                 |
| `GitGuardian Security Checks` | GitGuardian GitHub App     | The commits in the PR were scanned without a detected secret.                                                           |
| `Full merge gate`             | GitHub Actions             | Every expensive full-gate job passed for the exact approved SHA.                                                        |

Protection is strict, applies to administrators, blocks force pushes and
deletions, and requires conversations to be resolved. A check result on an old
SHA cannot authorize a newer head.

## Review workflow

1. During implementation, run the smallest relevant unit, PostgreSQL
   integration, or browser regression locally.
2. Push the focused-tested head. `.github/workflows/ci.yml` runs static/unit and
   PostgreSQL integration jobs in parallel. Superseded runs on the same PR are
   cancelled.
3. CEO/product reviews that head without waiting for browser, production build,
   smoke, or container work.
4. Fix review blockers with focused validation and repeat review. Do not use the
   full gate as the inner development loop.
5. After functional approval, freeze feature scope and record the full
   40-character lowercase PR head SHA.
6. Apply the `merge-candidate` label to the PR. The label event is an explicit
   maintainer-controlled trigger, and GitHub binds the resulting PR workflow to
   the current head SHA. With GitHub CLI, the equivalent is:

   ```bash
   gh pr edit <pr-number> --repo <owner/repository> --remove-label merge-candidate
   gh pr edit <pr-number> --repo <owner/repository> --add-label merge-candidate
   ```

   Removing the label first is only needed when rerunning the gate on a changed
   head. Removing it does not start CI; adding it starts exactly one full run.

7. The exact-SHA guard checks out and verifies the head captured by the label
   event. A newer push cancels that run and moves branch protection to the new
   SHA. The full jobs then run in parallel:
   - deploy guard, migration definition check, format, lint, typecheck, unit
     tests, and unit coverage;
   - migrations twice, PostgreSQL integration tests, and integration coverage;
   - migrations plus all Playwright browser journeys;
   - production build, production HTTP smoke, and production container build.
8. `Full merge gate` is emitted by that PR-associated run only when every job
   succeeds. This association is required so GitHub branch protection recognizes
   the check; a manually dispatched commit check is not an authoritative merge
   signal. Merge only while all required checks are green on that latest head.

Pushing another commit after a green full gate makes the old check irrelevant
to branch protection because it belongs to the previous SHA, and the new push
cancels any superseded expensive run. If a full-gate failure exposes a real
defect, remove the freeze only for that defect, prove the focused regression
first, obtain any required re-review, then remove and reapply the label to run
the full gate again for the changed SHA.

## Coverage signal

### Why Sonar showed `0.0% Coverage on New Code`

The repository is connected through SonarQube Cloud automatic analysis. That
analysis can inspect JavaScript and TypeScript source, but it does not execute
tests and does not support importing JavaScript/TypeScript LCOV coverage.
Before issue #28, Vitest also ran without a coverage provider or report, so no
LCOV file existed for any scanner to consume. The displayed zero therefore did
not describe the substantial unit/integration/browser suite; it described a
missing coverage data path.

Sonar's supported remedy is CI-based analysis with automatic analysis disabled
and a `SONAR_TOKEN`. The repository currently has no `SONAR_TOKEN`, and creating
or storing a new analysis credential is a separate account-security operation.
Issue #28 therefore uses the explicitly allowed equivalent signal instead of
pretending automatic analysis consumed a report:

- Vitest's V8 provider writes `coverage/unit/lcov.info` and
  `coverage/integration/lcov.info`.
- `scripts/verify-coverage.mjs` fails when a report is absent, contains no
  instrumented executable lines, or contains zero covered executable lines.
- The verifier writes covered/instrumented line counts and the calculated
  percentage to the GitHub job summary.
- Both LCOV files are retained as exact-SHA GitHub Actions artifacts for 14 days.
- The same evidence is regenerated in the authoritative full gate.

No arbitrary percentage threshold was introduced. The enforced invariant is
that supported executable tests actually run and produce non-zero coverage
evidence. Reviewers can inspect changes in the reported counts while the team
collects enough history to choose a defensible threshold.

`sonar-project.properties` records the source/test boundaries and both LCOV
paths so a future approved migration to CI-based Sonar analysis is deterministic.
That migration must first create a least-privilege `SONAR_TOKEN`, disable
automatic analysis to avoid duplicate/conflicting results, add the official
scanner to CI, and verify a representative PR before Sonar coverage replaces
the Actions-native evidence.

## New code versus inherited debt

Sonar pull-request analysis defines new code from the PR diff against its target
branch. The required `SonarCloud Code Analysis` check therefore continues to
fail genuinely new reliability, security, or maintainability findings; no rule,
threshold, or file-wide suppression is weakened here.

The SC-005B `updateWorkItem` ambiguity was handled by the deliberately scoped
SC-005C extraction already on `main`: the current function has low cognitive
complexity and delegates validation, label replacement, and audit construction.
It is no longer a large legacy function whose tangential edit creates the prior
ambiguous blocker. Other findings already merged into `main` are inherited debt,
while modifying affected code can legitimately bring it into the PR new-code
scope. Such findings must be fixed or explicitly reviewed; they are not globally
waived.

## Secret scanning

The repository is private and owned by a personal GitHub account. Repository
native secret scanning is currently unavailable/disabled for this repository
without a different eligible GitHub security plan. Issue #28 does not purchase
or enable a paid service.

The installed GitGuardian GitHub App is the repository-native equivalent used
for PR review. Its `GitGuardian Security Checks` check is explicit in the PR
checks list and reports the number of commits scanned. Verification on PR #39
showed a successful check with 10 commits scanned and no detected secrets. Main
protection requires this GitGuardian-owned check, so a missing or failing signal
does not silently pass the merge policy.

If a secret is detected, stop the merge, revoke/rotate the credential at its
provider, remove it from the branch and any necessary history, and re-run the
check. Never paste the secret into logs, issues, fixtures, or review comments.

## Caching and trust boundary

Node setup uses pnpm's content-addressed store cache while every job still runs
`pnpm install --frozen-lockfile --ignore-scripts`. The full browser gate runs
two isolated Playwright shards in parallel, each with its own ephemeral
PostgreSQL and Mailpit services. Each shard caches only Playwright's Chromium
binary, keyed by the complete lockfile hash; system dependencies are installed
on every fresh runner. Failure diagnostics are retained for seven days. Source,
generated build output, databases, test results, and containers are not restored
from cache. This limits stale-result risk while avoiding repeated
dependency/browser downloads.
