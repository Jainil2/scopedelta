import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { getDb, type Database } from "@/db";
import {
  aiJobs,
  auditEvents,
  billingProviderEvents,
  clientCollaborationNotifications,
  clientProjectInvitations,
  clientProjectParticipants,
  clients,
  commercialBaselines,
  engineeringRepositories,
  memberships,
  migrationImportSessions,
  projectTemplates,
  projects,
  providerWebhookDeliveries,
  verificationRecords,
  workspaceBillingStates,
  workspaceInvitations,
  workspaceLifecycleRequests,
  workspaceOnboardingPreferences,
  workspaceProductSignals,
  workspaces,
  type WorkspaceLifecycleIntent,
  type WorkspaceProductSignalOutcome,
} from "@/db/schema";
import { getDistributionConfig } from "@/lib/billing-plans";
import { getAiConfig } from "@/lib/env";
import { forbidden, notFound, PlatformError } from "@/lib/platform-errors";
import type { UserActor } from "@/server/workspaces";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type SignalExecutor = Database | Transaction;

export const WORKSPACE_PRODUCT_SIGNAL_TYPES = [
  "workspace_created",
  "client_created",
  "project_created",
  "commercial_baseline_created",
  "client_invite_created",
  "client_action_recorded",
  "engineering_connected",
  "qa_verification_recorded",
  "ai_job_completed",
  "migration_import_started",
  "migration_import_completed",
  "billing_checkout_started",
  "billing_subscription_changed",
  "onboarding_step_completed",
  "email_delivery",
  "provider_delivery",
  "entitlement_denied",
] as const;

export type WorkspaceProductSignalType =
  (typeof WORKSPACE_PRODUCT_SIGNAL_TYPES)[number];

const SIGNAL_DIMENSIONS = new Set([
  "none",
  "workspace_profile",
  "internal_member",
  "first_client",
  "first_project",
  "commercial_baseline",
  "client_participant",
  "engineering_connection",
  "qa_verification",
  "ai_provider",
  "billing_awareness",
  "provider_unavailable",
  "provider_rejected",
  "configuration",
  "capacity",
  "lease_expired",
  "validation",
  "workspace_invitation",
  "client_invitation",
  "client_notification",
  "active",
  "checkout_pending",
  "canceled_paid_through",
  "grace",
  "expired",
  "entry",
]);

export async function recordWorkspaceProductSignal(
  database: SignalExecutor,
  input: {
    workspaceId: string;
    eventType: WorkspaceProductSignalType;
    outcome: WorkspaceProductSignalOutcome;
    dimension?: string;
    subjectId?: string | null;
    occurredAt?: Date;
  },
) {
  const dimension = input.dimension ?? "none";
  if (!SIGNAL_DIMENSIONS.has(dimension)) {
    throw new Error("workspace_product_signal_dimension_invalid");
  }
  const occurredAt = input.occurredAt ?? new Date();
  await database
    .insert(workspaceProductSignals)
    .values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      eventType: input.eventType,
      outcome: input.outcome,
      dimension,
      subjectId: input.subjectId ?? null,
      firstOccurredAt: occurredAt,
      lastOccurredAt: occurredAt,
    })
    .onConflictDoUpdate({
      target: [
        workspaceProductSignals.workspaceId,
        workspaceProductSignals.eventType,
        workspaceProductSignals.outcome,
        workspaceProductSignals.dimension,
      ],
      set: {
        subjectId: sql`coalesce(${workspaceProductSignals.subjectId}, excluded.subject_id)`,
        occurrenceCount: sql`${workspaceProductSignals.occurrenceCount} + 1`,
        lastOccurredAt: sql`greatest(${workspaceProductSignals.lastOccurredAt}, excluded.last_occurred_at)`,
      },
    });
}

export type OnboardingStepId =
  | "workspace_profile"
  | "internal_member"
  | "first_client"
  | "first_project"
  | "commercial_baseline"
  | "client_participant"
  | "engineering_connection"
  | "qa_verification"
  | "ai_provider"
  | "billing_awareness";
export type OnboardingStepStatus = "complete" | "actionable" | "blocked";
export type WorkspaceOnboardingStep = {
  id: OnboardingStepId;
  label: string;
  description: string;
  status: OnboardingStepStatus;
  required: boolean;
  href: string;
  prerequisite: string | null;
};
export type WorkspaceOnboarding = {
  dismissed: boolean;
  complete: boolean;
  completedRequired: number;
  requiredCount: number;
  steps: WorkspaceOnboardingStep[];
};

export async function getWorkspaceOnboarding(
  actor: UserActor,
  workspaceId: string,
): Promise<WorkspaceOnboarding> {
  const access = await requireWorkspaceAdmin(actor, workspaceId);
  const database = getDb();
  const [
    preference,
    memberCount,
    clientCount,
    projectCount,
    baselineCount,
    participantCount,
    repositoryCount,
    verificationCount,
    aiSuccessCount,
    templateCount,
  ] = await Promise.all([
    database
      .select({ dismissedAt: workspaceOnboardingPreferences.dismissedAt })
      .from(workspaceOnboardingPreferences)
      .where(
        and(
          eq(workspaceOnboardingPreferences.workspaceId, workspaceId),
          eq(workspaceOnboardingPreferences.userId, actor.userId),
        ),
      )
      .limit(1),
    countRows(
      database,
      memberships,
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.status, "active"),
      ),
    ),
    countRows(database, clients, eq(clients.workspaceId, workspaceId)),
    countRows(
      database,
      projects,
      and(
        eq(projects.workspaceId, workspaceId),
        inArray(projects.lifecycle, ["active", "completed"]),
      ),
    ),
    database
      .select({ total: count() })
      .from(commercialBaselines)
      .innerJoin(projects, eq(projects.id, commercialBaselines.projectId))
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          inArray(projects.lifecycle, ["active", "completed"]),
        ),
      )
      .then(firstCount),
    database
      .select({ total: count() })
      .from(clientProjectParticipants)
      .innerJoin(projects, eq(projects.id, clientProjectParticipants.projectId))
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          isNull(clientProjectParticipants.revokedAt),
        ),
      )
      .then(firstCount),
    database
      .select({ total: count() })
      .from(engineeringRepositories)
      .innerJoin(projects, eq(projects.id, engineeringRepositories.projectId))
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(engineeringRepositories.state, "active"),
        ),
      )
      .then(firstCount),
    database
      .select({ total: count() })
      .from(verificationRecords)
      .innerJoin(projects, eq(projects.id, verificationRecords.projectId))
      .where(eq(projects.workspaceId, workspaceId))
      .then(firstCount),
    countRows(
      database,
      aiJobs,
      and(eq(aiJobs.workspaceId, workspaceId), eq(aiJobs.status, "succeeded")),
    ),
    countRows(
      database,
      projectTemplates,
      and(
        eq(projectTemplates.workspaceId, workspaceId),
        isNull(projectTemplates.archivedAt),
      ),
    ),
  ]);

  const slug = access.slug;
  const hasProject = projectCount > 0;
  const distribution = getDistributionConfig();
  const aiEnabled = safeAiEnabled();
  const steps: WorkspaceOnboardingStep[] = [
    step(
      "workspace_profile",
      "Confirm workspace profile",
      true,
      true,
      `/app/${slug}/settings`,
      "Confirm the workspace name and time zone.",
      null,
    ),
    step(
      "internal_member",
      "Invite an internal teammate",
      memberCount > 1,
      false,
      `/app/${slug}/settings/members`,
      "Add another delivery teammate when collaboration is needed.",
      null,
    ),
    step(
      "first_client",
      "Create the first client",
      clientCount > 0,
      true,
      `/app/${slug}/clients`,
      "Create the client record that owns delivery work.",
      null,
    ),
    step(
      "first_project",
      "Create the first project",
      hasProject,
      true,
      templateCount > 0
        ? `/app/${slug}/settings/adoption#templates`
        : `/app/${slug}/projects`,
      templateCount > 0
        ? "Apply a reusable template or create a project directly."
        : "Create a project for the first client.",
      clientCount > 0 ? null : "Create a client first.",
    ),
    step(
      "commercial_baseline",
      "Establish the commercial baseline",
      baselineCount > 0,
      true,
      `/app/${slug}/projects`,
      "Record the current authoritative commercial basis.",
      hasProject ? null : "Create a project first.",
    ),
    step(
      "client_participant",
      "Invite a client participant",
      participantCount > 0,
      false,
      `/app/${slug}/projects`,
      "Give the client a deliberately smaller project-safe view.",
      hasProject ? null : "Create a project first.",
    ),
    step(
      "engineering_connection",
      "Connect engineering evidence",
      repositoryCount > 0,
      false,
      `/app/${slug}/projects`,
      "Connect a relevant repository when provider evidence is useful.",
      hasProject ? null : "Create a project first.",
    ),
    step(
      "qa_verification",
      "Record QA verification",
      verificationCount > 0,
      false,
      `/app/${slug}/projects`,
      "Record factual QA evidence without inventing a health score.",
      hasProject ? null : "Create a project first.",
    ),
    ...(aiEnabled
      ? [
          step(
            "ai_provider",
            "Run the first AI analysis",
            aiSuccessCount > 0,
            false,
            `/app/${slug}/projects`,
            "AI remains optional and produces reviewable drafts.",
            hasProject ? null : "Create a project first.",
          ),
        ]
      : []),
    ...(distribution.mode === "managed_cloud"
      ? [
          step(
            "billing_awareness",
            "Review plan and managed allowances",
            true,
            false,
            `/app/${slug}/settings/billing`,
            "Review the current plan before managed limits matter.",
            null,
          ),
        ]
      : []),
  ];
  const required = steps.filter((item) => item.required);
  const completedRequired = required.filter(
    (item) => item.status === "complete",
  ).length;
  return {
    dismissed: Boolean(preference[0]?.dismissedAt),
    complete: completedRequired === required.length,
    completedRequired,
    requiredCount: required.length,
    steps,
  };
}

export async function setWorkspaceOnboardingDismissed(
  actor: UserActor,
  workspaceId: string,
  dismissed: boolean,
) {
  await requireWorkspaceAdmin(actor, workspaceId);
  const now = new Date();
  await getDb()
    .insert(workspaceOnboardingPreferences)
    .values({
      workspaceId,
      userId: actor.userId,
      dismissedAt: dismissed ? now : null,
    })
    .onConflictDoUpdate({
      target: [
        workspaceOnboardingPreferences.workspaceId,
        workspaceOnboardingPreferences.userId,
      ],
      set: { dismissedAt: dismissed ? now : null, updatedAt: now },
    });
  return { dismissed };
}

export type RecoveryGuidance = {
  failureClass:
    | "configuration"
    | "provider"
    | "capacity"
    | "validation"
    | "stale_execution"
    | "delivery";
  authoritativeState: "unchanged" | "partially_committed" | "preserved";
  retry: "safe_now" | "safe_after_configuration" | "not_applicable";
  summary: string;
  nextAction: { label: string; href: string } | null;
  adminRequired: boolean;
};

export function recoveryGuidance(
  kind: "import" | "ai" | "github" | "email" | "billing",
  code: string | null,
  href: string,
  committedAnything = false,
): RecoveryGuidance {
  const configuration = Boolean(
    code?.includes("config") || code?.includes("disabled"),
  );
  const capacity = Boolean(
    code?.includes("allowance") || code?.includes("capacity"),
  );
  const validation = Boolean(
    code?.includes("validation") ||
    code?.includes("invalid") ||
    code?.includes("parse"),
  );
  const stale = Boolean(code?.includes("lease") || code?.includes("stale"));
  return {
    failureClass: configuration
      ? "configuration"
      : capacity
        ? "capacity"
        : validation
          ? "validation"
          : stale
            ? "stale_execution"
            : kind === "email"
              ? "delivery"
              : "provider",
    authoritativeState:
      kind === "import" && committedAnything
        ? "partially_committed"
        : kind === "github" || kind === "email"
          ? "preserved"
          : "unchanged",
    retry: validation
      ? "not_applicable"
      : configuration || capacity
        ? "safe_after_configuration"
        : "safe_now",
    summary: validation
      ? committedAnything
        ? "Some valid records were preserved, but the remaining source or input must be corrected before continuing."
        : "Authoritative state is unchanged. Correct the source or input before trying again."
      : recoverySummary(kind, committedAnything),
    nextAction: {
      label: validation
        ? "Correct source or input"
        : configuration
          ? "Review configuration"
          : "Retry safely",
      href,
    },
    adminRequired: configuration || capacity || kind === "billing",
  };
}

export async function listWorkspaceLifecycleRequests(
  actor: UserActor,
  workspaceId: string,
) {
  await requireWorkspaceOwner(actor, workspaceId);
  return getDb()
    .select()
    .from(workspaceLifecycleRequests)
    .where(eq(workspaceLifecycleRequests.workspaceId, workspaceId))
    .orderBy(desc(workspaceLifecycleRequests.requestedAt))
    .limit(20);
}

export async function requestWorkspaceLifecycle(
  actor: UserActor,
  workspaceId: string,
  input: {
    intent: WorkspaceLifecycleIntent;
    confirmation: string;
    exportAcknowledged: boolean;
    retentionAcknowledged: boolean;
  },
) {
  const access = await requireWorkspaceOwner(actor, workspaceId);
  if (
    input.confirmation !== access.slug ||
    !input.exportAcknowledged ||
    !input.retentionAcknowledged
  ) {
    throw new PlatformError(
      "lifecycle_confirmation_required",
      400,
      "Confirm the workspace slug, export option, and retained-history boundary.",
    );
  }
  return getDb().transaction(async (transaction) => {
    await transaction.execute(
      sql`select ${workspaces.id} from ${workspaces} where ${workspaces.id} = ${workspaceId} for update`,
    );
    if (getDistributionConfig().mode === "managed_cloud") {
      const billing = await transaction
        .select({ status: workspaceBillingStates.status })
        .from(workspaceBillingStates)
        .where(eq(workspaceBillingStates.workspaceId, workspaceId))
        .limit(1);
      if (billing[0] && !["entry", "expired"].includes(billing[0].status)) {
        throw new PlatformError(
          "active_subscription_blocks_lifecycle_request",
          409,
          "Resolve the active managed subscription before requesting workspace closure.",
        );
      }
    }
    const id = randomUUID();
    const inserted = await transaction
      .insert(workspaceLifecycleRequests)
      .values({
        id,
        workspaceId,
        intent: input.intent,
        requestedByUserId: actor.userId,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted[0]) {
      throw new PlatformError(
        "lifecycle_request_exists",
        409,
        "This workspace already has an open lifecycle request.",
      );
    }
    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "workspace.lifecycle.requested.v1",
      targetType: "workspace_lifecycle_request",
      targetId: id,
      metadata: { intent: input.intent },
    });
    return inserted[0];
  });
}

export async function cancelWorkspaceLifecycleRequest(
  actor: UserActor,
  workspaceId: string,
  requestId: string,
) {
  await requireWorkspaceOwner(actor, workspaceId);
  return getDb().transaction(async (transaction) => {
    const now = new Date();
    const updated = await transaction
      .update(workspaceLifecycleRequests)
      .set({
        state: "canceled",
        canceledAt: now,
        canceledByUserId: actor.userId,
        updatedAt: now,
      })
      .where(
        and(
          eq(workspaceLifecycleRequests.id, requestId),
          eq(workspaceLifecycleRequests.workspaceId, workspaceId),
          eq(workspaceLifecycleRequests.state, "requested"),
        ),
      )
      .returning();
    if (!updated[0]) throw notFound();
    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "workspace.lifecycle.canceled.v1",
      targetType: "workspace_lifecycle_request",
      targetId: requestId,
      metadata: {},
    });
    return updated[0];
  });
}

export async function listOperatorSignals(limit = 100) {
  const bounded = Math.max(1, Math.min(limit, 200));
  const database = getDb();
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  const buckets = await resolveNamedPromises({
    workspaceEmail: database
      .select({
        id: workspaceInvitations.id,
        workspaceId: workspaceInvitations.workspaceId,
        status: workspaceInvitations.emailDeliveryState,
        code: workspaceInvitations.lastEmailErrorCode,
        updatedAt: workspaceInvitations.lastEmailAttemptAt,
      })
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.emailDeliveryState, "failed"))
      .orderBy(desc(workspaceInvitations.lastEmailAttemptAt))
      .limit(bounded),
    clientEmail: database
      .select({
        id: clientProjectInvitations.id,
        workspaceId: projects.workspaceId,
        status: clientProjectInvitations.emailDeliveryState,
        updatedAt: clientProjectInvitations.lastEmailAttemptAt,
      })
      .from(clientProjectInvitations)
      .innerJoin(projects, eq(projects.id, clientProjectInvitations.projectId))
      .where(eq(clientProjectInvitations.emailDeliveryState, "failed"))
      .orderBy(desc(clientProjectInvitations.lastEmailAttemptAt))
      .limit(bounded),
    funnel: database
      .select({
        eventType: workspaceProductSignals.eventType,
        workspaces: count(),
      })
      .from(workspaceProductSignals)
      .where(
        inArray(workspaceProductSignals.eventType, [
          "workspace_created",
          "client_created",
          "project_created",
          "commercial_baseline_created",
        ]),
      )
      .groupBy(workspaceProductSignals.eventType),
    ai: database
      .select({
        id: aiJobs.id,
        workspaceId: aiJobs.workspaceId,
        status: aiJobs.status,
        code: aiJobs.errorCode,
        updatedAt: aiJobs.updatedAt,
      })
      .from(aiJobs)
      .where(
        or(
          eq(aiJobs.status, "failed"),
          and(
            eq(aiJobs.status, "running"),
            lt(aiJobs.leaseExpiresAt, new Date()),
          ),
        ),
      )
      .orderBy(desc(aiJobs.updatedAt))
      .limit(bounded),
    imports: database
      .select({
        id: migrationImportSessions.id,
        workspaceId: migrationImportSessions.workspaceId,
        status: migrationImportSessions.state,
        code: migrationImportSessions.lastErrorCode,
        updatedAt: migrationImportSessions.updatedAt,
      })
      .from(migrationImportSessions)
      .where(
        or(
          eq(migrationImportSessions.state, "failed"),
          and(
            eq(migrationImportSessions.state, "committing"),
            lt(migrationImportSessions.processingLeaseUntil, new Date()),
          ),
        ),
      )
      .orderBy(desc(migrationImportSessions.updatedAt))
      .limit(bounded),
    billing: database
      .select({
        id: billingProviderEvents.eventId,
        workspaceId: billingProviderEvents.workspaceId,
        status: billingProviderEvents.state,
        code: billingProviderEvents.errorCode,
        updatedAt: billingProviderEvents.receivedAt,
      })
      .from(billingProviderEvents)
      .where(
        or(
          inArray(billingProviderEvents.state, ["failed", "rejected"]),
          and(
            eq(billingProviderEvents.state, "processing"),
            lt(billingProviderEvents.receivedAt, staleBefore),
          ),
        ),
      )
      .orderBy(desc(billingProviderEvents.receivedAt))
      .limit(bounded),
    provider: database
      .select({
        id: providerWebhookDeliveries.id,
        status: providerWebhookDeliveries.state,
        code: providerWebhookDeliveries.errorCode,
        updatedAt: providerWebhookDeliveries.receivedAt,
      })
      .from(providerWebhookDeliveries)
      .where(
        or(
          eq(providerWebhookDeliveries.state, "failed"),
          and(
            eq(providerWebhookDeliveries.state, "processing"),
            lt(providerWebhookDeliveries.receivedAt, staleBefore),
          ),
        ),
      )
      .orderBy(desc(providerWebhookDeliveries.receivedAt))
      .limit(bounded),
    notificationEmail: database
      .select({
        workspaceId: clientCollaborationNotifications.workspaceId,
        failures: count(),
        updatedAt: sql<Date>`max(${clientCollaborationNotifications.lastEmailAttemptAt})`,
      })
      .from(clientCollaborationNotifications)
      .where(eq(clientCollaborationNotifications.emailDeliveryState, "failed"))
      .groupBy(clientCollaborationNotifications.workspaceId)
      .orderBy(
        desc(sql`max(${clientCollaborationNotifications.lastEmailAttemptAt})`),
      )
      .limit(bounded),
    lifecycle: database
      .select({
        id: workspaceLifecycleRequests.id,
        workspaceId: workspaceLifecycleRequests.workspaceId,
        intent: workspaceLifecycleRequests.intent,
        updatedAt: workspaceLifecycleRequests.updatedAt,
      })
      .from(workspaceLifecycleRequests)
      .where(eq(workspaceLifecycleRequests.state, "requested"))
      .orderBy(asc(workspaceLifecycleRequests.requestedAt))
      .limit(bounded),
    repeated: database
      .select({
        workspaceId: workspaceProductSignals.workspaceId,
        eventType: workspaceProductSignals.eventType,
        dimension: workspaceProductSignals.dimension,
        occurrenceCount: workspaceProductSignals.occurrenceCount,
        lastOccurredAt: workspaceProductSignals.lastOccurredAt,
      })
      .from(workspaceProductSignals)
      .where(
        and(
          inArray(workspaceProductSignals.eventType, [
            "entitlement_denied",
            "email_delivery",
            "provider_delivery",
          ]),
          sql`${workspaceProductSignals.occurrenceCount} >= 3`,
        ),
      )
      .orderBy(desc(workspaceProductSignals.lastOccurredAt))
      .limit(bounded),
  });
  return buildOperatorSignalExport(buckets);
}

type OperatorSignalBuckets = {
  funnel: readonly unknown[];
  ai: readonly unknown[];
  imports: readonly unknown[];
  billing: readonly unknown[];
  provider: readonly unknown[];
  workspaceEmail: readonly unknown[];
  clientEmail: readonly unknown[];
  notificationEmail: readonly unknown[];
  lifecycle: readonly unknown[];
  repeated: readonly unknown[];
};

export function buildOperatorSignalExport<T extends OperatorSignalBuckets>(
  buckets: T,
) {
  return {
    funnel: buckets.funnel,
    attention: {
      ai: buckets.ai,
      imports: buckets.imports,
      billing: buckets.billing,
      provider: buckets.provider,
      email: {
        workspaceInvitations: buckets.workspaceEmail,
        clientInvitations: buckets.clientEmail,
        notifications: buckets.notificationEmail,
      },
      lifecycle: buckets.lifecycle,
      repeated: buckets.repeated,
    },
  };
}

async function resolveNamedPromises<
  T extends Record<string, Promise<readonly unknown[]>>,
>(promises: T): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const entries = await Promise.all(
    Object.entries(promises).map(async ([key, promise]) => [
      key,
      await promise,
    ]),
  );
  return Object.fromEntries(entries) as { [K in keyof T]: Awaited<T[K]> };
}

async function requireWorkspaceAdmin(actor: UserActor, workspaceId: string) {
  const access = await activeAccess(actor, workspaceId);
  if (access.role === "member") throw forbidden();
  return access;
}

async function requireWorkspaceOwner(actor: UserActor, workspaceId: string) {
  const access = await activeAccess(actor, workspaceId);
  if (access.role !== "owner") throw forbidden();
  return access;
}

async function activeAccess(actor: UserActor, workspaceId: string) {
  const rows = await getDb()
    .select({ role: memberships.role, slug: workspaces.slug })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, actor.userId),
        eq(memberships.status, "active"),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

function step(
  id: OnboardingStepId,
  label: string,
  complete: boolean,
  required: boolean,
  href: string,
  description: string,
  prerequisite: string | null,
): WorkspaceOnboardingStep {
  return {
    id,
    label,
    description,
    required,
    href,
    prerequisite,
    status: complete ? "complete" : prerequisite ? "blocked" : "actionable",
  };
}

function safeAiEnabled() {
  try {
    return getAiConfig().enabled;
  } catch {
    return process.env.AI_ENABLED?.trim().toLowerCase() === "true";
  }
}

async function countRows(
  database: Database,
  table: PgTable,
  where: SQL | undefined,
): Promise<number> {
  // Drizzle's generic table types are intentionally contained at this small helper.
  const rows = await database
    .select({ total: count() })
    .from(table)
    .where(where);
  return firstCount(rows);
}

function firstCount(rows: Array<{ total: number | string }>) {
  return Number(rows[0]?.total ?? 0);
}

function recoverySummary(
  kind: "import" | "ai" | "github" | "email" | "billing",
  committedAnything: boolean,
) {
  if (kind === "import" && committedAnything) {
    return "The import committed some authoritative records. Retry resumes safely and skips existing source objects.";
  }
  if (kind === "github") {
    return "The provider refresh failed. Existing engineering evidence remains preserved and may become stale.";
  }
  if (kind === "email") {
    return "Delivery failed without rolling back the invitation or shared product state.";
  }
  if (kind === "billing") {
    return "The billing provider action failed without changing the current authoritative subscription snapshot.";
  }
  return "The operation failed before changing authoritative delivery state and can be retried safely.";
}
