import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { and, count, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { getDb, type Database } from "@/db";
import {
  aiJobAttempts,
  aiJobs,
  auditEvents,
  billingCheckoutAttempts,
  billingProviderEvents,
  clientCollaborationNotifications,
  clientProjectInvitations,
  clientProjectParticipants,
  managedUsageRecords,
  memberships,
  projects,
  workspaceBillingStates,
  workspaces,
  type BillingSubscriptionStatus,
} from "@/db/schema";
import {
  effectiveEntitlements,
  getDistributionConfig,
  getPlan,
  publicPlan,
} from "@/lib/billing-plans";
import type { EntitlementPolicy, PlatformCapability } from "@/lib/entitlements";
import { forbidden, notFound, PlatformError } from "@/lib/platform-errors";
import type { UserActor } from "@/server/workspaces";

import {
  createPaddleCheckout,
  createPaddlePortal,
  type PaddleWebhookEvent,
} from "./paddle-billing";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

const ACTIVE_USAGE_STATES = ["reserved", "consumed"] as const;

function periodFor(
  state: typeof workspaceBillingStates.$inferSelect,
  now: Date,
) {
  if (
    state.periodStartsAt &&
    state.periodEndsAt &&
    state.periodStartsAt <= now &&
    state.periodEndsAt > now
  ) {
    return { startsAt: state.periodStartsAt, endsAt: state.periodEndsAt };
  }
  return {
    startsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    endsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

function temporalStatus(
  state: typeof workspaceBillingStates.$inferSelect,
  now: Date,
) {
  if (
    state.status === "grace" &&
    state.graceEndsAt &&
    state.graceEndsAt <= now
  ) {
    return "expired" as const;
  }
  if (
    state.status === "canceled_paid_through" &&
    (!state.paidThrough || state.paidThrough <= now)
  ) {
    return "expired" as const;
  }
  return state.status;
}

async function ensureBillingState(
  database: Executor,
  workspaceId: string,
  now = new Date(),
) {
  const config = getDistributionConfig();
  const entryPlan = getPlan(config.entryPlanKey, config);
  await database
    .insert(workspaceBillingStates)
    .values({
      workspaceId,
      planKey: entryPlan.key,
      status: "entry",
      effectiveEntitlements: effectiveEntitlements(entryPlan),
      updatedAt: now,
    })
    .onConflictDoNothing();
  let rows = await database
    .select()
    .from(workspaceBillingStates)
    .where(eq(workspaceBillingStates.workspaceId, workspaceId))
    .limit(1);
  if (!rows[0]) throw notFound();
  if (
    !rows[0].providerSubscriptionId &&
    ["entry", "checkout_pending"].includes(rows[0].status) &&
    (rows[0].planKey !== entryPlan.key ||
      !isDeepStrictEqual(
        rows[0].effectiveEntitlements,
        effectiveEntitlements(entryPlan),
      ))
  ) {
    const updated = await database
      .update(workspaceBillingStates)
      .set({
        planKey: entryPlan.key,
        effectiveEntitlements: effectiveEntitlements(entryPlan),
        updatedAt: now,
      })
      .where(eq(workspaceBillingStates.workspaceId, workspaceId))
      .returning();
    rows = updated;
  }
  const status = temporalStatus(rows[0], now);
  if (status !== rows[0].status) {
    const updated = await database
      .update(workspaceBillingStates)
      .set({ status, updatedAt: now })
      .where(eq(workspaceBillingStates.workspaceId, workspaceId))
      .returning();
    rows = updated;
  }
  return rows[0]!;
}

async function membership(
  database: Executor,
  actor: UserActor,
  workspaceId: string,
) {
  const rows = await database
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, actor.userId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function owner(
  database: Executor,
  actor: UserActor,
  workspaceId: string,
) {
  const access = await membership(database, actor, workspaceId);
  if (access.role !== "owner") throw forbidden();
  return access;
}

function managedActionsAllowed(status: BillingSubscriptionStatus) {
  const config = getDistributionConfig();
  return (
    status === "entry" ||
    status === "active" ||
    status === "checkout_pending" ||
    status === "canceled_paid_through" ||
    (status === "grace" && config.allowManagedActionsDuringGrace)
  );
}

async function assertManagedAction(workspaceId: string) {
  const config = getDistributionConfig();
  if (config.mode === "self_host") return;
  const state = await ensureBillingState(getDb(), workspaceId);
  if (!managedActionsAllowed(state.status)) {
    throw new PlatformError(
      "managed_entitlement_inactive",
      402,
      "This managed action is unavailable for the current subscription state.",
    );
  }
}

export const deploymentEntitlementPolicy: EntitlementPolicy = {
  async assertAllowed(capability, context) {
    const config = getDistributionConfig();
    if (
      config.mode === "self_host" ||
      !context.workspaceId ||
      capability !== "ai.job.run" ||
      !config.managedAi
    ) {
      return;
    }
    await assertManagedAction(context.workspaceId);
  },
};

export async function initializeWorkspaceBillingState(
  database: Transaction,
  workspaceId: string,
) {
  await ensureBillingState(database, workspaceId);
}

export async function assertActiveProjectCapacity(
  database: Transaction,
  workspaceId: string,
) {
  const config = getDistributionConfig();
  if (config.mode === "self_host") return;
  const state = await ensureBillingState(database, workspaceId);
  if (!managedActionsAllowed(state.status)) {
    throw new PlatformError(
      "active_project_entitlement_inactive",
      402,
      "Activate billing before creating or reactivating a project.",
    );
  }
  const limit = state.effectiveEntitlements.activeProjects;
  if (limit === null) return;
  const rows = await database
    .select({ total: count() })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.lifecycle, "active"),
      ),
    );
  if ((rows[0]?.total ?? 0) >= limit) {
    throw new PlatformError(
      "active_project_capacity_exceeded",
      402,
      "This workspace has reached its active-project capacity.",
    );
  }
}

export async function assertInternalMemberCapacity(
  database: Transaction,
  workspaceId: string,
) {
  const config = getDistributionConfig();
  if (config.mode === "self_host") return;
  const state = await ensureBillingState(database, workspaceId);
  const limit = state.effectiveEntitlements.internalUsers;
  if (limit === null) return;
  const rows = await database
    .select({ total: count() })
    .from(memberships)
    .where(eq(memberships.workspaceId, workspaceId));
  if ((rows[0]?.total ?? 0) >= limit) {
    throw new PlatformError(
      "internal_user_capacity_exceeded",
      402,
      "This workspace has reached its internal-user capacity.",
    );
  }
}

export async function reserveManagedAiUsage(
  database: Transaction,
  input: {
    workspaceId: string;
    jobId: string;
    attemptNumber: number;
  },
) {
  const config = getDistributionConfig();
  if (config.mode === "self_host" || !config.managedAi) return null;
  await database.execute(
    sql`select ${workspaces.id} from ${workspaces} where ${workspaces.id} = ${input.workspaceId} for update`,
  );
  const now = new Date();
  const state = await ensureBillingState(database, input.workspaceId, now);
  if (!managedActionsAllowed(state.status)) {
    throw new PlatformError(
      "managed_ai_entitlement_inactive",
      402,
      "Managed AI is unavailable for the current subscription state.",
    );
  }
  const allowance = state.effectiveEntitlements.managedAiCredits;
  const period = periodFor(state, now);
  const idempotencyKey = `${input.jobId}:${input.attemptNumber}`;
  const existing = await database
    .select({ id: managedUsageRecords.id, state: managedUsageRecords.state })
    .from(managedUsageRecords)
    .where(
      and(
        eq(managedUsageRecords.workspaceId, input.workspaceId),
        eq(managedUsageRecords.metric, "ai_job_start"),
        eq(managedUsageRecords.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing[0] && existing[0].state !== "released") return existing[0].id;
  if (existing[0]) {
    throw new PlatformError(
      "managed_ai_reservation_released",
      409,
      "This managed AI attempt must be retried explicitly.",
    );
  }
  const totals = await database
    .select({
      total: sql<number>`coalesce(sum(${managedUsageRecords.unitsReserved}), 0)`,
    })
    .from(managedUsageRecords)
    .where(
      and(
        eq(managedUsageRecords.workspaceId, input.workspaceId),
        eq(managedUsageRecords.metric, "ai_job_start"),
        eq(managedUsageRecords.periodStartsAt, period.startsAt),
        inArray(managedUsageRecords.state, [...ACTIVE_USAGE_STATES]),
      ),
    );
  if (Number(totals[0]?.total ?? 0) >= allowance) {
    throw new PlatformError(
      "managed_ai_allowance_exhausted",
      402,
      "This workspace has used its managed AI allowance for the current period.",
    );
  }
  const inserted = await database
    .insert(managedUsageRecords)
    .values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      metric: "ai_job_start",
      periodStartsAt: period.startsAt,
      periodEndsAt: period.endsAt,
      unitsReserved: 1,
      sourceType: "ai_job_attempt",
      sourceId: idempotencyKey,
      idempotencyKey,
    })
    .returning({ id: managedUsageRecords.id });
  return inserted[0]!.id;
}

export async function settleManagedUsageInTransaction(
  database: Executor,
  usageRecordId: string | null,
  outcome: "consumed" | "released",
) {
  if (!usageRecordId) return;
  await database
    .update(managedUsageRecords)
    .set({
      state: outcome,
      unitsConsumed: outcome === "consumed" ? 1 : 0,
      settledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(managedUsageRecords.id, usageRecordId),
        eq(managedUsageRecords.state, "reserved"),
      ),
    );
}

export async function settleManagedUsage(
  usageRecordId: string | null,
  outcome: "consumed" | "released",
) {
  return settleManagedUsageInTransaction(getDb(), usageRecordId, outcome);
}

export async function consumeManagedEmailUsage(input: {
  workspaceId: string;
  sourceType: "client_invitation" | "client_notification";
  sourceId: string;
  attemptNumber: number;
}) {
  const config = getDistributionConfig();
  if (config.mode === "self_host" || !config.managedEmail) return null;
  return getDb().transaction(async (transaction) => {
    await transaction.execute(
      sql`select ${workspaces.id} from ${workspaces} where ${workspaces.id} = ${input.workspaceId} for update`,
    );
    const now = new Date();
    const state = await ensureBillingState(transaction, input.workspaceId, now);
    if (!managedActionsAllowed(state.status)) {
      throw new PlatformError(
        "managed_email_entitlement_inactive",
        402,
        "Managed email is unavailable for the current subscription state.",
      );
    }
    const allowance = state.effectiveEntitlements.managedEmails;
    const period = periodFor(state, now);
    const idempotencyKey = `${input.sourceType}:${input.sourceId}:${input.attemptNumber}`;
    const existing = await transaction
      .select({ id: managedUsageRecords.id })
      .from(managedUsageRecords)
      .where(
        and(
          eq(managedUsageRecords.workspaceId, input.workspaceId),
          eq(managedUsageRecords.metric, "email_send"),
          eq(managedUsageRecords.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0].id;
    const totals = await transaction
      .select({
        total: sql<number>`coalesce(sum(${managedUsageRecords.unitsReserved}), 0)`,
      })
      .from(managedUsageRecords)
      .where(
        and(
          eq(managedUsageRecords.workspaceId, input.workspaceId),
          eq(managedUsageRecords.metric, "email_send"),
          eq(managedUsageRecords.periodStartsAt, period.startsAt),
          inArray(managedUsageRecords.state, [...ACTIVE_USAGE_STATES]),
        ),
      );
    if (Number(totals[0]?.total ?? 0) >= allowance) {
      throw new PlatformError(
        "managed_email_allowance_exhausted",
        402,
        "This workspace has used its managed email allowance for the current period.",
      );
    }
    const inserted = await transaction
      .insert(managedUsageRecords)
      .values({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        metric: "email_send",
        state: "consumed",
        periodStartsAt: period.startsAt,
        periodEndsAt: period.endsAt,
        unitsReserved: 1,
        unitsConsumed: 1,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        idempotencyKey,
        settledAt: now,
      })
      .returning({ id: managedUsageRecords.id });
    return inserted[0]!.id;
  });
}

async function economics(
  workspaceId: string,
  billingState: typeof workspaceBillingStates.$inferSelect,
) {
  const database = getDb();
  const managedPeriod = periodFor(billingState, new Date());
  const [
    projectRows,
    memberRows,
    clientRows,
    aiRows,
    managedRows,
    inviteEmailRows,
    notificationEmailRows,
    webhookRows,
  ] = await Promise.all([
    database
      .select({ total: count() })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.lifecycle, "active"),
        ),
      ),
    database
      .select({ total: count() })
      .from(memberships)
      .where(eq(memberships.workspaceId, workspaceId)),
    database
      .select({ total: count() })
      .from(clientProjectParticipants)
      .innerJoin(projects, eq(projects.id, clientProjectParticipants.projectId))
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          isNull(clientProjectParticipants.revokedAt),
        ),
      ),
    database
      .select({
        attempts: count(),
        inputTokens: sql<number>`coalesce(sum(${aiJobAttempts.inputTokens}), 0)`,
        outputTokens: sql<number>`coalesce(sum(${aiJobAttempts.outputTokens}), 0)`,
        cachedInputTokens: sql<number>`coalesce(sum(${aiJobAttempts.cachedInputTokens}), 0)`,
        durationMs: sql<number>`coalesce(sum(${aiJobAttempts.durationMs}), 0)`,
      })
      .from(aiJobAttempts)
      .innerJoin(aiJobs, eq(aiJobs.id, aiJobAttempts.jobId))
      .where(eq(aiJobs.workspaceId, workspaceId)),
    database
      .select({
        reserved: sql<number>`coalesce(sum(case when ${managedUsageRecords.state} = 'reserved' then ${managedUsageRecords.unitsReserved} else 0 end), 0)`,
        consumed: sql<number>`coalesce(sum(${managedUsageRecords.unitsConsumed}), 0)`,
      })
      .from(managedUsageRecords)
      .where(
        and(
          eq(managedUsageRecords.workspaceId, workspaceId),
          eq(managedUsageRecords.metric, "ai_job_start"),
          eq(managedUsageRecords.periodStartsAt, managedPeriod.startsAt),
        ),
      ),
    database
      .select({
        attempts: sql<number>`coalesce(sum(${clientProjectInvitations.emailAttemptCount}), 0)`,
        failures: sql<number>`coalesce(sum(case when ${clientProjectInvitations.emailDeliveryState} = 'failed' then 1 else 0 end), 0)`,
      })
      .from(clientProjectInvitations)
      .innerJoin(projects, eq(projects.id, clientProjectInvitations.projectId))
      .where(eq(projects.workspaceId, workspaceId)),
    database
      .select({
        attempts: sql<number>`coalesce(sum(${clientCollaborationNotifications.emailAttemptCount}), 0)`,
        failures: sql<number>`coalesce(sum(case when ${clientCollaborationNotifications.emailDeliveryState} = 'failed' then 1 else 0 end), 0)`,
      })
      .from(clientCollaborationNotifications)
      .where(eq(clientCollaborationNotifications.workspaceId, workspaceId)),
    database
      .select({
        failed: sql<number>`coalesce(sum(case when ${billingProviderEvents.state} in ('failed', 'rejected') then 1 else 0 end), 0)`,
      })
      .from(billingProviderEvents)
      .where(eq(billingProviderEvents.workspaceId, workspaceId)),
  ]);
  return {
    activeProjects: Number(projectRows[0]?.total ?? 0),
    internalUsers: Number(memberRows[0]?.total ?? 0),
    externalParticipants: Number(clientRows[0]?.total ?? 0),
    managedUsage: {
      periodStartsAt: managedPeriod.startsAt,
      periodEndsAt: managedPeriod.endsAt,
      reserved: Number(managedRows[0]?.reserved ?? 0),
      consumed: Number(managedRows[0]?.consumed ?? 0),
    },
    aiProviderUsage: {
      attempts: Number(aiRows[0]?.attempts ?? 0),
      inputTokens: Number(aiRows[0]?.inputTokens ?? 0),
      outputTokens: Number(aiRows[0]?.outputTokens ?? 0),
      cachedInputTokens: Number(aiRows[0]?.cachedInputTokens ?? 0),
      durationMs: Number(aiRows[0]?.durationMs ?? 0),
    },
    emailUsage: {
      attempts:
        Number(inviteEmailRows[0]?.attempts ?? 0) +
        Number(notificationEmailRows[0]?.attempts ?? 0),
      failures:
        Number(inviteEmailRows[0]?.failures ?? 0) +
        Number(notificationEmailRows[0]?.failures ?? 0),
    },
    rejectedOrFailedBillingEvents: Number(webhookRows[0]?.failed ?? 0),
  };
}

export async function getWorkspaceBillingOverview(
  actor: UserActor,
  workspaceId: string,
) {
  const access = await owner(getDb(), actor, workspaceId);
  const state = await getDb().transaction(async (transaction) => {
    await transaction.execute(
      sql`select ${workspaces.id} from ${workspaces} where ${workspaces.id} = ${workspaceId} for update`,
    );
    return ensureBillingState(transaction, workspaceId);
  });
  const config = getDistributionConfig();
  return {
    mode: config.mode,
    role: access.role,
    canManage: access.role === "owner",
    portalAvailable: Boolean(state.providerCustomerId),
    subscription: {
      planKey: state.planKey,
      pendingPlanKey: state.pendingPlanKey,
      status: state.status,
      periodStartsAt: state.periodStartsAt,
      periodEndsAt: state.periodEndsAt,
      paidThrough: state.paidThrough,
      graceEndsAt: state.graceEndsAt,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      effectiveEntitlements: state.effectiveEntitlements,
    },
    plans: [...config.plans.values()].map((plan) =>
      publicPlan(plan, state.planKey),
    ),
    economics: await economics(workspaceId, state),
  };
}

export async function startCheckout(
  actor: UserActor,
  workspaceId: string,
  planKey: string,
  idempotencyKey: string,
) {
  const config = getDistributionConfig();
  if (config.mode !== "managed_cloud") {
    throw new PlatformError(
      "billing_not_applicable",
      409,
      "Self-host deployments do not require ScopeDelta Cloud billing.",
    );
  }
  const plan = config.plans.get(planKey);
  if (!plan) {
    throw new PlatformError(
      "billing_plan_unavailable",
      409,
      "This plan is not available for checkout.",
    );
  }
  if (!plan.providerPriceId || plan.key === config.entryPlanKey) {
    throw new PlatformError(
      "billing_plan_unavailable",
      409,
      "This plan is not available for checkout.",
    );
  }
  const prepared = await getDb().transaction(async (transaction) => {
    await owner(transaction, actor, workspaceId);
    const workspaceRows = await transaction
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for("update")
      .limit(1);
    if (!workspaceRows[0]) throw notFound();
    const state = await ensureBillingState(transaction, workspaceId);
    if (state.providerSubscriptionId || state.status === "active") {
      throw new PlatformError(
        "billing_subscription_exists",
        409,
        "Manage the existing subscription through the billing portal.",
      );
    }
    const same = await transaction
      .select()
      .from(billingCheckoutAttempts)
      .where(
        and(
          eq(billingCheckoutAttempts.workspaceId, workspaceId),
          eq(billingCheckoutAttempts.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (same[0]?.status === "pending" && same[0].checkoutUrl) {
      return { existingUrl: same[0].checkoutUrl } as const;
    }
    if (same[0]) {
      throw new PlatformError(
        "billing_checkout_in_progress",
        409,
        "This checkout attempt is already being reconciled.",
      );
    }
    const open = await transaction
      .select()
      .from(billingCheckoutAttempts)
      .where(
        and(
          eq(billingCheckoutAttempts.workspaceId, workspaceId),
          inArray(billingCheckoutAttempts.status, ["creating", "pending"]),
        ),
      )
      .limit(1);
    if (open[0]?.status === "pending" && open[0].checkoutUrl) {
      return { existingUrl: open[0].checkoutUrl } as const;
    }
    if (open[0]) {
      throw new PlatformError(
        "billing_checkout_in_progress",
        409,
        "A checkout is already being reconciled for this workspace.",
      );
    }
    const recentlyFailed = await transaction
      .select({ id: billingCheckoutAttempts.id })
      .from(billingCheckoutAttempts)
      .where(
        and(
          eq(billingCheckoutAttempts.workspaceId, workspaceId),
          eq(billingCheckoutAttempts.status, "failed"),
          eq(
            billingCheckoutAttempts.failureCode,
            "billing_provider_outcome_unknown",
          ),
          gt(
            billingCheckoutAttempts.updatedAt,
            new Date(Date.now() - 5 * 60_000),
          ),
        ),
      )
      .limit(1);
    if (recentlyFailed[0]) {
      throw new PlatformError(
        "billing_checkout_reconciliation_pending",
        409,
        "The previous provider request is still being reconciled. Try again shortly.",
      );
    }
    const attemptId = randomUUID();
    await transaction.insert(billingCheckoutAttempts).values({
      id: attemptId,
      workspaceId,
      requestedByUserId: actor.userId,
      planKey,
      idempotencyKey,
    });
    await transaction
      .update(workspaceBillingStates)
      .set({
        pendingPlanKey: planKey,
        status: "checkout_pending",
        updatedAt: new Date(),
      })
      .where(eq(workspaceBillingStates.workspaceId, workspaceId));
    return { attemptId, workspaceSlug: workspaceRows[0].slug } as const;
  });
  if ("existingUrl" in prepared) return { checkoutUrl: prepared.existingUrl };
  try {
    const checkout = await createPaddleCheckout({
      workspaceId,
      workspaceSlug: prepared.workspaceSlug,
      planKey,
      priceId: plan.providerPriceId,
      checkoutAttemptId: prepared.attemptId,
    });
    await getDb().transaction(async (transaction) => {
      await transaction
        .update(billingCheckoutAttempts)
        .set({
          status: "pending",
          providerTransactionId: checkout.providerTransactionId,
          checkoutUrl: checkout.checkoutUrl,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billingCheckoutAttempts.id, prepared.attemptId),
            eq(billingCheckoutAttempts.status, "creating"),
          ),
        );
      await transaction.insert(auditEvents).values({
        id: randomUUID(),
        workspaceId,
        actorType: "human",
        actorId: actor.userId,
        eventType: "billing.checkout.created.v1",
        targetType: "billing_checkout",
        targetId: prepared.attemptId,
        metadata: { planKey, provider: "paddle" },
      });
    });
    return { checkoutUrl: checkout.checkoutUrl };
  } catch (error) {
    await getDb().transaction(async (transaction) => {
      await transaction
        .update(billingCheckoutAttempts)
        .set({
          status: "failed",
          failureCode: "billing_provider_outcome_unknown",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(billingCheckoutAttempts.id, prepared.attemptId),
            eq(billingCheckoutAttempts.status, "creating"),
          ),
        );
      await transaction
        .update(workspaceBillingStates)
        .set({ status: "entry", pendingPlanKey: null, updatedAt: new Date() })
        .where(
          and(
            eq(workspaceBillingStates.workspaceId, workspaceId),
            eq(workspaceBillingStates.status, "checkout_pending"),
            eq(workspaceBillingStates.pendingPlanKey, planKey),
            isNull(workspaceBillingStates.providerSubscriptionId),
          ),
        );
    });
    throw error;
  }
}

export async function openBillingPortal(actor: UserActor, workspaceId: string) {
  await owner(getDb(), actor, workspaceId);
  const state = await ensureBillingState(getDb(), workspaceId);
  if (!state.providerCustomerId) {
    throw new PlatformError(
      "billing_portal_unavailable",
      409,
      "A provider customer does not exist for this workspace yet.",
    );
  }
  return {
    portalUrl: await createPaddlePortal(
      state.providerCustomerId,
      state.providerSubscriptionId,
    ),
  };
}

function eventPlan(event: PaddleWebhookEvent) {
  const config = getDistributionConfig();
  const priceIds = new Set(event.data.items.map((item) => item.price.id));
  const matching = [...config.plans.values()].filter(
    (plan) => plan.providerPriceId && priceIds.has(plan.providerPriceId),
  );
  return matching.length === 1 ? matching[0] : null;
}

function subscriptionTransition(
  event: PaddleWebhookEvent,
  previous: typeof workspaceBillingStates.$inferSelect,
  now: Date,
) {
  const periodStartsAt = event.data.current_billing_period?.starts_at
    ? new Date(event.data.current_billing_period.starts_at)
    : null;
  const periodEndsAt = event.data.current_billing_period?.ends_at
    ? new Date(event.data.current_billing_period.ends_at)
    : null;
  if (event.data.status === "past_due") {
    const config = getDistributionConfig();
    return {
      status: "grace" as const,
      periodStartsAt,
      periodEndsAt,
      paidThrough: periodEndsAt ?? previous.paidThrough,
      graceEndsAt: new Date(now.getTime() + config.graceDays * 86_400_000),
      cancelAtPeriodEnd: false,
    };
  }
  if (event.data.status === "canceled" || event.data.status === "paused") {
    const paidThrough = periodEndsAt ?? previous.paidThrough;
    return {
      status:
        paidThrough && paidThrough > now
          ? ("canceled_paid_through" as const)
          : ("expired" as const),
      periodStartsAt,
      periodEndsAt,
      paidThrough,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
    };
  }
  return {
    status: "active" as const,
    periodStartsAt,
    periodEndsAt,
    paidThrough: periodEndsAt,
    graceEndsAt: null,
    cancelAtPeriodEnd: event.data.scheduled_change?.action === "cancel",
  };
}

export async function processPaddleSubscriptionEvent(
  event: PaddleWebhookEvent,
  rawBody: string,
) {
  const database = getDb();
  const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
  let claimed = await database
    .insert(billingProviderEvents)
    .values({
      eventId: event.event_id,
      provider: "paddle",
      eventType: event.event_type,
      occurredAt: new Date(event.occurred_at),
      providerObjectId: event.data.id,
      payloadSha256,
      state: "processing",
    })
    .onConflictDoNothing()
    .returning({ eventId: billingProviderEvents.eventId });
  if (!claimed[0]) {
    const staleBefore = new Date(Date.now() - 5 * 60_000);
    claimed = await database
      .update(billingProviderEvents)
      .set({
        state: "processing",
        errorCode: null,
        receivedAt: new Date(),
        processedAt: null,
      })
      .where(
        and(
          eq(billingProviderEvents.eventId, event.event_id),
          eq(billingProviderEvents.payloadSha256, payloadSha256),
          or(
            eq(billingProviderEvents.state, "failed"),
            and(
              eq(billingProviderEvents.state, "processing"),
              lte(billingProviderEvents.receivedAt, staleBefore),
            ),
          ),
        ),
      )
      .returning({ eventId: billingProviderEvents.eventId });
  }
  if (!claimed[0]) return { duplicate: true, processed: false };

  const supported = new Set([
    "subscription.created",
    "subscription.activated",
    "subscription.updated",
    "subscription.past_due",
    "subscription.paused",
    "subscription.resumed",
    "subscription.trialing",
    "subscription.canceled",
  ]);
  if (!supported.has(event.event_type)) {
    await database
      .update(billingProviderEvents)
      .set({
        state: "ignored",
        errorCode: "event_unsupported",
        processedAt: new Date(),
      })
      .where(eq(billingProviderEvents.eventId, event.event_id));
    return { duplicate: false, processed: false };
  }

  try {
    const result = await database.transaction(async (transaction) => {
      const plan = eventPlan(event);
      const metadataWorkspaceId =
        typeof event.data.custom_data?.scopedelta_workspace_id === "string"
          ? event.data.custom_data.scopedelta_workspace_id
          : null;
      const metadataPlanKey =
        typeof event.data.custom_data?.scopedelta_plan_key === "string"
          ? event.data.custom_data.scopedelta_plan_key
          : null;
      const bySubscription = await transaction
        .select({ workspaceId: workspaceBillingStates.workspaceId })
        .from(workspaceBillingStates)
        .where(eq(workspaceBillingStates.providerSubscriptionId, event.data.id))
        .limit(1);
      const workspaceId = metadataWorkspaceId ?? bySubscription[0]?.workspaceId;
      if (!workspaceId || !plan) {
        return {
          state: "rejected" as const,
          errorCode: "billing_event_unbound",
        };
      }
      if (metadataPlanKey && metadataPlanKey !== plan.key) {
        return {
          state: "rejected" as const,
          errorCode: "billing_plan_mismatch",
        };
      }
      if (
        bySubscription[0] &&
        metadataWorkspaceId &&
        bySubscription[0].workspaceId !== metadataWorkspaceId
      ) {
        return {
          state: "rejected" as const,
          errorCode: "billing_workspace_mismatch",
        };
      }
      const workspaceRows = await transaction
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .for("update")
        .limit(1);
      if (!workspaceRows[0]) {
        return {
          state: "rejected" as const,
          errorCode: "billing_workspace_unknown",
        };
      }
      const current = await ensureBillingState(transaction, workspaceId);
      if (
        (current.providerSubscriptionId &&
          current.providerSubscriptionId !== event.data.id) ||
        (current.providerCustomerId &&
          current.providerCustomerId !== event.data.customer_id)
      ) {
        return {
          state: "rejected" as const,
          errorCode: "billing_provider_mismatch",
        };
      }
      const occurredAt = new Date(event.occurred_at);
      if (
        current.lastProviderOccurredAt &&
        (occurredAt < current.lastProviderOccurredAt ||
          (occurredAt.getTime() === current.lastProviderOccurredAt.getTime() &&
            current.lastProviderEventId &&
            event.event_id <= current.lastProviderEventId))
      ) {
        return {
          state: "ignored" as const,
          errorCode: "billing_event_out_of_order",
          workspaceId,
        };
      }
      const transition = subscriptionTransition(event, current, occurredAt);
      await transaction
        .update(workspaceBillingStates)
        .set({
          provider: "paddle",
          providerCustomerId: event.data.customer_id,
          providerSubscriptionId: event.data.id,
          planKey: plan.key,
          pendingPlanKey: null,
          effectiveEntitlements: effectiveEntitlements(plan),
          ...transition,
          lastProviderOccurredAt: occurredAt,
          lastProviderEventId: event.event_id,
          updatedAt: new Date(),
        })
        .where(eq(workspaceBillingStates.workspaceId, workspaceId));
      const attemptId =
        typeof event.data.custom_data?.scopedelta_checkout_attempt_id ===
        "string"
          ? event.data.custom_data.scopedelta_checkout_attempt_id
          : null;
      if (attemptId) {
        await transaction
          .update(billingCheckoutAttempts)
          .set({ status: "completed", updatedAt: new Date() })
          .where(
            and(
              eq(billingCheckoutAttempts.id, attemptId),
              eq(billingCheckoutAttempts.workspaceId, workspaceId),
              eq(billingCheckoutAttempts.planKey, plan.key),
            ),
          );
      }
      const existingAudit = await transaction
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.workspaceId, workspaceId),
            eq(auditEvents.eventType, "billing.subscription.reconciled.v1"),
            eq(auditEvents.targetType, "workspace_billing"),
            eq(auditEvents.targetId, workspaceId),
            sql`${auditEvents.metadata}->>'providerEventId' = ${event.event_id}`,
          ),
        )
        .limit(1);
      if (!existingAudit[0]) {
        await transaction.insert(auditEvents).values({
          id: randomUUID(),
          workspaceId,
          actorType: "integration",
          actorId: null,
          eventType: "billing.subscription.reconciled.v1",
          targetType: "workspace_billing",
          targetId: workspaceId,
          metadata: {
            provider: "paddle",
            providerEventId: event.event_id,
            planKey: plan.key,
            status: transition.status,
            eventType: event.event_type,
          },
        });
      }
      return { state: "processed" as const, workspaceId };
    });
    await database
      .update(billingProviderEvents)
      .set({
        state: result.state,
        workspaceId: result.workspaceId,
        errorCode: "errorCode" in result ? result.errorCode : null,
        processedAt: new Date(),
      })
      .where(eq(billingProviderEvents.eventId, event.event_id));
    return { duplicate: false, processed: result.state === "processed" };
  } catch (error) {
    await database
      .update(billingProviderEvents)
      .set({
        state: "failed",
        errorCode: "billing_event_processing_failed",
        processedAt: new Date(),
      })
      .where(eq(billingProviderEvents.eventId, event.event_id));
    throw error;
  }
}

export async function listOperatorEconomics(limit = 500) {
  const bounded = Math.max(1, Math.min(limit, 500));
  const rows = await getDb()
    .select({ id: workspaces.id, billing: workspaceBillingStates })
    .from(workspaces)
    .leftJoin(
      workspaceBillingStates,
      eq(workspaceBillingStates.workspaceId, workspaces.id),
    )
    .limit(bounded);
  return Promise.all(
    rows.map(async (row) => {
      const state = row.billing ?? (await ensureBillingState(getDb(), row.id));
      return {
        workspaceId: row.id,
        planKey: state.planKey,
        subscriptionStatus: state.status,
        ...(await economics(row.id, state)),
      };
    }),
  );
}

export function capabilityNeedsManagedAllowance(
  capability: PlatformCapability,
) {
  return capability === "ai.job.run";
}
