import { z } from "zod";
import * as platform from "@/lib/platform-validation";
import * as delivery from "@/lib/delivery-validation";
import * as collaboration from "@/lib/collaboration-validation";
import * as commercial from "@/lib/commercial-validation";
import * as client from "@/lib/client-collaboration-validation";
import * as engineering from "@/lib/engineering-validation";
import * as operations from "@/lib/operations-validation";
import * as adoption from "@/lib/adoption-validation";
import * as billing from "@/lib/billing-validation";
import * as ai from "@/lib/ai/contracts";
import type { WorkflowDefinition } from "./workflow-types";

/** Reviewed routes only. Never accept an agent-supplied URL or HTTP method. */
export const WORKFLOW_CATALOG: WorkflowDefinition[] = [
  {
    name: "workspace_setup",
    title: "Set up a workspace",
    category: "Getting started",
    description:
      "List your workspaces or create one. After creating, open its returned workspace URL before using workspace tools.",
    surfaces: ["setup", "workspace"],
    operations: [
      { action: "list", method: "GET", path: "/api/v1/workspaces" },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces",
        body: platform.createWorkspaceSchema,
      },
    ],
  },
  {
    name: "workspace_settings",
    title: "Workspace settings",
    category: "Administration",
    description: "Update the workspace name and IANA time zone as its owner.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]",
        body: platform.updateWorkspaceSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "workspace_onboarding",
    title: "Getting started",
    category: "Getting started",
    description:
      "Read authoritative activation progress and dismiss or restore the setup guide.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/onboarding",
      },
      {
        action: "set_dismissed",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/onboarding",
        body: platform.onboardingPreferenceSchema,
      },
    ],
  },
  {
    name: "workspace_members",
    title: "Manage workspace members",
    category: "Administration",
    description:
      "Find people and their user/membership IDs; change role, suspend, reactivate, or remove access under existing owner/admin rules.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "update_access",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/members/[membershipId]",
        body: platform.updateMemberAccessSchema,
        confirmation: true,
      },
      {
        action: "remove",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/members/[membershipId]",
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/members",
        query: platform.workspaceDirectoryFiltersSchema,
      },
    ],
  },
  {
    name: "workspace_invitations",
    title: "Invite workspace members",
    category: "Administration",
    description:
      "List, send, revoke or reissue invitations. Invitation secrets stay in the ordinary Members UI.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "reissue",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/invitations/[invitationId]/reissue",
        confirmation: true,
      },
      {
        action: "revoke",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/invitations/[invitationId]",
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/invitations",
        query: platform.workspaceDirectoryFiltersSchema,
      },
      {
        action: "invite",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/invitations",
        body: platform.inviteMemberSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "client_accounts",
    title: "Manage client accounts",
    category: "Delivery",
    description:
      "List, create, read, edit, archive or restore internal client accounts. Create an active client before creating a project.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/clients/[clientId]",
      },
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/clients/[clientId]",
        body: delivery.updateClientSchema,
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/clients",
        query: delivery.paginationSchema,
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/clients",
        body: delivery.createClientSchema,
      },
    ],
  },
  {
    name: "project_lifecycle",
    title: "Start and manage projects",
    category: "Delivery",
    description:
      "List all lifecycle states, create a project for an active client, read its context, update details, or set lifecycle to completed, archived or active. Omitted leadUserId defaults to you.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]",
      },
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]",
        body: delivery.updateProjectSchema,
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects",
        query: delivery.projectListFilterSchema,
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects",
        body: delivery.createProjectSchema,
        defaultLead: true,
      },
    ],
  },
  {
    name: "project_members",
    title: "Manage the project team",
    category: "Delivery",
    description:
      "List, add or remove existing workspace members from the project; find mentionable people. Access changes require confirmation.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "remove",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/members/[userId]",
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/members",
      },
      {
        action: "add",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/members",
        body: delivery.projectMemberSchema,
        confirmation: true,
      },
      {
        action: "mentionable",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/mentionable-members",
        query: collaboration.mentionableMemberFilterSchema,
      },
    ],
  },
  {
    name: "project_milestones",
    title: "Plan project milestones",
    category: "Delivery",
    description:
      "List, create or update milestones, dates and planned/in_progress/completed/archived status.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/milestones/[milestoneId]",
        body: delivery.updateMilestoneSchema,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/milestones",
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/milestones",
        body: delivery.createMilestoneSchema,
      },
    ],
  },
  {
    name: "delivery_cycles",
    title: "Plan delivery cycles",
    category: "Delivery",
    description:
      "List, create and update delivery cycles, date ranges, goals and lifecycle.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/cycles/[cycleId]",
        body: delivery.updateCycleSchema,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/cycles",
        query: delivery.cycleFilterSchema,
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/cycles",
        body: delivery.createCycleSchema,
      },
    ],
  },
  {
    name: "delivery_work",
    title: "Manage delivery work",
    category: "Delivery",
    description:
      "List or read work; create and update title, status, priority, assignee, estimate, dates, cycle, milestone and labels; reorder the board or archive an item. IDs come from list/read actions.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "reorder",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/reorder",
        body: delivery.reorderWorkItemSchema,
      },
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]",
      },
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]",
        body: delivery.updateWorkItemSchema,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items",
        query: delivery.workItemFilterSchema,
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items",
        body: delivery.createWorkItemSchema,
      },
    ],
  },
  {
    name: "work_dependencies",
    title: "Manage work dependencies",
    category: "Delivery",
    description:
      "Read project/work-item dependencies, add a blocker, or remove a dependency. The server prevents invalid/cyclic relationships.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "remove",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/dependencies/[dependencyId]",
        confirmation: true,
      },
      {
        action: "list_project",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/dependencies",
      },
      {
        action: "add",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/dependencies",
        body: delivery.createDependencySchema,
      },
    ],
  },
  {
    name: "project_labels",
    title: "Organize work with labels",
    category: "Delivery",
    description: "List or create labels used by delivery work.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/labels",
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/labels",
        body: delivery.createLabelSchema,
      },
    ],
  },
  {
    name: "assigned_work",
    title: "Filter assigned work",
    category: "Delivery",
    description:
      "Read your assigned work with pagination and the full ordinary My Work filters. Use list_my_work for a compact attention summary.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/my-work",
        query: delivery.myWorkFilterSchema,
      },
    ],
  },
  {
    name: "work_discussion",
    title: "Discuss delivery work",
    category: "Collaboration",
    description:
      "List, read, post, edit or delete internal work comments and inspect edit history. Mentions and subscriptions use the existing collaboration service.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "history",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/comments/[commentId]/history",
      },
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/comments/[commentId]",
      },
      {
        action: "edit",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/comments/[commentId]",
        body: collaboration.updateCommentSchema,
      },
      {
        action: "delete",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/comments/[commentId]",
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/comments",
        query: delivery.paginationSchema,
      },
      {
        action: "post",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/comments",
        body: collaboration.createCommentSchema,
        automaticKeys: ["requestId"],
      },
    ],
  },
  {
    name: "work_subscription",
    title: "Watch delivery work",
    category: "Collaboration",
    description: "Read or change your subscription to a work item.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/subscription",
      },
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/subscription",
        body: collaboration.updateSubscriptionSchema,
      },
    ],
  },
  {
    name: "project_notes",
    title: "Maintain project briefs and notes",
    category: "Collaboration",
    description: "List, create, read, edit or archive internal project notes.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/notes/[noteId]",
      },
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/notes/[noteId]",
        body: collaboration.updateProjectNoteSchema,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/notes",
        query: collaboration.projectNoteFilterSchema,
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/notes",
        body: collaboration.createProjectNoteSchema,
        automaticKeys: ["requestId"],
      },
    ],
  },
  {
    name: "project_activity",
    title: "Review project activity",
    category: "Collaboration",
    description: "Read paginated authoritative project or work-item activity.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "project",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/activity",
        query: collaboration.activityFilterSchema,
      },
      {
        action: "work_item",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/activity",
        query: collaboration.activityFilterSchema,
      },
    ],
  },
  {
    name: "workspace_inbox",
    title: "Manage the workspace inbox",
    category: "Collaboration",
    description:
      "Read internal notifications, mark selected notifications read/unread, or mark a client-collaboration notification read.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "mark_client_read",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/client-notifications/[notificationId]",
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/notifications",
        query: collaboration.notificationFilterSchema,
      },
      {
        action: "mark_read",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/notifications",
        body: collaboration.updateNotificationBatchSchema,
      },
    ],
  },
  {
    name: "commercial_evidence",
    title: "Manage commercial source evidence",
    category: "Commercial",
    description:
      "Read commercial context and source text, add a pasted-text/PDF/DOCX source, retry extraction, or download its original. Sources do not themselves establish an effective agreement.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "overview",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial",
      },
      {
        action: "download_source",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/sources/[sourceId]/download",
        download: true,
      },
      {
        action: "retry_extraction",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/sources/[sourceId]/retry",
      },
      {
        action: "read_source",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/sources/[sourceId]",
        textExcerpt: true,
      },
      {
        action: "add_text",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/sources",
        body: z
          .object({
            idempotencyKey: z.string().uuid(),
            name: z.string().trim().min(1).max(160),
            text: z.string().min(1).max(500_000),
          })
          .transform(({ text, ...data }) => ({
            ...data,
            kind: "pasted_text",
            mediaType: "text/plain",
            contentBase64: btoa(
              Array.from(new TextEncoder().encode(text), (byte) =>
                String.fromCharCode(byte),
              ).join(""),
            ),
          }))
          .pipe(commercial.createCommercialSourceSchema),
      },
      {
        action: "add_source",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/sources",
        body: commercial.createCommercialSourceSchema,
      },
    ],
  },
  {
    name: "commercial_scope",
    title: "Define commercial scope",
    category: "Commercial",
    description:
      "Create or revise a scope item using exact source evidence offsets; archive or restore draft scope items. Read commercial_evidence.overview to discover versions and items.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "set_archived",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/scope-items/[scopeItemId]/archive",
        body: commercial.setCommercialScopeItemArchiveSchema,
      },
      {
        action: "revise",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/scope-items/[scopeItemId]",
        body: commercial.updateCommercialScopeItemSchema,
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/scope-items",
        body: commercial.createCommercialScopeItemSchema,
      },
    ],
  },
  {
    name: "commercial_agreement",
    title: "Establish and amend the agreement",
    category: "Commercial",
    description:
      "Create an initial baseline or draft amendment from source evidence, then activate an exact version with human confirmation. Use commercial_evidence.overview to read the existing baseline.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "create_baseline",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/baseline",
        body: commercial.createCommercialBaselineSchema,
        confirmation: true,
      },
      {
        action: "activate_version",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/baseline/versions/[versionId]/activate",
        body: commercial.activateCommercialBaselineVersionSchema,
        confirmation: true,
      },
      {
        action: "create_amendment",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/baseline/versions",
        body: commercial.createCommercialAmendmentSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "commercial_requests",
    title: "Review commercial change requests",
    category: "Commercial",
    description:
      "List, record, inspect or change the open/needs_clarification/withdrawn state of commercial requests. Decisions use commercial_decisions.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/requests/[requestId]",
      },
      {
        action: "update_state",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/requests/[requestId]",
        body: commercial.updateCommercialRequestStateSchema,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/requests",
        query: commercial.commercialRequestFiltersSchema,
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/requests",
        body: commercial.createCommercialRequestSchema,
      },
    ],
  },
  {
    name: "commercial_clarifications",
    title: "Resolve internal clarification drafts",
    category: "Commercial",
    description:
      "Read AI-produced internal clarification drafts and mark a draft resolved or dismissed. This does not publish to a client.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/requests/[requestId]/clarifications/[clarificationId]",
        body: ai.updateClarificationSchema,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/requests/[requestId]/clarifications",
      },
    ],
  },
  {
    name: "commercial_decisions",
    title: "Record commercial treatment",
    category: "Commercial",
    description:
      "Record a covered, absorbed, swap, paid_change, deferred or rejected decision with evidence and human confirmation; supersede existing decisions explicitly.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "record",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/requests/[requestId]/decisions",
        body: commercial.createCommercialDecisionSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "commercial_impact",
    title: "Assess change impact",
    category: "Commercial",
    description:
      "Record or supersede effort, schedule and monetary impact estimates/confirmed values with evidence. This is not billing or payment execution.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "record",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/requests/[requestId]/impacts",
        body: commercial.createCommercialImpactAssessmentSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "work_commercial_basis",
    title: "Connect delivery to its commercial basis",
    category: "Commercial",
    description:
      "Read work purpose and basis links, classify work, link a scope revision or decision, or remove a basis link. The server computes drift.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "unlink",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/commercial/links/[linkId]",
        confirmation: true,
      },
      {
        action: "link",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/commercial/links",
        body: commercial.createCommercialBasisLinkSchema,
      },
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/commercial",
      },
      {
        action: "classify",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/work-items/[workItemId]/commercial",
        body: commercial.updateWorkPurposeSchema,
      },
    ],
  },
  {
    name: "commercial_drift_ledger",
    title: "Inspect commercial drift and history",
    category: "Commercial",
    description:
      "Read paginated drift categories, the combined summary or immutable commercial history. Advisory facts never imply a legal or commercial verdict.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "ledger",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/drift",
        query: commercial.commercialDriftFiltersSchema,
      },
      {
        action: "summary",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/drift-summary",
        query: commercial.commercialDriftSummaryFiltersSchema,
      },
      {
        action: "history",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial/history",
        query: commercial.commercialHistoryFiltersSchema,
      },
    ],
  },
  {
    name: "client_publication",
    title: "Publish client-safe project context",
    category: "Client collaboration",
    description:
      "Read the client collaboration overview, update its public summary, publish milestone/deliverable items or withdraw an item. Publication requires human review.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "withdraw_item",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/items/[itemId]",
        confirmation: true,
      },
      {
        action: "publish_item",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/items",
        body: client.createClientProjectItemSchema,
        confirmation: true,
      },
      {
        action: "overview",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client",
      },
      {
        action: "update_summary",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client",
        body: client.updateClientProjectProfileSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "client_participants",
    title: "Manage external client access",
    category: "Client collaboration",
    description:
      "List, invite, change collaborator/approver role, revoke participation or manage invitations. Invitation URLs stay in the application UI.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "reissue_invitation",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/invitations/[invitationId]/reissue",
        body: client.reissueClientInvitationSchema,
        privateInvitation: true,
        confirmation: true,
      },
      {
        action: "revoke_invitation",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/invitations/[invitationId]",
        confirmation: true,
      },
      {
        action: "update_role",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/participants/[participantId]",
        body: client.updateClientParticipantSchema,
        confirmation: true,
      },
      {
        action: "revoke",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/participants/[participantId]",
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/participants",
      },
      {
        action: "invite",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/participants",
        body: client.createClientInvitationSchema,
        privateInvitation: true,
        confirmation: true,
      },
    ],
  },
  {
    name: "client_request_review",
    title: "Review and publish client requests",
    category: "Client collaboration",
    description:
      "Request clarification or update request state; publish an exact commercial decision packet for client review. Read client_publication.overview first.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "publish_packet",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/requests/[requestId]/packets",
        body: client.publishClientPacketSchema,
        confirmation: true,
      },
      {
        action: "update_state",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/requests/[requestId]",
        body: client.updateClientRequestStateSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "client_acceptance_publication",
    title: "Request client delivery acceptance",
    category: "Client collaboration",
    description:
      "Publish an immutable acceptance target for an existing client-visible project item and linked packets.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "publish",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/acceptance-targets",
        body: client.publishClientAcceptanceSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "client_team_discussion",
    title: "Discuss with the client",
    category: "Client collaboration",
    description:
      "Post a client-visible message on an exact request, packet or acceptance target after reviewing its audience.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "post",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/client/discussion",
        body: client.createClientDiscussionSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "client_project_access",
    title: "Review your client projects",
    category: "External client",
    description:
      "List your authorized client projects or read a project projection, requests, packets, discussion and acceptance targets. No internal workspace data is exposed.",
    surfaces: ["client"],
    operations: [
      {
        action: "read",
        method: "GET",
        path: "/api/v1/client/projects/[projectId]",
        query: client.clientPageSchema,
      },
      { action: "list", method: "GET", path: "/api/v1/client/projects" },
    ],
  },
  {
    name: "client_requests",
    title: "Submit a client request",
    category: "External client",
    description:
      "Record a new request in an authorized client project. Read client_project_access for current state.",
    surfaces: ["client"],
    operations: [
      {
        action: "create",
        method: "POST",
        path: "/api/v1/client/projects/[projectId]/requests",
        body: client.createClientRequestSchema,
      },
    ],
  },
  {
    name: "client_discussion",
    title: "Respond in a client discussion",
    category: "External client",
    description:
      "Post a message on a published request, packet or acceptance target you may access.",
    surfaces: ["client"],
    operations: [
      {
        action: "post",
        method: "POST",
        path: "/api/v1/client/projects/[projectId]/discussion",
        body: client.createClientDiscussionSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "client_packet_response",
    title: "Respond to a commercial packet",
    category: "External client",
    description:
      "An authorized client approver can approve, reject or request clarification on an exact published packet, only after human confirmation.",
    surfaces: ["client"],
    operations: [
      {
        action: "respond",
        method: "POST",
        path: "/api/v1/client/projects/[projectId]/packets/[packetId]/actions",
        body: client.actOnClientPacketSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "client_delivery_acceptance",
    title: "Accept delivery or request changes",
    category: "External client",
    description:
      "An authorized client approver can accept an exact published delivery target or request changes, after human confirmation.",
    surfaces: ["client"],
    operations: [
      {
        action: "respond",
        method: "POST",
        path: "/api/v1/client/projects/[projectId]/acceptance-targets/[targetId]/actions",
        body: client.actOnClientAcceptanceSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "client_inbox",
    title: "Manage client notifications",
    category: "External client",
    description:
      "List client notifications, mark one read, or explicitly retry a failed email delivery.",
    surfaces: ["client"],
    operations: [
      {
        action: "mark_read",
        method: "PATCH",
        path: "/api/v1/client/notifications/[notificationId]",
      },
      {
        action: "retry_email",
        method: "POST",
        path: "/api/v1/client/notifications/[notificationId]",
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/client/notifications",
        query: client.clientPageSchema,
      },
    ],
  },
  {
    name: "engineering_evidence",
    title: "Trace engineering implementation",
    category: "Engineering & QA",
    description:
      "Read engineering context and work-item traces; link or unlink implementation evidence. Provider consent is completed in the ordinary Engineering UI.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "unlink",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/engineering/links/[linkId]",
        confirmation: true,
      },
      {
        action: "link",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/engineering/links",
        body: engineering.manualImplementationLinkSchema,
      },
      {
        action: "overview",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/engineering",
      },
      {
        action: "trace",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/engineering/trace/[workItemId]",
      },
    ],
  },
  {
    name: "engineering_repositories",
    title: "Manage engineering repositories",
    category: "Engineering & QA",
    description:
      "Start the GitHub connection in the existing consent UI, reconcile a connected repository, or disconnect it. Provider secrets are never tool input/output.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "connect",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/engineering/github/install",
        query: engineering.githubRepositoryInstallSchema,
        handoff: "engineering",
      },
      {
        action: "reconcile",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/engineering/repositories/[repositoryId]/reconcile",
        confirmation: true,
      },
      {
        action: "disconnect",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/engineering/repositories/[repositoryId]",
        confirmation: true,
      },
    ],
  },
  {
    name: "qa_verification",
    title: "Verify delivery readiness",
    category: "Engineering & QA",
    description:
      "Read readiness coverage and record explicit QA verification evidence. A work status change alone is not QA evidence.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "readiness",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/engineering/readiness",
        query: engineering.engineeringCoverageFiltersSchema,
      },
      {
        action: "record",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/engineering/verifications",
        body: engineering.createVerificationSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "delivery_defects",
    title: "Track delivery defects",
    category: "Engineering & QA",
    description:
      "Create defects with reproduction context and resolve/reopen them under existing QA rules. Read engineering_evidence.overview for defects.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "update_status",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/engineering/defects/[defectId]",
        body: engineering.resolveDefectSchema,
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/engineering/defects",
        body: engineering.createDefectSchema,
      },
    ],
  },
  {
    name: "ai_analysis",
    title: "Run grounded AI analysis",
    category: "AI assistance",
    description:
      "List/read jobs, start scope-change analysis, a delivery risk brief or work context/QA pack, cancel or explicitly retry. Requires configured AI; start/retry may send authorized context to the configured provider and incur usage.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "cancel",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/ai/jobs/[jobId]/cancel",
        confirmation: true,
      },
      {
        action: "retry",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/ai/jobs/[jobId]/retry",
        confirmation: true,
      },
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/ai/jobs/[jobId]",
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/ai/jobs",
      },
      {
        action: "start",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/ai/jobs",
        body: ai.createAiJobSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "ai_candidate_review",
    title: "Review and apply AI candidates",
    category: "AI assistance",
    description:
      "Preview selected scope-analysis candidates, then apply the exact fingerprint/selection with human confirmation. Never silently publish or accept AI output.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "confirm",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/ai/jobs/[jobId]/actions/confirm",
        body: ai.aiActionSelectionSchema,
        confirmation: true,
      },
      {
        action: "preview",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/ai/jobs/[jobId]/actions/preview",
        body: ai.aiActionSelectionSchema,
      },
    ],
  },
  {
    name: "portfolio_review",
    title: "Review the delivery portfolio",
    category: "Operations",
    description:
      "Read the authorized portfolio filtered by client, person, lifecycle and attention signal.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/portfolio",
        query: operations.portfolioFiltersSchema,
      },
    ],
  },
  {
    name: "capacity_planning",
    title: "Plan team capacity",
    category: "Operations",
    description:
      "Read capacity, set workspace default availability or a member availability effective from an explicit Monday.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "set_default",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/capacity/availability",
        body: operations.availabilityInputSchema,
        confirmation: true,
      },
      {
        action: "set_member",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/capacity/members/[memberUserId]/availability",
        body: operations.availabilityInputSchema,
        confirmation: true,
      },
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/capacity",
        query: operations.capacityFiltersSchema,
      },
    ],
  },
  {
    name: "project_allocations",
    title: "Allocate people to projects",
    category: "Operations",
    description:
      "List, create, update or remove weekly project allocations with explicit people, dates and minutes.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/allocations/[allocationId]",
        body: operations.updateAllocationSchema,
      },
      {
        action: "remove",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/allocations/[allocationId]",
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/allocations",
        query: operations.capacityFiltersSchema,
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/allocations",
        body: operations.allocationInputSchema,
      },
    ],
  },
  {
    name: "time_tracking",
    title: "Record delivery time",
    category: "Operations",
    description:
      "List, record, edit or void actual work time and its billable/non_billable classification. Does not issue invoices or accept payment.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/time-entries/[entryId]",
        body: operations.updateTimeEntrySchema,
      },
      {
        action: "void",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/time-entries/[entryId]",
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/time-entries",
        query: operations.timeEntryFiltersSchema,
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/time-entries",
        body: operations.timeEntryInputSchema,
      },
    ],
  },
  {
    name: "commercial_exposure",
    title: "Review commercial exposure",
    category: "Operations",
    description:
      "Read restricted workspace or project commercial exposure using authoritative evidence and existing authorization.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "workspace",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/commercial-exposure",
        query: operations.portfolioFiltersSchema,
      },
      {
        action: "project",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/projects/[projectId]/commercial-exposure",
      },
    ],
  },
  {
    name: "project_templates",
    title: "Reuse project templates",
    category: "Adoption & portability",
    description:
      "List, create, inspect, update or archive templates; apply one to create a normal project for an existing client.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "apply",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/project-templates/[templateId]/apply",
        body: adoption.applyProjectTemplateSchema,
      },
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/project-templates/[templateId]",
      },
      {
        action: "update",
        method: "PATCH",
        path: "/api/v1/workspaces/[workspaceId]/project-templates/[templateId]",
        body: adoption.updateProjectTemplateSchema,
      },
      {
        action: "archive",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/project-templates/[templateId]",
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/project-templates",
        query: z.object({
          includeArchived: z.enum(["true", "false"]).optional(),
        }),
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/project-templates",
        body: adoption.createProjectTemplateSchema,
      },
    ],
  },
  {
    name: "delivery_import",
    title: "Preview and import delivery data",
    category: "Adoption & portability",
    description:
      "List import sessions, preview generic/Jira CSV mapping, inspect row errors and identities, then confirm a reviewed import. Use skip_existing duplicate handling.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "confirm",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/imports/[sessionId]/confirm",
        body: adoption.confirmImportSchema,
        confirmation: true,
      },
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/imports/[sessionId]",
        query: adoption.importRowPaginationSchema,
      },
      {
        action: "preview",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/imports/preview",
        body: adoption.importPreviewSchema,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/imports",
        query: adoption.adoptionPaginationSchema,
      },
    ],
  },
  {
    name: "workspace_exports",
    title: "Export your workspace data",
    category: "Adoption & portability",
    description:
      "Create an owner-only operational export, inspect its manifest, download a selected archive part, or download paginated core delivery CSV. Exports are not legal archives.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "download_part",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/exports/[exportId]/parts/[partNumber]",
        confirmation: true,
        download: true,
      },
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/exports/[exportId]",
      },
      {
        action: "download_delivery_csv",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/exports/delivery-core",
        query: adoption.deliveryExportFilterSchema,
        download: true,
      },
      {
        action: "create",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/exports",
        confirmation: true,
      },
    ],
  },
  {
    name: "workspace_lifecycle",
    title: "Manage workspace closure requests",
    category: "Administration",
    description:
      "Read, submit or cancel owner closure/deletion intent with the existing typed name and retention/export acknowledgements. The tool does not execute operator purge jobs.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "cancel",
        method: "DELETE",
        path: "/api/v1/workspaces/[workspaceId]/lifecycle-requests/[requestId]",
        confirmation: true,
      },
      {
        action: "list",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/lifecycle-requests",
      },
      {
        action: "request",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/lifecycle-requests",
        body: platform.workspaceLifecycleRequestSchema,
        confirmation: true,
      },
    ],
  },
  {
    name: "workspace_billing",
    title: "Review subscription and billing",
    category: "Administration",
    description:
      "Read owner billing state. Continue checkout or billing portal changes in the ordinary billing UI; payment details and provider authorization remain human-controlled.",
    surfaces: ["workspace"],
    operations: [
      {
        action: "checkout",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/billing/checkout",
        body: billing.startCheckoutSchema,
        handoff: "billing",
      },
      {
        action: "portal",
        method: "POST",
        path: "/api/v1/workspaces/[workspaceId]/billing/portal",
        handoff: "billing",
      },
      {
        action: "read",
        method: "GET",
        path: "/api/v1/workspaces/[workspaceId]/billing",
      },
    ],
  },
];
