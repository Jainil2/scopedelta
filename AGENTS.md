# ScopeDelta Agent Instructions

ScopeDelta is an AI-assisted scope-change and change-order product for small software agencies and freelancers.

## Source of truth

- GitHub issues define executable work.
- `docs/` contains durable product and architecture decisions.
- Pull requests contain implementation/review history.
- Chat conversations are not canonical company state.

## Role split

### CEO / Product (ChatGPT Work)
Owns market research, customer discovery analysis, positioning, pricing, roadmap, requirements, acceptance criteria, prioritization, experiments, launch strategy, metrics, backlog management, and product review.

### CTO / Engineering (Codex)
Owns technical architecture, implementation, migrations, tests, CI, deployment configuration, security hardening, performance, refactoring, and technical documentation.

Do not change product/business rules without an issue or documented decision.

## Issue sizing and delivery speed

Default to **one business task / product layer outcome = one engineering issue and one primary implementation PR**.

Do not automatically split work into A/B/C issues merely because the implementation has phases. Internal phases, commits, or checklists are preferred when one coherent PR is safe.

Split an issue only when there is a concrete reason, such as:

- the combined change is too large to review or reason about safely;
- one part has a real dependency that blocks the rest;
- separate migrations/deployments or rollback boundaries materially reduce production risk;
- a security/authorization boundary should be reviewed independently;
- independent customer value can ship materially earlier;
- parallel work would actually reduce elapsed time without creating integration overhead.

When splitting, record the reason in the parent/child issues. The goal is not small issues for their own sake; optimize for **elapsed time to validated customer value** while preserving reasonable engineering quality.

## Testing and CI efficiency

Quality gates remain mandatory. Optimize **when** expensive validation runs rather than reducing coverage.

### Development and review-candidate loop

1. Run the smallest relevant unit/integration tests for the code being changed.
2. Use focused browser/E2E coverage for the journey currently under construction.
3. Run focused lint/typecheck/build checks when the touched boundary warrants them.
4. Do not repeatedly run the complete hosted E2E + production build + smoke + Docker/container gate after every edit or review fix unless the specific change requires broad early confidence.
5. Push a review candidate once focused regression evidence is strong enough for CEO/product review; **a full hosted gate is not a prerequisite for CEO review**.

### CEO/product review

1. CEO reviews the exact PR head against the issue, diff, authorization/privacy boundaries, and focused test evidence.
2. If blockers are found, Codex fixes them in the same PR and reruns targeted regression checks first.
3. Repeat focused fix → review cycles without paying for the full hosted gate each time.
4. Broader early validation is appropriate when a change materially affects migrations, authentication/authorization, deployment/runtime boundaries, or another area where targeted checks cannot provide enough confidence.

### Final merge gate

1. When CEO reports **no remaining product/security blockers**, treat the PR as **functionally approved pending final merge gate** and freeze ordinary feature scope.
2. Run the complete required hosted migration/lint/typecheck/unit/integration/E2E/build/smoke/container gate once on the exact merge-candidate head.
3. Do not merge without that final gate passing.
4. If the final gate exposes a real defect, fix it, run targeted regression first, then rerun the necessary final hosted gate on the new code head.
5. Any source-code change after the final green gate must be revalidated before merge; do not rely on a green result from an older SHA.
6. Do not weaken, skip, or suppress the final merge-quality gate merely to save time.

Prefer fewer meaningful pushes and full-CI cycles. The goal is **fast review feedback plus one authoritative pre-merge validation**, not repeated 12–15 minute validation before every product review.

## Before implementing an issue

1. Read the issue completely.
2. Read all referenced docs/specs.
3. Inspect relevant existing code and tests.
4. Confirm dependencies are satisfied.
5. Do not implement anything explicitly marked out of scope.
6. Choose the simplest architecture that satisfies current requirements; avoid speculative infrastructure.

## Definition of done

Before declaring engineering work complete:

- Acceptance criteria are satisfied.
- Relevant tests are added/updated.
- Lint/typecheck/tests/build pass where applicable.
- Security/authorization boundaries are preserved.
- Documentation is updated when behavior or architecture changes.
- A PR is opened and linked to the issue.

## Pull request requirements

Every PR must include:

- Linked issue
- What changed
- Why it changed
- Tests/checks run
- Screenshots for user-facing UI changes where practical
- Migrations or deployment notes
- Known limitations or follow-up work

## Safety / approval boundaries

Do not perform irreversible production operations without founder approval, including destructive production database changes, production credential changes, material paid-infrastructure commitments, or force-pushing protected branches.

Never expose secrets or confidential customer data in logs, issues, fixtures, prompts, or commits.

## Product discipline

Optimize for validated customer/revenue outcomes rather than feature quantity. Prefer reversible, low-cost implementations. Do not add integrations, abstractions, or platform features without demonstrated need.