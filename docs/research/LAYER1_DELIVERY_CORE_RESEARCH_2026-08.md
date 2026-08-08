# Layer 1 Delivery Core Research — 2026-08

## Status

Research checkpoint completed 2026-08-08 for SC-005.

Decision: **do not implement the existing SC-005 as one large issue.** Split Layer 1 into three sequential, production-usable slices. The first slice may become `READY FOR CODEX` only after this research, the parent issue, the runtime matrix, and the roadmap all point to the same product model.

## Research question

What is the minimum daily software-delivery core ScopeDelta must provide so a 50–500-person software service organization can use it as its primary delivery workspace, without spending a layer rebuilding Jira, Linear, or Plane breadth before the Commercial Delivery Graph exists?

## Research method and limits

Reviewed current product documentation and 2026 product updates for Jira Cloud, Linear, and Plane, plus practitioner discussions from software agencies/project managers about multi-client delivery, cross-project work visibility, client access, and scope-change handling.

Practitioner posts are directional qualitative evidence, not a statistically representative customer study. They are useful for identifying recurring workflow friction and must be supplemented by later customer evidence.

## Competitive audit

### Jira — power and configurability are table stakes, not our model

Current Jira provides mature backlogs, boards, releases/versions, work types, workflows, workflow rules, search/querying, and deep administrative configuration.

Relevant observations:

- Jira explicitly separates simpler **team-managed** spaces from **company-managed** spaces. Company-managed spaces use administrator-controlled screens/schemes and support greater cross-space standardization, but with greater configuration complexity.
- Jira's own guidance starts new teams with a simple `To do → In progress → Done` workflow and adds granularity as processes mature.
- Team-managed Jira can still grow into multiple workflows and transition rules.
- Jira releases/versions can group work and its release hub can later combine issue state with development/build readiness.

Product implication for ScopeDelta:

- We need durable statuses, backlog/list behavior, milestones/releases, filtering, permissions, and auditable transitions.
- We should **not** reproduce Jira's scheme/screen/work-type/workflow administration model in Layer 1.
- A team must be productive immediately after creating a project. Configuration is a later capability only when evidence shows a real workflow cannot fit the default.

### Linear — speed/opinion is the interaction benchmark, but its core is team-centric

Current Linear is a strong benchmark for fast daily engineering work:

- Every issue is linked to exactly one team and inherits a team issue identifier.
- Projects can span teams, have members, dates and milestones.
- Project milestones divide work into stages inside a project.
- Cycles are optional team timeboxes, repeat on a cadence, and are explicitly separate from releases.
- Documents can be attached to projects and other work objects.
- Linear now includes Customer Requests that link customer feedback to issues/projects and can store customer attributes.

Product implication for ScopeDelta:

- Match the low-friction issue editing, keyboard-friendly navigation, clean list/board behavior, and optional planning constructs.
- Do **not** copy the assumption that the team is the primary identity/container for delivery work. For an agency/consultancy, the durable boundary is the **client project**; teams and people frequently span several client projects.
- Treat cycles as an optional planning overlay, not as the project hierarchy or release model.
- Linear Customer Requests reduce the novelty of merely linking a customer/request to an issue. ScopeDelta's differentiation must be the stronger chain from client engagement and commercial authorization through delivery, QA, and acceptance—not a generic feedback/customer field.

### Plane — breadth + self-hosting are already competitive

Plane currently provides a broad project-management surface including projects, work items, states, work-item types, custom properties, cycles, modules, epics/hierarchies, dependencies, initiatives, milestones, releases, multiple layouts, filtering/PQL, pages/wiki, dashboards, workflows/approvals, integrations, AI, and self-hosting.

2026 Plane updates expanded this further with workspace work-item types/hierarchy, releases, advanced custom properties, PQL, richer work-item detail/history, and custom workflows/approval flows.

Product implication for ScopeDelta:

- **Self-hosting is a distribution/architecture advantage, not a sufficient USP.** Plane already demonstrates a capable self-hosted PM product.
- Matching Plane feature breadth would consume the engineering budget before ScopeDelta reaches its differentiated Commercial Delivery Graph.
- Layer 1 should use progressive complexity: only enable concepts that solve daily client software delivery.

## Real software-delivery workflow evidence

Recurring themes in practitioner discussions:

1. **Client-project boundaries matter.** Agencies commonly want a board/project per client engagement while employees work across multiple client projects.
2. **Cross-project personal visibility matters.** A developer/designer may be assigned across several projects, making a single `My work` aggregation important.
3. **Clients should not receive the raw internal workspace by default.** Agencies worry about permission/security boundaries and often translate internal status into client-safe updates. The dedicated client projection remains Layer 3.
4. **Scope drift is incremental.** Contracts/SOWs and Jira/Notion/Slack can all exist while many small revisions, fixes, meetings, Slack requests, and deadline changes still accumulate into unbilled work.
5. **Change handling is a decision workflow, not just an issue field.** Practitioners describe making tradeoffs explicit: time, cost, scope, resources, swapping existing commitments, or charging for additional work.

These findings reinforce the existing layered strategy: Layer 1 must become the daily execution system, but the revenue wedge remains Layer 2's Commercial Delivery Graph.

## USP decision

### Company/product USP

Keep the accepted ScopeDelta USP:

> ScopeDelta connects client intent, commercial authorization, delivery work, engineering/QA evidence, and client acceptance so unapproved or misunderstood scope does not silently become consumed delivery capacity.

This remains materially different from “AI project management”, “self-hosted Jira”, “customer requests”, or “a nicer Kanban board”.

### Layer 1-specific product wedge

Layer 1 is deliberately **not** the final USP. Its job is adoption and structural preparation.

Its opinionated model is:

> **Client-project-first software delivery.** Work is organized around the engagement the agency is accountable for, while people can execute across many client projects without recreating the client/project hierarchy as teams, labels, or permission schemes.

Canonical Layer 1 spine:

`Workspace → Client → Project → Milestone → Work item`

Optional timebox overlay:

`Project → Cycle → Work item`

A work item belongs to exactly one project. It may belong to zero or one milestone and zero or one cycle. Cycles never replace the project or milestone hierarchy.

This model gives Layer 2 an unambiguous project/client boundary for commercial traceability later.

## Layer 1 product decisions

### 1. Client project is the primary delivery container

- Every Layer 1 delivery project belongs to one client.
- A client can have multiple concurrent/historical projects.
- Project membership narrows access inside the workspace; it never widens workspace authority.
- Team/org structure is not duplicated as a mandatory project hierarchy.

### 2. Use one accountable assignee

A work item has zero or one primary assignee in Layer 1. Collaboration does not require multi-assignee ownership. This keeps accountability and personal work views deterministic; comments/subscribers/mentions can represent collaborators.

### 3. Ship one excellent default workflow before a workflow builder

Initial software-delivery workflow:

`Backlog → Ready → In Progress → In Review → Done`

`Canceled` is a terminal non-completed outcome.

The underlying model must preserve stable state categories for future automation/reporting, but Layer 1 does not need a general workflow editor, transition-rule engine, or per-work-type workflows.

### 4. Separate milestone from cycle

- **Milestone** = client/project delivery checkpoint or outcome stage; first-class even for non-Scrum teams.
- **Cycle** = optional internal timebox for teams that plan iteratively.
- A project without cycles is fully supported.
- A project without milestones is technically valid, although the default setup should encourage a first delivery milestone where appropriate.

### 5. Keep work relationships small and useful

Layer 1 relationship primitives:

- parent/subtask;
- blocks / blocked-by.

Do not build arbitrary custom relation types, deep configurable hierarchy, initiatives, modules, goals, or cross-workspace hierarchy in Layer 1.

### 6. Make acceptance criteria first-class

Acceptance criteria remain an explicit work-item field rather than being buried only in description text. Layer 4 can later connect this to QA evidence without migrating the basic intent model.

### 7. Avoid a generic wiki in Layer 1

Provide lightweight project context/spec notes late in the layer, but do not build a Notion/Confluence replacement. Project brief/context and small project-scoped notes are sufficient until customer evidence requires richer knowledge management.

### 8. In-app action state before notification infrastructure breadth

The daily product needs actionable `My work` and in-app collaboration. External delivery channels are secondary. Existing SMTP can support optional email notification later, but Layer 1 should not block on Slack/Teams/push notification integrations.

## Table stakes to build in Layer 1

- clients and client projects;
- project members and lifecycle;
- project key + stable human-readable work-item identifiers;
- milestones;
- work items with description, status, priority, primary assignee, estimate, target date, acceptance criteria, labels, timestamps;
- subtasks and blocking dependencies;
- list/backlog;
- board;
- optional cycles;
- `My work` across projects;
- practical filters and search;
- comments/activity;
- lightweight project brief/notes;
- in-app notifications/mentions sufficient for collaboration;
- strict tenant/project authorization and auditable domain events.

## Explicit complexity to avoid

Do not build in SC-005:

- Jira-style schemes/screens/custom field administration;
- unrestricted workflow builder, transition scripting, or approval engine;
- multiple configurable work-item types/hierarchies;
- initiatives/goals/modules/portfolio hierarchy;
- Gantt, calendar, spreadsheet, dashboard/report-builder, or many interchangeable layouts;
- time tracking, timesheets, billing, margin/resource planning;
- generic intake/form system;
- client portal/client seats;
- generic customer-feedback CRM;
- real-time chat;
- full wiki/knowledge-base hierarchy;
- release readiness based on Git/CI state;
- Git hosting/CI/CD;
- AI/agents;
- automations/rules marketplace;
- external notification/integration matrix.

## SC-005 split decision

The previous issue is too large for one engineering handoff. Split it into three sequential slices.

### SC-005A — Client-project backlog foundation

First useful vertical slice:

- client records;
- client projects + project membership/lifecycle;
- milestones;
- default workflow;
- work items with core fields and stable project keys;
- subtasks + blocking dependencies;
- list/backlog + project overview;
- tenant/project authorization, audit events, API/domain consistency.

A PM can create a real client project and manage a useful backlog without configuring the system first.

### SC-005B — Planning and daily execution

Build on the same domain:

- board;
- optional cycles;
- milestone/cycle planning and movement;
- cross-project `My work`;
- filters/search/shareable view state;
- efficient bulk/quick interactions where justified;
- realistic seeded performance/accessibility review.

A delivery team can use ScopeDelta for normal daily planning/execution across multiple client projects.

### SC-005C — Collaboration and project context

Complete the internal Layer 1 loop:

- comments;
- mentions/subscription behavior;
- activity/history presentation;
- lightweight project brief/spec notes;
- in-app notification/inbox behavior, with optional SMTP email only where it adds clear value;
- final Layer 1 usability/reliability hardening.

After SC-005C, Layer 1 is complete and SC-006 may enter its research/engineering gate.

## Measurable Layer 1 outcomes

Product success targets to validate with real usage/analytics later:

1. A prepared project manager can create a client, project, first milestone, and first assigned work item in one onboarding session without administrator configuration.
2. A team member working across multiple client projects can identify current assigned work from one personal view.
3. A PM can plan and operate a project without enabling cycles.
4. A Scrum-style team can enable cycles without changing the client-project/milestone model.
5. No user needs to understand workflow schemes, screen schemes, custom-field administration, or work-item hierarchy configuration to start delivery.
6. The resulting records provide stable project/work identifiers and domain events that Layer 2 can connect to commercial baseline/request/decision records without redesigning the Layer 1 ownership boundary.

## Runtime / cost conclusion

Layer 1 remains overwhelmingly Local/LAN and should work on the same customer-controlled server used by SC-004.

- clients/projects/work/milestones/cycles/views/search/comments/project notes/in-app inbox: Local/LAN;
- optional outbound email notification: Hybrid/optional external because it can use customer SMTP or managed email in ScopeDelta Cloud;
- no mandatory new external API or paid cloud service is required for Layer 1.

## Sources reviewed

### Jira / Atlassian

- Team-managed vs company-managed spaces: https://support.atlassian.com/jira-software-cloud/docs/what-are-team-managed-and-company-managed-projects/
- Team-managed workflow setup: https://support.atlassian.com/jira-software-cloud/docs/set-up-a-workflow-in-a-team-managed-software-project/
- Jira workflows: https://support.atlassian.com/jira-software-cloud/docs/what-are-jira-workflows/
- Releases/versions: https://support.atlassian.com/jira-software-cloud/docs/enable-releases-and-versions/
- Release status hub: https://support.atlassian.com/jira-software-cloud/docs/check-the-release-status-of-a-version/

### Linear

- Create issues: https://linear.app/docs/creating-issues
- Teams: https://linear.app/docs/teams
- Project overview: https://linear.app/docs/project-overview
- Project milestones: https://linear.app/docs/project-milestones
- Cycles: https://linear.app/docs/use-cycles
- Documents: https://linear.app/docs/documents
- Customer Requests: https://linear.app/docs/customer-requests
- Members/roles: https://linear.app/docs/members-roles

### Plane

- Current docs/capability index: https://docs.plane.so/
- Work items: https://plane.so/work-items
- Project management: https://plane.so/project-management
- Cycles: https://plane.so/cycles
- Plane v2.6.0: https://plane.so/changelog/release-v2-6-0-pql-releases-wiki-collections-and-more
- Workspace work-item types/hierarchy: https://plane.so/blog/introducing-workspace-work-item-types-hierarchy
- Custom workflows/approval flows: https://plane.so/blog/introducing-custom-workflows-and-approval-flows
- Releases: https://plane.so/blog/introducing-releases

### Practitioner / agency discussions

- Multi-client agency PM needs and cross-project personal visibility: https://www.reddit.com/r/agency/comments/1fuecyg/looking_for_best_task_project_management_tool_any/
- Linear structure for a web agency: https://www.reddit.com/r/Linear/comments/1k97kyz/
- Agency considering Linear for many client projects: https://www.reddit.com/r/Linear/comments/1hmkhfn/anyone_using_linear_for_a_development_agency/
- Client access/security concerns in Jira: https://www.reddit.com/r/agency/comments/1h5mjbs
- Incremental scope creep despite contracts/SOW/Jira/Notion/Slack: https://www.reddit.com/r/freelancing/comments/1tl3m5o/do_contracts_actually_stop_scope_creep_in_dev/
- Small unbilled client changes near delivery: https://www.reddit.com/r/webdevelopment/comments/1rvuy1m/genuinely_dont_know_how_much_revenue_i_loose_to/

## References

- SC-005 / issue #9
- `docs/PRODUCT.md`
- `docs/ROADMAP.md`
- `docs/FEATURE_RUNTIME_MATRIX.md`
- `docs/research/MARKET_PROBLEM_THESIS_2026-08.md`
- `docs/decisions/ADR-005-ai-native-client-delivery-os.md`
- RS-002 / issue #21
