import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, getPool } from "@/db";
import {
  aiActionExecutions,
  aiActionRecords,
  aiJobAttempts,
  auditEvents,
  clientProjectParticipants,
  commercialRequestClarifications,
  commercialRequests,
  memberships,
  projectMemberships,
  users,
  workItems,
} from "@/db/schema";
import { createCommercialRequest } from "@/server/commercial-change-control";
import { createClient, createProject } from "@/server/delivery";
import { createWorkspace } from "@/server/workspaces";

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
              findings: [
                {
                  title: "Fabricated",
                  detail: "This evidence key was not server-issued.",
                  evidenceKeys: ["ev_fabricated_999"],
                },
              ],
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
    summary: "The export request is not yet commercially decided.",
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
    draftDecision: "Confirm commercial treatment before scheduling.",
    clientSafeWording: "We are reviewing the requested export workflow.",
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
