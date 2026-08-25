import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { eq, sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { getDb, getPool } from "@/db";
import {
  aiJobAttempts,
  aiJobs,
  auditEvents,
  commercialEvidenceSources,
  managedUsageRecords,
  memberships,
  operatorAlertDeliveries,
  operatorIncidents,
  users,
  workspaceInvitations,
  workspaces,
} from "@/db/schema";
import { createClient, createProject } from "@/server/delivery";
import {
  PHYSICAL_PURGE_ERROR,
  processWorkspaceLifecycle,
} from "@/server/lifecycle-processing";
import { runOperationsAlerts } from "@/server/operations-alerts";
import { reconcileOperationalRecovery } from "@/server/operations-recovery";
import {
  cancelWorkspaceLifecycleRequest,
  requestWorkspaceLifecycle,
} from "@/server/self-service";
import {
  createWorkspaceExport,
  downloadWorkspaceExportPart,
  getWorkspaceExport,
} from "@/server/workspace-export";
import { createWorkspace } from "@/server/workspaces";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/scopedelta_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error(
    "Integration tests require a dedicated scopedelta_test database.",
  );
}

const db = getDb();

async function reset() {
  await db.execute(
    sql.raw(
      "truncate table users, workspaces, operator_alert_deliveries, action_rate_limits cascade",
    ),
  );
}

async function createUser(email: string, name: string) {
  const userId = randomUUID();
  await db
    .insert(users)
    .values({ id: userId, email, name, emailVerified: true });
  return { userId, email };
}

async function fixture() {
  const owner = await createUser("ga-owner@example.test", "GA Owner");
  const workspace = await createWorkspace(owner, { name: "GA Boundary" });
  const client = await createClient(owner, workspace.id, {
    name: "Commercial Client",
    internalReference: null,
    summary: null,
  });
  const project = await createProject(owner, workspace.id, {
    clientId: client.id,
    key: "GA",
    name: "GA Project",
    summary: null,
    leadUserId: owner.userId,
  });
  return { owner, workspace, client, project };
}

describe("SC-012 GA hardening", () => {
  beforeEach(async () => {
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "ga-hardening-secret-at-least-thirty-two-characters",
    );
    vi.stubEnv("OPERATOR_MANAGED_USAGE_ALLOWANCE", "0");
    await reset();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await reset();
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("builds owner-only retryable multipart exports with source bytes, hashes, and secret omissions", async () => {
    const { owner, workspace, project } = await fixture();
    const outsider = await createUser("ga-outsider@example.test", "Outsider");
    const admin = await createUser("ga-admin@example.test", "Admin");
    await db.insert(memberships).values({
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: admin.userId,
      role: "admin",
    });
    const content = Buffer.from("signed commercial source\n", "utf8");
    await db.insert(commercialEvidenceSources).values({
      id: randomUUID(),
      projectId: project.id,
      idempotencyKey: randomUUID(),
      kind: "pasted_text",
      name: "statement-of-work.txt",
      mediaType: "text/plain",
      byteSize: content.length,
      contentSha256: createHash("sha256").update(content).digest("hex"),
      originalContent: content,
      extractedText: content.toString("utf8"),
      parseState: "ready",
      createdByUserId: owner.userId,
    });
    await db.insert(workspaceInvitations).values({
      id: randomUUID(),
      workspaceId: workspace.id,
      email: "pending@example.test",
      role: "member",
      state: "pending",
      tokenHash: createHash("sha256")
        .update("never-export-this-token")
        .digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
      invitedByUserId: owner.userId,
    });

    await expect(
      createWorkspaceExport(outsider, workspace.id),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      createWorkspaceExport(admin, workspace.id),
    ).rejects.toMatchObject({
      code: "forbidden",
    });

    const created = await createWorkspaceExport(owner, workspace.id);
    expect(created.state).toBe("ready");
    expect(created.expired).toBe(false);
    expect(created.parts.length).toBeGreaterThan(0);
    expect(
      created.parts.every((part) => part.byteSize < 15 * 1024 * 1024),
    ).toBe(true);

    const first = await downloadWorkspaceExportPart(
      owner,
      workspace.id,
      created.id,
      1,
    );
    const retried = await downloadWorkspaceExportPart(
      owner,
      workspace.id,
      created.id,
      1,
    );
    expect(retried.artifact.equals(first.artifact)).toBe(true);
    expect(createHash("sha256").update(first.artifact).digest("hex")).toBe(
      first.sha256,
    );
    const archive = gunzipSync(first.artifact).toString("utf8");
    expect(archive).toContain("scopedelta-operational-export");
    expect(archive).toContain("statement-of-work.txt");
    expect(archive).toContain("signed commercial source");
    expect(archive).toContain("work_item_comment_revisions");
    expect(archive).toContain("commercial_baseline_version_sources");
    expect(archive).toContain("migration_source_objects");
    expect(archive).not.toContain("never-export-this-token");
    expect(archive).not.toContain(outsider.email);
    await expect(
      getWorkspaceExport(outsider, workspace.id, created.id),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("serializes operator lifecycle transitions and records non-destructive processed evidence", async () => {
    const { owner, workspace, project } = await fixture();
    const exported = await createWorkspaceExport(owner, workspace.id);
    const request = await requestWorkspaceLifecycle(owner, workspace.id, {
      intent: "closure",
      confirmation: workspace.slug,
      exportAcknowledged: true,
      retentionAcknowledged: true,
    });
    const operatorId = randomUUID();
    const starts = await Promise.allSettled([
      processWorkspaceLifecycle({
        operatorId,
        workspaceId: workspace.id,
        requestId: request.id,
        action: "start-review",
      }),
      processWorkspaceLifecycle({
        operatorId,
        workspaceId: workspace.id,
        requestId: request.id,
        action: "start-review",
      }),
    ]);
    expect(
      starts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      starts.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const blockingJobId = randomUUID();
    await db.insert(aiJobs).values({
      id: blockingJobId,
      workspaceId: workspace.id,
      projectId: project.id,
      createdByUserId: owner.userId,
      kind: "delivery_risk_brief",
      status: "queued",
      idempotencyKey: randomUUID(),
      promptVersion: "ga-v1",
      contextSnapshot: {},
      evidenceMap: {},
      contextFingerprint: "ga-blocker",
      provider: "fake",
      model: "fake",
      providerBaseUrl: "http://127.0.0.1",
      executionConfigFingerprint: "ga-config",
    });
    await expect(
      processWorkspaceLifecycle({
        operatorId,
        workspaceId: workspace.id,
        requestId: request.id,
        action: "process",
      }),
    ).resolves.toMatchObject({
      state: "blocked",
      blockerCodes: ["ai_work_in_flight"],
      destructiveEffectsApplied: false,
    });
    await db.delete(aiJobs).where(eq(aiJobs.id, blockingJobId));
    await processWorkspaceLifecycle({
      operatorId,
      workspaceId: workspace.id,
      requestId: request.id,
      action: "start-review",
    });
    const processed = await processWorkspaceLifecycle({
      operatorId,
      workspaceId: workspace.id,
      requestId: request.id,
      action: "process",
    });
    expect(processed).toMatchObject({
      state: "processed",
      exportId: exported.id,
      blockerCodes: [],
      destructiveEffectsApplied: false,
    });
    expect(
      await db.select().from(workspaces).where(eq(workspaces.id, workspace.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(memberships)
        .where(eq(memberships.workspaceId, workspace.id)),
    ).not.toHaveLength(0);
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorId, operatorId));
    expect(events.map((event) => event.actorType)).toEqual([
      "operator",
      "operator",
      "operator",
      "operator",
    ]);
    expect(JSON.stringify(events)).not.toContain(owner.email);
    await expect(
      processWorkspaceLifecycle({
        operatorId,
        workspaceId: workspace.id,
        requestId: request.id,
        action: "purge",
      }),
    ).rejects.toMatchObject({ code: PHYSICAL_PURGE_ERROR });

    const cancelable = await requestWorkspaceLifecycle(owner, workspace.id, {
      intent: "deletion",
      confirmation: workspace.slug,
      exportAcknowledged: true,
      retentionAcknowledged: true,
    });
    await processWorkspaceLifecycle({
      operatorId,
      workspaceId: workspace.id,
      requestId: cancelable.id,
      action: "start-review",
    });
    await expect(
      cancelWorkspaceLifecycleRequest(owner, workspace.id, cancelable.id),
    ).resolves.toMatchObject({ state: "canceled" });
  });

  it("reconciles expired AI reservations and sends deduplicated content-free operator evidence", async () => {
    const { owner, workspace, project } = await fixture();
    const jobId = randomUUID();
    const usageId = randomUUID();
    await db.insert(managedUsageRecords).values({
      id: usageId,
      workspaceId: workspace.id,
      metric: "ai_job_start",
      state: "reserved",
      periodStartsAt: new Date(Date.now() - 60_000),
      periodEndsAt: new Date(Date.now() + 60_000),
      unitsReserved: 1,
      sourceType: "ai_job",
      sourceId: jobId,
      idempotencyKey: randomUUID(),
    });
    await db.insert(aiJobs).values({
      id: jobId,
      workspaceId: workspace.id,
      projectId: project.id,
      createdByUserId: owner.userId,
      kind: "delivery_risk_brief",
      status: "running",
      idempotencyKey: randomUUID(),
      promptVersion: "ga-v1",
      contextSnapshot: {},
      evidenceMap: {},
      contextFingerprint: "ga-context",
      provider: "fake",
      model: "fake",
      providerBaseUrl: "http://127.0.0.1",
      executionConfigFingerprint: "ga-config",
      leaseOwner: "abandoned-worker",
      leaseExpiresAt: new Date(Date.now() - 60_000),
    });
    await db.insert(aiJobAttempts).values({
      id: randomUUID(),
      jobId,
      attemptNumber: 1,
      status: "running",
      provider: "fake",
      model: "fake",
      providerBaseUrl: "http://127.0.0.1",
      executionConfigFingerprint: "ga-config",
      managedUsageRecordId: usageId,
    });
    const recovery = await reconcileOperationalRecovery();
    expect(recovery.expiredAiJobsRecovered).toBe(1);
    expect(
      (await db.select().from(aiJobs).where(eq(aiJobs.id, jobId)))[0],
    ).toMatchObject({ status: "failed", errorCode: "ai_lease_expired" });
    expect(
      (
        await db
          .select()
          .from(managedUsageRecords)
          .where(eq(managedUsageRecords.id, usageId))
      )[0],
    ).toMatchObject({ state: "released", unitsConsumed: 0 });

    const localOnly = await runOperationsAlerts();
    expect(localOnly).toMatchObject({
      transport: "disabled",
      outboundAttempted: false,
    });
    vi.stubEnv("OPERATOR_ALERT_TO", "operator@example.test");
    vi.stubEnv("SMTP_HOST", "127.0.0.1");
    vi.stubEnv("SMTP_PORT", "1025");
    vi.stubEnv("SMTP_SECURE", "false");
    vi.stubEnv("SMTP_FROM", "ScopeDelta Test <no-reply@example.test>");
    await db.insert(operatorAlertDeliveries).values({
      id: randomUUID(),
      digestKey: "a".repeat(64),
      recipientHash: "b".repeat(64),
      state: "claimed",
      incidentCount: 1,
      claimedAt: new Date(Date.now() - 20 * 60_000),
    });
    vi.stubEnv("SMTP_PORT", "1");
    const failed = await runOperationsAlerts();
    expect(failed).toMatchObject({
      outboundAttempted: true,
      delivered: false,
      staleClaimsRecovered: 1,
      errorCode: "smtp_delivery_failed",
    });
    vi.stubEnv("SMTP_PORT", "1025");
    const first = await runOperationsAlerts();
    expect(first).toMatchObject({ outboundAttempted: true, delivered: true });
    const sent = await db
      .select()
      .from(operatorAlertDeliveries)
      .where(eq(operatorAlertDeliveries.state, "sent"));
    expect(sent).toHaveLength(1);
    const incidents = await db.select().from(operatorIncidents);
    expect(
      incidents.some((incident) => incident.signalType === "ai_attention"),
    ).toBe(true);
    expect(JSON.stringify(incidents)).not.toContain(owner.email);
    const mailpit = (await (
      await fetch("http://127.0.0.1:8025/api/v1/messages")
    ).json()) as { messages: Array<{ ID: string; Subject: string }> };
    const digest = mailpit.messages.find(
      (message) => message.Subject === "ScopeDelta operator attention digest",
    );
    expect(digest).toBeDefined();
    const deliveredMessage = (await (
      await fetch(`http://127.0.0.1:8025/api/v1/message/${digest!.ID}`)
    ).json()) as { Text: string };
    expect(deliveredMessage.Text).not.toContain(owner.email);
    expect(deliveredMessage.Text).not.toContain("GA Boundary");
    expect(deliveredMessage.Text).not.toContain(workspace.id);
    const second = await runOperationsAlerts();
    expect(second).toMatchObject({ outboundAttempted: false });

    await db.delete(aiJobs).where(eq(aiJobs.id, jobId));
    await runOperationsAlerts();
    expect(
      (
        await db
          .select()
          .from(operatorIncidents)
          .where(eq(operatorIncidents.signalType, "ai_attention"))
      )[0],
    ).toMatchObject({ state: "resolved" });
  });
});
