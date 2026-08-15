import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, getPool } from "@/db";
import {
  aiActionExecutions,
  aiActionRecords,
  aiJobAttempts,
  aiJobs,
  auditEvents,
  clientProjectParticipants,
  commercialBaselines,
  commercialBaselineVersions,
  commercialEvidenceSources,
  commercialRequestClarifications,
  commercialRequests,
  commercialScopeItemRevisions,
  commercialScopeItems,
  memberships,
  projectMemberships,
  users,
  workItems,
} from "@/db/schema";
import { createCommercialRequest } from "@/server/commercial-change-control";
import { createClient, createProject } from "@/server/delivery";
import { createWorkspace } from "@/server/workspaces";

import { assembleAiContext } from "./context";
import {
  cancelAiJob,
  confirmAiActions,
  createAiJob,
  getAiJob,
  previewAiActions,
  retryAiJob,
  runAiJob,
} from "./jobs";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/scopedelta_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error(
    "Integration tests require a dedicated scopedelta_test database.",
  );
}

const db = getDb();
const originalEnv = { ...process.env };

describe("durable AI delivery intelligence", () => {
  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.AI_ENABLED = "true";
    process.env.AI_PROVIDER = "ollama";
    process.env.AI_MODEL = "fixture-model";
    process.env.OLLAMA_BASE_URL = "http://ollama.test";
    await db.execute(
      sql`truncate table workspaces, users, action_rate_limits cascade`,
    );
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    await getPool().end();
  });

  it("persists idempotent jobs, immutable usage attempts, and explicit retry/cancel", async () => {
    const fixture = await createFixture();
    const idempotencyKey = randomUUID();
    const input = {
      idempotencyKey,
      target: {
        kind: "scope_change_analysis" as const,
        requestId: fixture.request.id,
      },
    };
    const first = await createAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      input,
    );
    const duplicate = await createAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      input,
    );
    expect(duplicate.id).toBe(first.id);

    await cancelAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      first.id,
    );
    const retried = await retryAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      first.id,
    );
    expect(retried.status).toBe("queued");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          message: { content: JSON.stringify(scopeResult()) },
          prompt_eval_count: 120,
          eval_count: 48,
        }),
      ),
    );
    await runAiJob(first.id);
    const completed = await getAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      first.id,
    );
    expect(completed).toMatchObject({ status: "succeeded", stale: false });
    expect(completed.attempts).toEqual([
      expect.objectContaining({
        attemptNumber: 1,
        status: "succeeded",
        inputTokens: 120,
        outputTokens: 48,
      }),
    ]);
    const storedAttempts = await db
      .select()
      .from(aiJobAttempts)
      .where(eq(aiJobAttempts.jobId, first.id));
    expect(storedAttempts).toHaveLength(1);
  });

  it("fails closed when execution configuration changes and resnapshots only on retry", async () => {
    const fixture = await createFixture();
    const job = await createAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        target: {
          kind: "scope_change_analysis",
          requestId: fixture.request.id,
        },
      },
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "review-model-b";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "http://openai.test/v1";
    await runAiJob(job.id);
    const firstFailure = await getAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      job.id,
    );
    expect(firstFailure).toMatchObject({
      status: "failed",
      provider: "ollama",
      model: "fixture-model",
      errorCode: "ai_execution_config_changed",
      attempts: [],
    });
    expect(fetcher).not.toHaveBeenCalled();

    const retried = await retryAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      job.id,
    );
    expect(retried).toMatchObject({
      status: "queued",
      provider: "openai",
      model: "review-model-b",
    });

    process.env.AI_MODEL = "review-model-c";
    await runAiJob(job.id);
    await expect(
      getAiJob(fixture.owner, fixture.workspace.id, fixture.project.id, job.id),
    ).resolves.toMatchObject({
      status: "failed",
      provider: "openai",
      model: "review-model-b",
      errorCode: "ai_execution_config_changed",
      attempts: [],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps leases beyond the provider timeout and closes expired attempts", async () => {
    const fixture = await createFixture();
    process.env.AI_TIMEOUT_MS = "120000";
    const durableJob = await createAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        target: {
          kind: "scope_change_analysis",
          requestId: fixture.request.id,
        },
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        const rows = await db
          .select({
            startedAt: aiJobs.startedAt,
            leaseExpiresAt: aiJobs.leaseExpiresAt,
          })
          .from(aiJobs)
          .where(eq(aiJobs.id, durableJob.id));
        expect(
          rows[0]!.leaseExpiresAt!.getTime() - rows[0]!.startedAt!.getTime(),
        ).toBeGreaterThanOrEqual(150_000);
        return Response.json({
          message: { content: JSON.stringify(scopeResult()) },
        });
      }),
    );
    await runAiJob(durableJob.id);
    await expect(
      getAiJob(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        durableJob.id,
      ),
    ).resolves.toMatchObject({ status: "succeeded" });

    const expiredJob = await createAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        target: {
          kind: "scope_change_analysis",
          requestId: fixture.request.id,
        },
      },
    );
    const attemptId = randomUUID();
    const expiredAt = new Date(Date.now() - 1_000);
    await db
      .update(aiJobs)
      .set({
        status: "running",
        leaseOwner: "abandoned-runner",
        leaseExpiresAt: expiredAt,
        startedAt: new Date(expiredAt.getTime() - 120_000),
      })
      .where(eq(aiJobs.id, expiredJob.id));
    await db.insert(aiJobAttempts).values({
      id: attemptId,
      jobId: expiredJob.id,
      attemptNumber: 1,
      provider: expiredJob.provider,
      model: expiredJob.model,
    });
    const expired = await getAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      expiredJob.id,
    );
    expect(expired).toMatchObject({
      status: "failed",
      errorCode: "ai_job_lease_expired",
      attempts: [
        expect.objectContaining({
          id: attemptId,
          status: "failed",
          errorCode: "ai_job_lease_expired",
        }),
      ],
    });
    expect(expired.attempts[0]?.completedAt).toBeInstanceOf(Date);
  });

  it("assembles only the latest revision from the effective baseline without raw IDs", async () => {
    const fixture = await createFixture();
    const sourceId = randomUUID();
    const baselineId = randomUUID();
    const originalVersionId = randomUUID();
    const effectiveVersionId = randomUUID();
    const originalItemId = randomUUID();
    const effectiveItemId = randomUUID();
    const effectiveAt = new Date("2026-08-01T08:00:00.000Z");
    const amendedAt = new Date("2026-08-10T08:00:00.000Z");
    await db.insert(commercialEvidenceSources).values({
      id: sourceId,
      projectId: fixture.project.id,
      idempotencyKey: randomUUID(),
      kind: "pasted_text",
      name: "Synthetic scope source",
      mediaType: "text/plain",
      byteSize: 5,
      contentSha256: "a".repeat(64),
      originalContent: Buffer.from("scope"),
      extractedText: "Synthetic scope evidence.",
      parseState: "ready",
      createdByUserId: fixture.owner.userId,
    });
    await db.insert(commercialBaselines).values({
      id: baselineId,
      projectId: fixture.project.id,
      createdByUserId: fixture.owner.userId,
    });
    await db.insert(commercialBaselineVersions).values([
      {
        id: originalVersionId,
        projectId: fixture.project.id,
        baselineId,
        sourceId,
        versionNumber: 1,
        label: "Original baseline",
        state: "superseded",
        effectiveAt,
        effectiveByUserId: fixture.owner.userId,
        supersededAt: amendedAt,
        createdByUserId: fixture.owner.userId,
      },
      {
        id: effectiveVersionId,
        projectId: fixture.project.id,
        baselineId,
        sourceId,
        previousVersionId: originalVersionId,
        versionNumber: 2,
        label: "Amended baseline",
        state: "effective",
        effectiveAt: amendedAt,
        effectiveByUserId: fixture.owner.userId,
        createdByUserId: fixture.owner.userId,
      },
    ]);
    await db.insert(commercialScopeItems).values([
      {
        id: originalItemId,
        projectId: fixture.project.id,
        baselineVersionId: originalVersionId,
        materialBasisScopeItemId: originalItemId,
        idempotencyKey: randomUUID(),
        createdByUserId: fixture.owner.userId,
      },
      {
        id: effectiveItemId,
        projectId: fixture.project.id,
        baselineVersionId: effectiveVersionId,
        materialBasisScopeItemId: originalItemId,
        idempotencyKey: randomUUID(),
        createdByUserId: fixture.owner.userId,
      },
    ]);
    await db.insert(commercialScopeItemRevisions).values([
      {
        id: randomUUID(),
        projectId: fixture.project.id,
        scopeItemId: originalItemId,
        idempotencyKey: randomUUID(),
        revisionNumber: 1,
        kind: "requirement",
        title: "Superseded requirement",
        details: "This belongs to baseline version one.",
        createdByUserId: fixture.owner.userId,
      },
      {
        id: randomUUID(),
        projectId: fixture.project.id,
        scopeItemId: effectiveItemId,
        idempotencyKey: randomUUID(),
        revisionNumber: 1,
        kind: "requirement",
        title: "Earlier amended wording",
        details: "This revision is no longer current.",
        createdByUserId: fixture.owner.userId,
      },
      {
        id: randomUUID(),
        projectId: fixture.project.id,
        scopeItemId: effectiveItemId,
        idempotencyKey: randomUUID(),
        revisionNumber: 2,
        kind: "requirement",
        title: "Current amended requirement",
        details: "This is the current effective wording.",
        createdByUserId: fixture.owner.userId,
      },
    ]);

    const context = await assembleAiContext(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        kind: "scope_change_analysis",
        requestId: fixture.request.id,
      },
    );
    const baselines = context.snapshot.facts.filter(
      (fact) => fact.type === "baseline",
    );
    const scope = context.snapshot.facts.filter(
      (fact) => fact.type === "scope",
    );
    expect(baselines).toEqual([
      expect.objectContaining({
        label: "Amended baseline",
        content: expect.objectContaining({
          versionNumber: 2,
          state: "effective",
        }),
      }),
    ]);
    expect(scope).toEqual([
      expect.objectContaining({
        label: "Current amended requirement",
        content: expect.objectContaining({
          title: "Current amended requirement",
          revisionNumber: 2,
          revisionState: "current",
          baseline: expect.objectContaining({
            label: "Amended baseline",
            versionNumber: 2,
            state: "effective",
          }),
        }),
      }),
    ]);
    const serialized = JSON.stringify(context.snapshot);
    expect(serialized).not.toContain(originalVersionId);
    expect(serialized).not.toContain(effectiveVersionId);
    expect(serialized).not.toContain("Earlier amended wording");
    expect(serialized).not.toContain("Superseded requirement");
  });

  it("atomically confirms bounded work and clarification drafts with both authorities", async () => {
    const fixture = await createFixture();
    const job = await completedScopeJob(fixture);
    const selection = {
      idempotencyKey: randomUUID(),
      contextFingerprint: job.contextFingerprint,
      workCandidateKeys: ["work_export"],
      clarificationCandidateKeys: ["question_format"],
    };
    const preview = await previewAiActions(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      job.id,
      selection,
    );
    expect(preview.effects).toMatchObject({
      workStatus: "backlog",
      workPurpose: "unclassified",
      commerciallyLinked: false,
      requestAndClientStateChanged: false,
    });

    const first = await confirmAiActions(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      job.id,
      selection,
    );
    const duplicate = await confirmAiActions(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      job.id,
      selection,
    );
    expect(duplicate.id).toBe(first.id);

    const [
      createdWork,
      clarifications,
      executions,
      mappings,
      requestRows,
      actors,
    ] = await Promise.all([
      db
        .select()
        .from(workItems)
        .where(eq(workItems.projectId, fixture.project.id)),
      db
        .select()
        .from(commercialRequestClarifications)
        .where(
          eq(commercialRequestClarifications.requestId, fixture.request.id),
        ),
      db
        .select()
        .from(aiActionExecutions)
        .where(eq(aiActionExecutions.jobId, job.id)),
      db
        .select()
        .from(aiActionRecords)
        .where(eq(aiActionRecords.executionId, first.id)),
      db
        .select({ state: commercialRequests.state })
        .from(commercialRequests)
        .where(eq(commercialRequests.id, fixture.request.id)),
      db
        .select({
          actorType: auditEvents.actorType,
          eventType: auditEvents.eventType,
        })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.workspaceId, fixture.workspace.id),
            sql`${auditEvents.eventType} like 'ai_%'`,
          ),
        ),
    ]);
    expect(createdWork).toEqual([
      expect.objectContaining({
        title: "Build CSV export",
        status: "backlog",
        purpose: "unclassified",
        assigneeUserId: null,
        milestoneId: null,
        cycleId: null,
      }),
    ]);
    expect(clarifications).toEqual([
      expect.objectContaining({
        status: "draft",
        question: "Which export format is required?",
      }),
    ]);
    expect(executions).toHaveLength(1);
    expect(mappings).toHaveLength(2);
    expect(requestRows[0]?.state).toBe("open");
    expect(new Set(actors.map((item) => item.actorType))).toEqual(
      new Set(["human", "ai_agent"]),
    );
  });

  it("rejects stale confirmation after request context changes", async () => {
    const fixture = await createFixture();
    const job = await completedScopeJob(fixture);
    await db
      .update(commercialRequests)
      .set({ title: "Changed request title", updatedAt: new Date() })
      .where(eq(commercialRequests.id, fixture.request.id));
    await expect(
      previewAiActions(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        job.id,
        {
          idempotencyKey: randomUUID(),
          contextFingerprint: job.contextFingerprint,
          workCandidateKeys: ["work_export"],
          clarificationCandidateKeys: [],
        },
      ),
    ).rejects.toMatchObject({ code: "ai_context_stale", status: 409 });
    expect(await db.select().from(workItems)).toHaveLength(0);
  });

  it("rejects unauthorized and cross-project context requests", async () => {
    const fixture = await createFixture();
    const member = {
      userId: randomUUID(),
      email: "ai-member@example.test",
    };
    await db.insert(users).values({
      id: member.userId,
      email: member.email,
      name: "AI member",
      emailVerified: true,
    });
    await db.insert(memberships).values({
      workspaceId: fixture.workspace.id,
      userId: member.userId,
      role: "member",
    });
    await db.insert(projectMemberships).values({
      projectId: fixture.project.id,
      workspaceId: fixture.workspace.id,
      userId: member.userId,
      addedByUserId: fixture.owner.userId,
    });
    await expect(
      createAiJob(member, fixture.workspace.id, fixture.project.id, {
        idempotencyKey: randomUUID(),
        target: {
          kind: "scope_change_analysis",
          requestId: fixture.request.id,
        },
      }),
    ).rejects.toMatchObject({ status: 403 });

    const participant = {
      userId: randomUUID(),
      email: "ai-client@example.test",
    };
    await db.insert(users).values({
      id: participant.userId,
      email: participant.email,
      name: "AI client participant",
      emailVerified: true,
    });
    await db.insert(clientProjectParticipants).values({
      projectId: fixture.project.id,
      userId: participant.userId,
      invitedEmail: participant.email,
      role: "collaborator",
      createdByUserId: fixture.owner.userId,
    });
    await expect(
      createAiJob(participant, fixture.workspace.id, fixture.project.id, {
        idempotencyKey: randomUUID(),
        target: {
          kind: "work_context_qa_pack",
          workItemId: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ status: 404 });

    const otherProject = await createProject(
      fixture.owner,
      fixture.workspace.id,
      {
        clientId: fixture.client.id,
        key: "AIY",
        name: "Other AI Project",
        summary: null,
        leadUserId: fixture.owner.userId,
        startDate: null,
        targetDate: null,
      },
    );
    const otherRequest = await createCommercialRequest(
      fixture.owner,
      fixture.workspace.id,
      otherProject.id,
      {
        idempotencyKey: randomUUID(),
        title: "Other project request",
        requestText: "This request belongs to another project.",
        externalRequester: null,
        receivedAt: "2026-08-15T08:00:00.000Z",
        scopeItemIds: [],
        anchors: [],
        impact: null,
      },
    );
    await expect(
      createAiJob(fixture.owner, fixture.workspace.id, fixture.project.id, {
        idempotencyKey: randomUUID(),
        target: {
          kind: "scope_change_analysis",
          requestId: otherRequest.id,
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("fails safely for fabricated evidence and context changed during inference", async () => {
    const fixture = await createFixture();
    const fabricatedJob = await createAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        target: {
          kind: "scope_change_analysis",
          requestId: fixture.request.id,
        },
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          message: {
            content: JSON.stringify({
              ...scopeResult(),
              summary: {
                text: "This summary cites evidence the server did not issue.",
                evidenceKeys: ["ev_fabricated_999"],
              },
            }),
          },
        }),
      ),
    );
    await runAiJob(fabricatedJob.id);
    await expect(
      getAiJob(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        fabricatedJob.id,
      ),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "provider_malformed_response",
    });

    const uncitedJob = await createAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        target: {
          kind: "scope_change_analysis",
          requestId: fixture.request.id,
        },
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          message: {
            content: JSON.stringify({
              ...scopeResult(),
              summary: "This material synthesis has no citations.",
            }),
          },
        }),
      ),
    );
    await runAiJob(uncitedJob.id);
    await expect(
      getAiJob(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        uncitedJob.id,
      ),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "provider_malformed_response",
    });

    const changingJob = await createAiJob(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        target: {
          kind: "scope_change_analysis",
          requestId: fixture.request.id,
        },
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        await db
          .update(commercialRequests)
          .set({ title: "Changed during inference", updatedAt: new Date() })
          .where(eq(commercialRequests.id, fixture.request.id));
        return Response.json({
          message: { content: JSON.stringify(scopeResult()) },
        });
      }),
    );
    await runAiJob(changingJob.id);
    await expect(
      getAiJob(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        changingJob.id,
      ),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "ai_context_changed",
    });
  });
});

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture() {
  const userId = randomUUID();
  const owner = { userId, email: "ai-owner@example.test" };
  await db.insert(users).values({
    id: userId,
    email: owner.email,
    name: "AI owner",
    emailVerified: true,
  });
  const workspace = await createWorkspace(owner, { name: "AI Workspace" });
  const client = await createClient(owner, workspace.id, {
    name: "AI Client",
    internalReference: null,
    summary: null,
  });
  const project = await createProject(owner, workspace.id, {
    clientId: client.id,
    key: "AIX",
    name: "AI Project",
    summary: null,
    leadUserId: owner.userId,
    startDate: null,
    targetDate: null,
  });
  const request = await createCommercialRequest(
    owner,
    workspace.id,
    project.id,
    {
      idempotencyKey: randomUUID(),
      title: "Add export workflow",
      requestText: "The sponsor asked for downloadable delivery data.",
      externalRequester: "Sponsor",
      receivedAt: "2026-08-15T08:00:00.000Z",
      scopeItemIds: [],
      anchors: [],
      impact: null,
    },
  );
  return { owner, workspace, client, project, request };
}

async function completedScopeJob(fixture: Fixture) {
  const job = await createAiJob(
    fixture.owner,
    fixture.workspace.id,
    fixture.project.id,
    {
      idempotencyKey: randomUUID(),
      target: {
        kind: "scope_change_analysis",
        requestId: fixture.request.id,
      },
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        message: { content: JSON.stringify(scopeResult()) },
        prompt_eval_count: 120,
        eval_count: 48,
      }),
    ),
  );
  await runAiJob(job.id);
  return getAiJob(
    fixture.owner,
    fixture.workspace.id,
    fixture.project.id,
    job.id,
  );
}

function scopeResult() {
  return {
    summary: {
      text: "The export request is not yet commercially decided.",
      evidenceKeys: ["ev_request_001"],
    },
    findings: [
      {
        title: "New requested capability",
        detail: "The sponsor requested downloadable delivery data.",
        evidenceKeys: ["ev_request_001"],
      },
    ],
    uncertainties: [],
    conflicts: [],
    missingQuestions: ["Which format is required?"],
    draftDecision: {
      text: "Confirm commercial treatment before scheduling.",
      evidenceKeys: ["ev_request_001"],
    },
    clientSafeWording: {
      text: "We are reviewing the requested export workflow.",
      evidenceKeys: ["ev_request_001"],
    },
    workCandidates: [
      {
        candidateKey: "work_export",
        title: "Build CSV export",
        description: "Add a bounded CSV export workflow.",
        acceptanceCriteria: "Authorized users can download valid CSV.",
        evidenceKeys: ["ev_request_001"],
      },
    ],
    clarificationCandidates: [
      {
        candidateKey: "question_format",
        question: "Which export format is required?",
        evidenceKeys: ["ev_request_001"],
      },
    ],
  };
}
