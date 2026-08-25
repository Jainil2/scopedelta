import { createHash, randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, getPool } from "@/db";
import {
  billingProviderEvents,
  clientProjectParticipants,
  managedUsageRecords,
  memberships,
  users,
  workspaceBillingStates,
} from "@/db/schema";
import {
  consumeManagedEmailUsage,
  getWorkspaceBillingOverview,
  openBillingPortal,
  processPaddleSubscriptionEvent,
  reserveManagedAiUsage,
  settleManagedUsage,
  startCheckout,
} from "@/server/billing";
import { createClient, createProject, getProject } from "@/server/delivery";
import type { PaddleWebhookEvent } from "@/server/paddle-billing";
import {
  createWorkspace,
  updateWorkspaceMemberStatus,
} from "@/server/workspaces";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/scopedelta_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error(
    "Integration tests require a dedicated scopedelta_test database.",
  );
}

const db = getDb();
const originalEnv = { ...process.env };

describe("subscription, entitlements, and managed usage", () => {
  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      DISTRIBUTION_MODE: "managed_cloud",
      BILLING_ENTRY_PLAN_KEY: "entry_test",
      BILLING_PLANS_JSON: JSON.stringify(plans()),
      BILLING_GRACE_DAYS: "7",
      BILLING_ALLOW_MANAGED_ACTIONS_DURING_GRACE: "false",
      MANAGED_AI: "true",
      MANAGED_EMAIL: "true",
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_API_KEY: "pdl_sdbx_test_key",
      PADDLE_WEBHOOK_SECRET: "pdl_ntfset_test_secret",
      PADDLE_API_BASE_URL: "https://sandbox-api.paddle.com",
      PADDLE_HOSTED_CHECKOUT_URL:
        "https://sandbox.pay.paddle.io/checkout/hsc_scope_delta_test",
    };
    await db.execute(sql`truncate table workspaces, users cascade`);
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    await getPool().end();
  });

  it("serializes active-project capacity and rechecks reactivation", async () => {
    const fixture = await createFixture();
    const attempts = await Promise.allSettled([
      createProject(fixture.owner, fixture.workspace.id, {
        clientId: fixture.client.id,
        key: "ONE",
        name: "One",
        summary: null,
        leadUserId: fixture.owner.userId,
        startDate: null,
        targetDate: null,
      }),
      createProject(fixture.owner, fixture.workspace.id, {
        clientId: fixture.client.id,
        key: "TWO",
        name: "Two",
        summary: null,
        leadUserId: fixture.owner.userId,
        startDate: null,
        targetDate: null,
      }),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejected).toMatchObject({
      reason: { code: "active_project_capacity_exceeded" },
    });

    const first = attempts.find(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<
        Awaited<ReturnType<typeof createProject>>
      > => attempt.status === "fulfilled",
    )!.value;
    const completed = await import("@/server/delivery").then(
      ({ updateProject }) =>
        updateProject(fixture.owner, fixture.workspace.id, first.id, {
          lifecycle: "completed",
        }),
    );
    expect(completed.lifecycle).toBe("completed");
    await createProject(fixture.owner, fixture.workspace.id, {
      clientId: fixture.client.id,
      key: "THREE",
      name: "Three",
      summary: null,
      leadUserId: fixture.owner.userId,
      startDate: null,
      targetDate: null,
    });
    await expect(
      import("@/server/delivery").then(({ updateProject }) =>
        updateProject(fixture.owner, fixture.workspace.id, first.id, {
          lifecycle: "active",
        }),
      ),
    ).rejects.toMatchObject({ code: "active_project_capacity_exceeded" });
  });

  it("rechecks managed internal-user capacity before membership reactivation", async () => {
    const fixture = await createFixture();
    const activeUser = await createUser("active@example.test", "Active member");
    const suspendedUser = await createUser(
      "suspended@example.test",
      "Suspended member",
    );
    const activeMembershipId = randomUUID();
    const suspendedMembershipId = randomUUID();
    await db.insert(memberships).values([
      {
        id: activeMembershipId,
        workspaceId: fixture.workspace.id,
        userId: activeUser.userId,
        role: "member",
      },
      {
        id: suspendedMembershipId,
        workspaceId: fixture.workspace.id,
        userId: suspendedUser.userId,
        role: "member",
        status: "suspended",
        suspendedAt: new Date(),
        suspendedByUserId: fixture.owner.userId,
      },
    ]);

    await expect(
      updateWorkspaceMemberStatus(
        fixture.owner,
        fixture.workspace.id,
        suspendedMembershipId,
        "active",
      ),
    ).rejects.toMatchObject({ code: "internal_user_capacity_exceeded" });
    await updateWorkspaceMemberStatus(
      fixture.owner,
      fixture.workspace.id,
      activeMembershipId,
      "suspended",
    );
    await expect(
      updateWorkspaceMemberStatus(
        fixture.owner,
        fixture.workspace.id,
        suspendedMembershipId,
        "active",
      ),
    ).resolves.toMatchObject({ status: "active" });
  });

  it("reserves managed AI atomically and keeps client participants non-billable", async () => {
    const fixture = await createFixture();
    const project = await createProject(fixture.owner, fixture.workspace.id, {
      clientId: fixture.client.id,
      key: "AI",
      name: "AI project",
      summary: null,
      leadUserId: fixture.owner.userId,
      startDate: null,
      targetDate: null,
    });
    const external = await createUser("client@example.test", "Client");
    await db.insert(clientProjectParticipants).values({
      projectId: project.id,
      userId: external.userId,
      invitedEmail: external.email,
      role: "collaborator",
      createdByUserId: fixture.owner.userId,
    });

    const reservations = await Promise.allSettled([
      db.transaction((transaction) =>
        reserveManagedAiUsage(transaction, {
          workspaceId: fixture.workspace.id,
          jobId: randomUUID(),
          attemptNumber: 1,
        }),
      ),
      db.transaction((transaction) =>
        reserveManagedAiUsage(transaction, {
          workspaceId: fixture.workspace.id,
          jobId: randomUUID(),
          attemptNumber: 1,
        }),
      ),
    ]);
    expect(
      reservations.filter((item) => item.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      reservations.find((item) => item.status === "rejected"),
    ).toMatchObject({
      reason: { code: "managed_ai_allowance_exhausted" },
    });
    const reservation = reservations.find(
      (item): item is PromiseFulfilledResult<string | null> =>
        item.status === "fulfilled",
    )!.value;
    await settleManagedUsage(reservation, "consumed");
    await consumeManagedEmailUsage({
      workspaceId: fixture.workspace.id,
      sourceType: "client_notification",
      sourceId: "notification-one",
      attemptNumber: 1,
    });
    await expect(
      consumeManagedEmailUsage({
        workspaceId: fixture.workspace.id,
        sourceType: "client_notification",
        sourceId: "notification-two",
        attemptNumber: 1,
      }),
    ).rejects.toMatchObject({ code: "managed_email_allowance_exhausted" });
    const usage = await db
      .select()
      .from(managedUsageRecords)
      .where(eq(managedUsageRecords.id, reservation!));
    expect(usage[0]).toMatchObject({ state: "consumed", unitsConsumed: 1 });

    const overview = await getWorkspaceBillingOverview(
      fixture.owner,
      fixture.workspace.id,
    );
    expect(overview.economics).toMatchObject({
      internalUsers: 1,
      externalParticipants: 1,
    });
  });

  it("activates only from ordered provider events and derives grace/cancellation safely", async () => {
    const fixture = await createFixture();
    const occurredAt = (daysAgo: number) =>
      new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1_000).toISOString();
    const project = await createProject(fixture.owner, fixture.workspace.id, {
      clientId: fixture.client.id,
      key: "HISTORY",
      name: "Historical delivery",
      summary: null,
      leadUserId: fixture.owner.userId,
      startDate: null,
      targetDate: null,
    });
    const active = subscriptionEvent({
      id: "evt_active",
      occurredAt: occurredAt(4),
      workspaceId: fixture.workspace.id,
      status: "active",
    });
    await expect(
      processPaddleSubscriptionEvent(active, JSON.stringify(active)),
    ).resolves.toMatchObject({ processed: true });
    await expect(
      processPaddleSubscriptionEvent(active, JSON.stringify(active)),
    ).resolves.toMatchObject({ duplicate: true });
    let overview = await getWorkspaceBillingOverview(
      fixture.owner,
      fixture.workspace.id,
    );
    expect(overview.subscription).toMatchObject({
      planKey: "paid_test",
      status: "active",
    });

    const old = subscriptionEvent({
      id: "evt_old",
      occurredAt: occurredAt(5),
      workspaceId: fixture.workspace.id,
      status: "past_due",
    });
    await expect(
      processPaddleSubscriptionEvent(old, JSON.stringify(old)),
    ).resolves.toMatchObject({ processed: false });
    overview = await getWorkspaceBillingOverview(
      fixture.owner,
      fixture.workspace.id,
    );
    expect(overview.subscription.status).toBe("active");

    const pastDue = subscriptionEvent({
      id: "evt_past_due",
      occurredAt: occurredAt(3),
      workspaceId: fixture.workspace.id,
      status: "past_due",
    });
    await processPaddleSubscriptionEvent(pastDue, JSON.stringify(pastDue));
    overview = await getWorkspaceBillingOverview(
      fixture.owner,
      fixture.workspace.id,
    );
    expect(overview.subscription.status).toBe("grace");

    const recovered = subscriptionEvent({
      id: "evt_recovered",
      occurredAt: occurredAt(2),
      workspaceId: fixture.workspace.id,
      status: "active",
      scheduledCancel: true,
    });
    await processPaddleSubscriptionEvent(recovered, JSON.stringify(recovered));
    overview = await getWorkspaceBillingOverview(
      fixture.owner,
      fixture.workspace.id,
    );
    expect(overview.subscription).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: true,
    });

    const canceled = subscriptionEvent({
      id: "evt_canceled",
      occurredAt: occurredAt(1),
      workspaceId: fixture.workspace.id,
      status: "canceled",
    });
    await processPaddleSubscriptionEvent(canceled, JSON.stringify(canceled));
    overview = await getWorkspaceBillingOverview(
      fixture.owner,
      fixture.workspace.id,
    );
    expect(overview.subscription.status).toBe("canceled_paid_through");

    await db
      .update(workspaceBillingStates)
      .set({ paidThrough: new Date("2020-01-01T00:00:00.000Z") })
      .where(eq(workspaceBillingStates.workspaceId, fixture.workspace.id));
    overview = await getWorkspaceBillingOverview(
      fixture.owner,
      fixture.workspace.id,
    );
    expect(overview.subscription.status).toBe("expired");
    await expect(
      getProject(fixture.owner, fixture.workspace.id, project.id),
    ).resolves.toMatchObject({ id: project.id, name: "Historical delivery" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          data: {
            urls: {
              general: {
                overview: "https://sandbox-customer-portal.paddle.test/session",
              },
            },
          },
        }),
      ),
    );
    await expect(
      openBillingPortal(fixture.owner, fixture.workspace.id),
    ).resolves.toEqual({
      portalUrl: "https://sandbox-customer-portal.paddle.test/session",
    });
  });

  it("reclaims an interrupted provider event only for the same payload", async () => {
    const fixture = await createFixture();
    const event = subscriptionEvent({
      id: "evt_interrupted",
      occurredAt: "2026-08-16T06:00:00.000Z",
      workspaceId: fixture.workspace.id,
      status: "active",
    });
    const rawBody = JSON.stringify(event);
    await db.insert(billingProviderEvents).values({
      eventId: event.event_id,
      provider: "paddle",
      eventType: event.event_type,
      occurredAt: new Date(event.occurred_at),
      providerObjectId: event.data.id,
      payloadSha256: "different-payload",
      state: "processing",
      receivedAt: new Date(Date.now() - 10 * 60_000),
    });

    await expect(
      processPaddleSubscriptionEvent(event, rawBody),
    ).resolves.toEqual({ duplicate: true, processed: false });
    await db
      .update(billingProviderEvents)
      .set({
        payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
      })
      .where(eq(billingProviderEvents.eventId, event.event_id));

    await expect(
      processPaddleSubscriptionEvent(event, rawBody),
    ).resolves.toEqual({ duplicate: false, processed: true });
  });

  it("retries a transiently failed provider event with the same payload", async () => {
    const fixture = await createFixture();
    const event = subscriptionEvent({
      id: "evt_failed_retry",
      occurredAt: "2026-08-16T07:00:00.000Z",
      workspaceId: fixture.workspace.id,
      status: "active",
    });
    const rawBody = JSON.stringify(event);
    await db.insert(billingProviderEvents).values({
      eventId: event.event_id,
      provider: "paddle",
      eventType: event.event_type,
      occurredAt: new Date(event.occurred_at),
      providerObjectId: event.data.id,
      payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
      state: "failed",
      errorCode: "billing_event_processing_failed",
      processedAt: new Date(),
    });

    await expect(
      processPaddleSubscriptionEvent(event, rawBody),
    ).resolves.toEqual({ duplicate: false, processed: true });
  });

  it("keeps checkout idempotent and never treats the browser return as activation", async () => {
    const fixture = await createFixture();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          id: "txn_test",
          checkout: { url: "https://checkout.paddle.test/txn_test" },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const key = randomUUID();
    const first = await startCheckout(
      fixture.owner,
      fixture.workspace.id,
      "paid_test",
      key,
    );
    const retry = await startCheckout(
      fixture.owner,
      fixture.workspace.id,
      "paid_test",
      key,
    );
    expect(retry).toEqual(first);
    expect(first.checkoutUrl).toBe(
      "https://sandbox.pay.paddle.io/checkout/hsc_scope_delta_test?transaction_id=txn_test",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const overview = await getWorkspaceBillingOverview(
      fixture.owner,
      fixture.workspace.id,
    );
    expect(overview.subscription).toMatchObject({
      planKey: "entry_test",
      pendingPlanKey: "paid_test",
      status: "checkout_pending",
    });
  });

  it.each(["canceled_paid_through", "expired"] as const)(
    "binds a %s subscription replacement to a fresh checkout attempt",
    async (terminalStatus) => {
      const fixture = await createFixture();
      const active = subscriptionEvent({
        id: "evt_replacement_active",
        occurredAt: "2026-08-16T06:00:00.000Z",
        workspaceId: fixture.workspace.id,
        status: "active",
      });
      await processPaddleSubscriptionEvent(active, JSON.stringify(active));
      const canceled = subscriptionEvent({
        id: "evt_replacement_canceled",
        occurredAt: "2026-08-17T06:00:00.000Z",
        workspaceId: fixture.workspace.id,
        status: "canceled",
      });
      await processPaddleSubscriptionEvent(canceled, JSON.stringify(canceled));
      await db
        .update(workspaceBillingStates)
        .set({
          paidThrough: new Date(
            terminalStatus === "expired"
              ? "2020-01-01T00:00:00.000Z"
              : "2099-01-01T00:00:00.000Z",
          ),
        })
        .where(eq(workspaceBillingStates.workspaceId, fixture.workspace.id));
      await expect(
        getWorkspaceBillingOverview(fixture.owner, fixture.workspace.id),
      ).resolves.toMatchObject({ subscription: { status: terminalStatus } });

      let checkoutAttemptId = "";
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as {
            customer_id?: string;
            custom_data: { scopedelta_checkout_attempt_id: string };
          };
          expect(body.customer_id).toBe("ctm_test");
          checkoutAttemptId = body.custom_data.scopedelta_checkout_attempt_id;
          return Response.json({ data: { id: "txn_replacement" } });
        }),
      );
      await expect(
        startCheckout(
          fixture.owner,
          fixture.workspace.id,
          "paid_test",
          randomUUID(),
        ),
      ).resolves.toEqual({
        checkoutUrl:
          "https://sandbox.pay.paddle.io/checkout/hsc_scope_delta_test?transaction_id=txn_replacement",
      });

      const unbound = subscriptionEvent({
        id: "evt_replacement_unbound",
        occurredAt: "2026-08-18T06:00:00.000Z",
        workspaceId: fixture.workspace.id,
        subscriptionId: "sub_replacement_unbound",
        status: "active",
      });
      await expect(
        processPaddleSubscriptionEvent(unbound, JSON.stringify(unbound)),
      ).resolves.toEqual({ duplicate: false, processed: false });

      const replacement = subscriptionEvent({
        id: "evt_replacement_bound",
        occurredAt: "2026-08-19T06:00:00.000Z",
        workspaceId: fixture.workspace.id,
        subscriptionId: "sub_replacement",
        checkoutAttemptId,
        status: "active",
      });
      await expect(
        processPaddleSubscriptionEvent(
          replacement,
          JSON.stringify(replacement),
        ),
      ).resolves.toEqual({ duplicate: false, processed: true });
      const state = await db
        .select()
        .from(workspaceBillingStates)
        .where(eq(workspaceBillingStates.workspaceId, fixture.workspace.id));
      expect(state[0]).toMatchObject({
        providerCustomerId: "ctm_test",
        providerSubscriptionId: "sub_replacement",
        status: "active",
        pendingPlanKey: null,
      });
    },
  );

  it("does not let an outbound checkout error overwrite provider-confirmed activation", async () => {
    const fixture = await createFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const checkout = JSON.parse(String(init?.body)) as {
          custom_data: { scopedelta_checkout_attempt_id: string };
        };
        const active = subscriptionEvent({
          id: "evt_checkout_race",
          occurredAt: "2026-08-16T08:00:00.000Z",
          workspaceId: fixture.workspace.id,
          status: "active",
        });
        active.data.custom_data = {
          ...active.data.custom_data,
          scopedelta_checkout_attempt_id:
            checkout.custom_data.scopedelta_checkout_attempt_id,
        };
        await processPaddleSubscriptionEvent(active, JSON.stringify(active));
        return new Response(null, { status: 503 });
      }),
    );

    await expect(
      startCheckout(
        fixture.owner,
        fixture.workspace.id,
        "paid_test",
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "billing_provider_unavailable" });
    await expect(
      getWorkspaceBillingOverview(fixture.owner, fixture.workspace.id),
    ).resolves.toMatchObject({
      subscription: { planKey: "paid_test", status: "active" },
    });
  });

  it("pauses checkout retries while a provider outcome is ambiguous", async () => {
    const fixture = await createFixture();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    await expect(
      startCheckout(
        fixture.owner,
        fixture.workspace.id,
        "paid_test",
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "billing_provider_unavailable" });
    await expect(
      startCheckout(
        fixture.owner,
        fixture.workspace.id,
        "paid_test",
        randomUUID(),
      ),
    ).rejects.toMatchObject({
      code: "billing_checkout_reconciliation_pending",
    });
  });

  it("keeps operator-grade billing evidence owner-only", async () => {
    const fixture = await createFixture();
    const member = await createUser("member@example.test", "Member");
    await db.insert(memberships).values({
      workspaceId: fixture.workspace.id,
      userId: member.userId,
      role: "member",
    });

    await expect(
      getWorkspaceBillingOverview(member, fixture.workspace.id),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

function plans() {
  return [
    {
      key: "entry_test",
      label: "Entry test",
      description: "Bounded no-cost test entitlement.",
      entitlements: {
        softwareCapabilities: ["core"],
        activeProjects: 1,
        internalUsers: 2,
        managedAiCredits: 1,
        managedEmails: 1,
        storageBytes: 0,
        processingUnits: 0,
      },
    },
    {
      key: "paid_test",
      label: "Paid sandbox test",
      description: "Configured Paddle sandbox entitlement.",
      providerPriceId: "pri_paid_test",
      entitlements: {
        softwareCapabilities: ["core"],
        activeProjects: 3,
        internalUsers: 10,
        managedAiCredits: 20,
        managedEmails: 100,
        storageBytes: 1_000_000,
        processingUnits: 50,
      },
    },
  ];
}

async function createFixture() {
  const owner = await createUser("owner@example.test", "Owner");
  const workspace = await createWorkspace(owner, { name: "Billing Workspace" });
  const client = await createClient(owner, workspace.id, {
    name: "Client",
    internalReference: null,
    summary: null,
  });
  return { owner, workspace, client };
}

async function createUser(email: string, name: string) {
  const id = randomUUID();
  await db.insert(users).values({ id, email, name, emailVerified: true });
  return { userId: id, email };
}

function subscriptionEvent(input: {
  id: string;
  occurredAt: string;
  workspaceId: string;
  status: "active" | "past_due" | "canceled";
  scheduledCancel?: boolean;
  subscriptionId?: string;
  customerId?: string;
  checkoutAttemptId?: string;
}): PaddleWebhookEvent {
  return {
    event_id: input.id,
    event_type:
      input.status === "active"
        ? "subscription.activated"
        : input.status === "past_due"
          ? "subscription.past_due"
          : "subscription.canceled",
    occurred_at: input.occurredAt,
    data: {
      id: input.subscriptionId ?? "sub_test",
      status: input.status,
      customer_id: input.customerId ?? "ctm_test",
      custom_data: {
        scopedelta_workspace_id: input.workspaceId,
        scopedelta_plan_key: "paid_test",
        ...(input.checkoutAttemptId
          ? {
              scopedelta_checkout_attempt_id: input.checkoutAttemptId,
            }
          : {}),
      },
      current_billing_period: {
        starts_at: "2026-08-01T00:00:00.000Z",
        ends_at: "2026-09-01T00:00:00.000Z",
      },
      scheduled_change: input.scheduledCancel
        ? {
            action: "cancel",
            effective_at: "2026-09-01T00:00:00.000Z",
          }
        : null,
      items: [{ price: { id: "pri_paid_test" } }],
    },
  };
}
