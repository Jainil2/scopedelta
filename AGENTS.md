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