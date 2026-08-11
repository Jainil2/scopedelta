# Layer 4 Engineering & QA Delivery Loop Research — 2026-08

## Decision summary

Layer 4 should **not** turn ScopeDelta into another code-review UI, Git host, CI runner, or full test-management suite.

The validated Layer-4 product wedge is:

> **ScopeDelta connects commercial authorization, planned delivery, implementation evidence, QA verification, defects and client acceptance into one reconstructable delivery-evidence chain.**

The target chain is:

`client request / baseline scope → commercial basis → work item → implementation evidence → review/check evidence → QA verification / defect evidence → delivery acceptance`

The product value is not that ScopeDelta can display a pull request. GitHub, GitLab, Jira and Linear already do that well. The value is that a PM, QA lead, delivery lead or account owner can answer:

- Which commercially authorized requirements have implementation evidence?
- Which delivered work has not been reviewed or verified?
- Which failed checks or defects affect a client deliverable?
- Which client acceptance was based on which delivery/verification state?
- Where is the delivery chain incomplete or stale?

## Research scope

Reviewed current official workflows/documentation for:

- GitHub issue ↔ pull-request/check relationships and GitHub App/webhook boundaries;
- GitLab issue ↔ merge-request/pipeline/test-report workflows;
- Jira development-panel/build/deployment linkage;
- Linear GitHub linking, workflow automation and in-product code review;
- Jira/Linear/GitLab QA/test-management patterns relevant to whether ScopeDelta should build a large test-management subsystem.

Research date: 2026-08-11.

## Competitor/workflow findings

### GitHub

GitHub already treats pull requests as the core code-review object and exposes commits, reviews, files changed and checks in the PR workflow. Issues can be linked to pull requests manually or with closing keywords, and linked issues can close automatically on merge to the default branch.

Relevant current behavior:

- issue ↔ PR linkage is native;
- checks/statuses are native merge inputs;
- GitHub Apps can receive repository webhooks and use installation-scoped API access;
- GitHub App permissions are deny-by-default and should be minimized;
- installation tokens can be repository-limited and expire after one hour;
- webhook payloads can be HMAC-verified using `X-Hub-Signature-256`;
- GitHub does not automatically redeliver failed webhook deliveries, so integrations need recovery/reconciliation rather than assuming perfect webhook delivery.

Product implication: ScopeDelta should consume the smallest useful implementation/check metadata and preserve GitHub as source of truth. It should not clone diffs, comments, source files or repository administration into Layer 4.

Official references:

- https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue
- https://docs.github.com/en/pull-requests/reference/pull-requests
- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps
- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries

### GitLab

GitLab already has deep issue ↔ commit/branch/merge-request crosslinking, merge-request approvals, pipelines, code-quality reports and JUnit test-report display directly in merge requests.

Relevant current behavior:

- issue references in commits/MRs create crosslinks and can close issues automatically;
- merge requests expose reviewers/approvals and can be merge-blocked by failed pipelines;
- JUnit unit-test reports appear directly in merge requests and pipeline detail;
- GitLab therefore provides a richer integrated engineering/QA source surface than ScopeDelta should attempt to reproduce.

Product implication: keep the Layer-4 domain provider-neutral enough for a later GitLab adapter, but **do not include GitLab implementation in the first SC-008 engineering task**. Adding a second provider doubles auth, webhook, reconciliation and test surface before the commercial-delivery evidence model is validated.

Official references:

- https://docs.gitlab.com/user/project/issues/crosslinking_issues/
- https://docs.gitlab.com/user/project/merge_requests/
- https://docs.gitlab.com/user/project/merge_requests/approvals/
- https://docs.gitlab.com/ci/testing/unit_test_reports/

### Jira

Jira already shows branches, commits, pull requests, builds and deployments on work items when the Jira key appears in development artifacts. Jira also exposes development information on boards, releases and a Development page, and can automate workflow transitions from development activity.

Product implication: `work-item key → development artifact → status automation` is table stakes. ScopeDelta should support practical key-based linking, but its differentiated output must be delivery/commercial evidence coverage rather than another generic Development panel.

Official references:

- https://support.atlassian.com/jira-cloud-administration/docs/use-the-github-for-jira-app/
- https://support.atlassian.com/jira-software-cloud/docs/view-development-information-for-an-issue/
- https://support.atlassian.com/jira-software-cloud/docs/enable-code/

### Linear

Linear's GitHub integration links issues to pull requests/commits, automates issue state from development activity, and now supports reviewing GitHub pull requests directly in Linear with diffs, checks, comments and bidirectional review actions.

Product implication: even "review code without leaving the PM tool" is no longer differentiated. ScopeDelta should not spend Layer-4 engineering effort building a diff viewer or code-review inbox.

Linear's normal QA/bug handling remains issue/template-oriented rather than a large first-party test-management system. Form templates can capture structured bug-report information, while dedicated test-management needs are typically handled outside the core issue model.

Official references:

- https://linear.app/docs/github-integration
- https://linear.app/docs/diffs
- https://linear.app/docs/issue-templates

### Test-management conclusion

The market splits into two patterns:

1. engineering providers surface automated test results close to code/merge requests (for example GitLab JUnit reports);
2. organizations that need full manual test-case repositories commonly use dedicated test-management products or Jira Marketplace apps.

Atlassian itself documents a broad Marketplace ecosystem for test-management products such as Xray and others rather than making a comprehensive test-case suite part of Jira's core development panel.

Product implication: ScopeDelta should build the **minimum first-class verification evidence needed to complete the delivery graph**, not a general test-management platform.

## Table stakes vs differentiator

### Table stakes — implement simply

- connect a repository provider;
- link ScopeDelta work to a pull request / commit;
- key-based automatic linking where reliable;
- manual linking/correction;
- show provider artifact state and URL;
- show review/merge/check rollup;
- react to provider webhooks;
- recover from missed/delayed provider events;
- lightweight defect capture;
- lightweight QA verification state.

### Differentiator — invest product effort here

- implementation evidence inherits the work item's commercial provenance context rather than becoming a disconnected PR link;
- coverage gaps are calculated across commercial scope/request → work → implementation → verification → acceptance;
- stale evidence is explicit when work/PR/requirement state changes after verification;
- defects can point back to the requirement/work/implementation evidence they invalidate or challenge;
- release readiness is a factual explanation of missing/failing evidence, not a generic project-health score;
- historical client acceptance remains reconstructable against the delivery/verification context that existed when it occurred.

## Final Layer-4 product model

### 1. GitHub first; provider-neutral core

SC-008 should implement **GitHub only** as the first external engineering provider.

The domain model must avoid GitHub-only concepts where a provider-neutral concept exists, so GitLab can be added later without rewriting the graph. Do not build the GitLab adapter in SC-008 unless implementation discovers a concrete shared boundary where including it is materially cheaper and does not expand review/security scope.

GitHub connection principles:

- use a production-appropriate GitHub App-style installation model selected by engineering;
- least-privilege repository access;
- connect only repositories explicitly granted by the customer/admin;
- read-only provider behavior is sufficient for Layer 4; no requirement to post comments, mutate PRs or write repository content;
- do not ingest/store repository source code, diffs or full CI logs;
- provider credentials/tokens remain server-side and tenant-scoped.

### 2. Implementation evidence

The primary implementation evidence object is the **pull request** because it naturally groups commits, review state, checks and merge outcome.

Minimum provider evidence should support:

- provider/repository identity;
- PR number/provider stable ID;
- provider URL;
- title;
- open/draft/closed/merged state;
- source/head reference and current head SHA where available;
- target/base branch;
- author attribution/reference where useful;
- review/approval summary sufficient for delivery evidence;
- current check/status rollup sufficient to distinguish pending/passing/failing/unknown;
- merge timestamp/merge commit when merged;
- provider update/sync timestamp.

Commits and branches remain supporting references. Do not create a second repository browser.

### 3. Linking rules

Support both:

- **explicit manual linking** between an authorized ScopeDelta work item and provider implementation evidence;
- **practical automatic linking** when a ScopeDelta work-item key appears in a branch name, PR title or another provider field proven reliable by the adapter.

Automatic linking must never cross workspace/project boundaries merely because identifiers look similar. Ambiguous or unauthorized matches remain unlinked and visible for review.

A provider artifact may support more than one work item where the provider/workflow permits it, but the UI should discourage accidental broad links and preserve exact relationships.

### 4. Evidence state vs delivery state

Provider facts do **not** directly rewrite commercial authorization or client acceptance.

Examples:

- a merged PR does not mean the work item is commercially authorized;
- a green check does not mean QA accepted the client requirement;
- a `Done` work item does not fabricate implementation evidence;
- client acceptance does not erase a later defect;
- an open/failing PR can coexist with an already-authorized commercial decision.

Keep these facts separate and derive coverage/readiness from their relationships.

### 5. Lightweight QA verification

Create a lightweight first-class verification concept tied to delivery evidence rather than a standalone test-case repository.

Product semantics should support a verification record with enough information to answer:

- what requirement/work/deliverable was verified;
- against which implementation/delivery version or evidence, where relevant;
- verification method/category;
- result/state;
- who recorded it and when;
- concise evidence/notes/reference;
- whether a linked defect remains unresolved.

Initial verification states should stay small and factual, for example:

- `pending`
- `passed`
- `failed`
- `blocked`

Engineering may choose exact naming/schema consistent with existing domain conventions. Avoid a configurable test-workflow builder.

Verification can be manual QA or can reference provider-produced automated evidence. ScopeDelta should not copy entire JUnit suites or CI logs into its own database in SC-008.

### 6. Defect evidence

Layer 4 needs a first-class way to say that delivered/verified behavior is defective and trace that fact to the affected delivery graph.

A defect must be linkable to relevant:

- project/work item;
- requirement/commercial scope or approved request where applicable;
- implementation evidence;
- verification evidence;
- milestone/deliverable/acceptance history where relevant.

Do not build a separate bug-tracker product. Reuse existing delivery primitives where practical, but preserve defect identity/relationship semantics strongly enough that release readiness and historical reconstruction can distinguish a defect from ordinary planned work.

### 7. Evidence coverage

Add a server-authoritative evidence-coverage projection for material client-delivery work/requirements.

Useful states/gaps include:

- no planned work;
- work has no implementation evidence;
- linked implementation is still open/unmerged;
- provider checks are pending/failing/unknown;
- verification missing/pending/failed/blocked;
- unresolved linked defect;
- delivery acceptance missing where an acceptance target is expected;
- evidence stale because the relevant source/work/implementation changed after verification.

Coverage is advisory/explanatory by default. Do not silently block development or release unless a future explicit project policy requires it.

### 8. Release readiness

Release readiness is a **factual rollup of evidence gaps**, not a magical readiness score.

For a project milestone/deliverable, show a bounded summary such as:

- incomplete client-delivery work;
- missing implementation links;
- open/unmerged implementation;
- failing/pending provider checks;
- missing/failed/blocked verification;
- unresolved defects;
- pending delivery acceptance where applicable.

Every readiness item should drill to its underlying evidence/action.

Do not compute a misleading percentage from task counts.

### 9. Client visibility boundary

Layer-4 engineering/QA detail remains internal by default, consistent with the Layer-3 client-safe projection.

Do not automatically expose:

- repository names/branches/commits/PR titles;
- developer identities;
- CI check names/logs;
- internal QA notes;
- defects not explicitly made client-safe.

SC-008 does not need a broad new client engineering surface. Client acceptance may remain linked internally to the evidence state used by the delivery team without exposing raw engineering metadata.

### 10. Webhook/reconciliation reliability

Provider sync is an external-evidence projection and must tolerate imperfect delivery.

Required behavior:

- verify GitHub webhook signatures according to provider requirements;
- deduplicate/replay-protect provider deliveries using stable provider delivery identity where available;
- tolerate duplicate/out-of-order events;
- provider webhook failure never corrupts authoritative ScopeDelta delivery/commercial state;
- provide bounded reconciliation/resync from provider API so webhook loss/outage is recoverable;
- a disconnected repository preserves historical evidence as a provider snapshot/reference while stopping future sync;
- show stale/unknown provider state rather than inventing success during outages.

### 11. Security/privacy

- repository connection is workspace/project authorized;
- provider installation/repository identity is tenant-scoped;
- cross-tenant/project provider IDs are negative-tested;
- credentials/private keys/tokens never reach client bundles or ordinary logs;
- no repository source-code mirror in Layer 4;
- no full CI log/artifact mirror in Layer 4;
- provider webhook payload logging is minimized and must not become a backdoor code/content log;
- external client users do not gain repository/QA access from project participation alone.

## Runtime and economics conclusion

Layer 4 is a mixed local/external layer.

### Local/LAN core

These remain fully server-authoritative ScopeDelta behavior and work without a Git provider:

- defect relationships;
- manual QA verification/evidence;
- evidence coverage projections over locally available data;
- release-readiness rollups over locally available data;
- historical linkage to commercial/client acceptance records.

### External/provider behavior

GitHub integration inherently depends on GitHub for live provider metadata. Self-host ScopeDelta does **not** need ScopeDelta Cloud to use it: a customer can configure the required GitHub App/provider credentials on its own deployment.

GitLab remains a later Hybrid/optional-external adapter because it may be GitLab.com or customer self-managed GitLab.

### Cost drivers

Expected managed-cloud cost is low relative to AI/document processing if ScopeDelta stores only normalized provider metadata:

- webhook/event ingestion;
- periodic reconciliation jobs;
- provider API rate usage;
- small relational metadata/history.

Do not mirror source repositories, diffs, CI logs or large test artifacts in SC-008. No new paid external service is required from ScopeDelta beyond the customer's chosen Git provider.

## Recommended SC-008 implementation boundary

One coherent SC-008 engineering issue/primary PR unless Codex identifies a concrete split reason under the execution-speed policy.

Required outcome:

1. connect one GitHub repository safely;
2. link ScopeDelta work to PR implementation evidence manually and by reliable work-key convention;
3. keep PR/review/check state synchronized/reconcilable;
4. record lightweight QA verification and defects against delivery evidence;
5. project actionable evidence gaps;
6. show factual milestone/project release readiness;
7. preserve the commercial → work → implementation → verification → acceptance chain end to end.

## Explicit out of scope for SC-008

- GitLab adapter implementation;
- source-code hosting;
- CI/CD runner/orchestration;
- code diff viewer or PR review UI;
- source-code indexing/search;
- coding agent;
- storing complete CI logs/artifacts;
- full manual test-case repository/test-plan/test-lab product;
- configurable QA workflow engine;
- deployment infrastructure control;
- automatic client exposure of engineering/QA detail;
- AI-generated QA/tests/risk analysis (SC-009).

## Research conclusion

SC-008 should make the Commercial Delivery Graph continue through engineering and QA without competing with GitHub/GitLab on their strongest surfaces.

The differentiated Layer-4 invariant is:

> **A material client-delivery outcome should be explainable from commercial authorization through planned work, implementation/review/check evidence, QA verification/defects and client acceptance, while missing or stale evidence is surfaced before the team claims delivery readiness.**
