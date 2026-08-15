import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, gt, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  aiActionExecutions,
  aiActionRecords,
  aiJobAttempts,
  aiJobs,
  auditEvents,
  commercialRequestClarifications,
  commercialRequests,
  projects,
  workItems,
  workspaces,
  type AiJobKind,
} from "@/db/schema";
import {
  AI_PROMPT_VERSION,
  aiActionSelectionSchema,
  createAiJobSchema,
  resultSchemas,
  type AiJobResult,
  type AiJobTarget,
  type ScopeChangeAnalysisResult,
} from "@/lib/ai/contracts";
import {
  communityEntitlementPolicy,
  type EntitlementPolicy,
} from "@/lib/entitlements";
import { getAiConfig } from "@/lib/env";
import { notFound, PlatformError } from "@/lib/platform-errors";
import {
  assertProjectManager,
  assertWritableProject,
  getProjectAccess,
} from "@/server/delivery";
import type { UserActor } from "@/server/workspaces";

import {
  assembleAiContext,
  currentAiContextFingerprint,
  type AiContextSnapshot,
  type AiEvidence,
} from "./context";
import { AiProviderError, createAiProvider } from "./provider";

const MINIMUM_LEASE_DURATION_MS = 90_000;
const LEASE_TIMEOUT_GRACE_MS = 30_000;
const MAX_HISTORY = 50;
const LEASE_EXPIRED_MESSAGE =
  "The AI runner stopped before completing this attempt. Retry explicitly.";
const CONFIG_CHANGED_MESSAGE =
  "The configured AI provider or model changed after this job was queued. Retry explicitly to approve the current configuration.";

class AiJobExecutionError extends Error {
  constructor(
    readonly code:
      | "ai_context_changed"
      | "ai_evidence_unavailable"
      | "ai_execution_config_changed",
    message: string,
  ) {
    super(message);
  }
}

function targetFromJob(job: {
  kind: AiJobKind;
  requestId: string | null;
  milestoneId: string | null;
  workItemId: string | null;
}): AiJobTarget {
  if (job.kind === "scope_change_analysis" && job.requestId) {
    return { kind: job.kind, requestId: job.requestId };
  }
  if (job.kind === "delivery_risk_brief") {
    return { kind: job.kind, milestoneId: job.milestoneId || undefined };
  }
  if (job.kind === "work_context_qa_pack" && job.workItemId) {
    return { kind: job.kind, workItemId: job.workItemId };
  }
  throw new PlatformError(
    "ai_job_invalid",
    500,
    "The AI job target is invalid.",
  );
}

function assertJobAuthorization(
  kind: AiJobKind,
  access: Awaited<ReturnType<typeof getProjectAccess>>,
  actorUserId: string,
) {
  if (kind !== "work_context_qa_pack") {
    assertProjectManager(access, actorUserId);
  }
}

function jobPrompt(kind: AiJobKind, snapshot: AiContextSnapshot) {
  const shared = [
    "Use only the supplied evidence.",
    "Every claim that depends on project facts must cite one or more supplied evidence keys.",
    "Never invent record IDs, evidence keys, commercial authorization, acceptance, or completed work.",
    "State uncertainty and contradictions explicitly.",
  ].join(" ");
  const instruction =
    kind === "scope_change_analysis"
      ? "Analyze the requested scope change. Drafts are advisory and must not imply approval. Suggest at most five backlog work candidates and eight internal clarification questions."
      : kind === "delivery_risk_brief"
        ? "Interpret the server-authored delivery facts and recommend bounded actions. Do not restate interpretation as deterministic fact."
        : "Create an implementation context and QA pack, including contradictions, missing information, and evidence-grounded test scenarios.";
  return {
    system: `${shared} ${instruction}`,
    prompt: JSON.stringify(snapshot),
  };
}

function validateEvidenceKeys(
  value: unknown,
  evidenceMap: Record<string, AiEvidence>,
) {
  const visit = (item: unknown) => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(
      item as Record<string, unknown>,
    )) {
      if (key === "evidenceKeys" && Array.isArray(child)) {
        if (
          child.some((evidenceKey) => !(String(evidenceKey) in evidenceMap))
        ) {
          throw new AiProviderError(
            "provider_malformed_response",
            "The AI provider cited unavailable evidence.",
          );
        }
      } else {
        visit(child);
      }
    }
  };
  visit(value);
}

function publicJob<T extends Record<string, unknown>>(job: T) {
  return {
    ...job,
    contextSnapshot: job.contextSnapshot as AiContextSnapshot,
    evidenceMap: job.evidenceMap as Record<string, AiEvidence>,
  };
}

async function expireAbandonedJobs() {
  const now = new Date();
  await getDb().transaction(async (transaction) => {
    const expired = await transaction
      .update(aiJobs)
      .set({
        status: "failed",
        errorCode: "ai_job_lease_expired",
        errorMessage: LEASE_EXPIRED_MESSAGE,
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(aiJobs.status, "running"),
          sql`${aiJobs.leaseExpiresAt} < ${now}`,
        ),
      )
      .returning({ id: aiJobs.id });
    if (!expired.length) return;
    await transaction
      .update(aiJobAttempts)
      .set({
        status: "failed",
        errorCode: "ai_job_lease_expired",
        errorMessage: LEASE_EXPIRED_MESSAGE,
        completedAt: now,
      })
      .where(
        and(
          inArray(
            aiJobAttempts.jobId,
            expired.map((job) => job.id),
          ),
          eq(aiJobAttempts.status, "running"),
        ),
      );
  });
}

export async function createAiJob(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  rawInput: unknown,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const input = createAiJobSchema.parse(rawInput);
  const config = getAiConfig();
  if (!config.enabled) {
    throw new PlatformError(
      "ai_disabled",
      503,
      "AI delivery intelligence is not enabled for this deployment.",
    );
  }
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  assertJobAuthorization(input.target.kind, access, actor.userId);
  await entitlements.assertAllowed("ai.job.run", {
    userId: actor.userId,
    workspaceId,
  });
  const context = await assembleAiContext(
    actor,
    workspaceId,
    projectId,
    input.target,
  );
  const db = getDb();
  let id = "";
  await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select ${workspaces.id} from ${workspaces} where ${workspaces.id} = ${workspaceId} for update`,
    );
    const existing = await transaction
      .select({ id: aiJobs.id })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.projectId, projectId),
          eq(aiJobs.createdByUserId, actor.userId),
          eq(aiJobs.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) {
      id = existing[0].id;
      return;
    }
    const hourAgo = new Date(Date.now() - 60 * 60 * 1_000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const activeUser = await transaction
      .select({ total: count() })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.createdByUserId, actor.userId),
          inArray(aiJobs.status, ["queued", "running"]),
        ),
      );
    const activeWorkspace = await transaction
      .select({ total: count() })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.workspaceId, workspaceId),
          inArray(aiJobs.status, ["queued", "running"]),
        ),
      );
    const hourlyUser = await transaction
      .select({ total: count() })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.createdByUserId, actor.userId),
          gt(aiJobs.createdAt, hourAgo),
        ),
      );
    const dailyWorkspace = await transaction
      .select({ total: count() })
      .from(aiJobs)
      .where(
        and(eq(aiJobs.workspaceId, workspaceId), gt(aiJobs.createdAt, dayAgo)),
      );
    const hourlyUserRetries = await transaction
      .select({ total: count() })
      .from(aiJobAttempts)
      .innerJoin(aiJobs, eq(aiJobAttempts.jobId, aiJobs.id))
      .where(
        and(
          eq(aiJobs.createdByUserId, actor.userId),
          gt(aiJobAttempts.attemptNumber, 1),
          gt(aiJobAttempts.startedAt, hourAgo),
        ),
      );
    const dailyWorkspaceRetries = await transaction
      .select({ total: count() })
      .from(aiJobAttempts)
      .innerJoin(aiJobs, eq(aiJobAttempts.jobId, aiJobs.id))
      .where(
        and(
          eq(aiJobs.workspaceId, workspaceId),
          gt(aiJobAttempts.attemptNumber, 1),
          gt(aiJobAttempts.startedAt, dayAgo),
        ),
      );
    if ((activeUser[0]?.total ?? 0) >= config.runningPerUser) {
      throw new PlatformError(
        "ai_user_concurrency_limit",
        429,
        "Finish or cancel your active AI job before starting another.",
      );
    }
    if ((activeWorkspace[0]?.total ?? 0) >= config.runningPerWorkspace) {
      throw new PlatformError(
        "ai_workspace_concurrency_limit",
        429,
        "This workspace has reached its active AI job limit.",
      );
    }
    if (
      (hourlyUser[0]?.total ?? 0) + (hourlyUserRetries[0]?.total ?? 0) >=
      config.startsPerUserHour
    ) {
      throw new PlatformError(
        "ai_user_rate_limit",
        429,
        "You have reached the hourly AI job limit.",
      );
    }
    if (
      (dailyWorkspace[0]?.total ?? 0) +
        (dailyWorkspaceRetries[0]?.total ?? 0) >=
      config.startsPerWorkspaceDay
    ) {
      throw new PlatformError(
        "ai_workspace_rate_limit",
        429,
        "This workspace has reached its daily AI job limit.",
      );
    }
    id = randomUUID();
    await transaction.insert(aiJobs).values({
      id,
      workspaceId,
      projectId,
      createdByUserId: actor.userId,
      kind: input.target.kind,
      idempotencyKey: input.idempotencyKey,
      requestId:
        input.target.kind === "scope_change_analysis"
          ? input.target.requestId
          : null,
      milestoneId:
        input.target.kind === "delivery_risk_brief"
          ? input.target.milestoneId || null
          : null,
      workItemId:
        input.target.kind === "work_context_qa_pack"
          ? input.target.workItemId
          : null,
      promptVersion: AI_PROMPT_VERSION,
      contextSnapshot: context.snapshot,
      evidenceMap: context.evidenceMap,
      contextFingerprint: context.fingerprint,
      provider: config.provider,
      model: config.model,
    });
    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "ai_job.created.v1",
      targetType: "ai_job",
      targetId: id,
      metadata: { projectId, kind: input.target.kind },
    });
  });
  return getAiJob(actor, workspaceId, projectId, id);
}

export async function listAiJobs(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  await expireAbandonedJobs();
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select()
    .from(aiJobs)
    .where(eq(aiJobs.projectId, projectId))
    .orderBy(desc(aiJobs.createdAt), desc(aiJobs.id))
    .limit(MAX_HISTORY);
  return rows
    .filter(
      (job) =>
        job.kind === "work_context_qa_pack" ||
        access.workspaceRole !== "member" ||
        access.leadUserId === actor.userId,
    )
    .map(publicJob);
}

export async function getAiJob(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  jobId: string,
) {
  await expireAbandonedJobs();
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select()
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.id, jobId),
        eq(aiJobs.workspaceId, workspaceId),
        eq(aiJobs.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  assertJobAuthorization(rows[0].kind, access, actor.userId);
  const attempts = await getDb()
    .select()
    .from(aiJobAttempts)
    .where(eq(aiJobAttempts.jobId, jobId))
    .orderBy(asc(aiJobAttempts.attemptNumber));
  let stale = false;
  if (rows[0].status === "succeeded") {
    try {
      stale =
        (await currentAiContextFingerprint(
          actor,
          workspaceId,
          projectId,
          targetFromJob(rows[0]),
        )) !== rows[0].contextFingerprint;
    } catch {
      stale = true;
    }
  }
  return { ...publicJob(rows[0]), attempts, stale };
}

export async function retryAiJob(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  jobId: string,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const config = getAiConfig();
  if (!config.enabled) {
    throw new PlatformError(
      "ai_disabled",
      503,
      "AI delivery intelligence is not enabled for this deployment.",
    );
  }
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  await entitlements.assertAllowed("ai.job.run", {
    userId: actor.userId,
    workspaceId,
  });
  const rows = await getDb()
    .select()
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.id, jobId),
        eq(aiJobs.workspaceId, workspaceId),
        eq(aiJobs.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  assertJobAuthorization(rows[0].kind, access, actor.userId);
  if (rows[0].status !== "failed" && rows[0].status !== "canceled") {
    throw new PlatformError(
      "ai_job_not_retryable",
      409,
      "Only failed or canceled AI jobs can be retried.",
    );
  }
  const context = await assembleAiContext(
    actor,
    workspaceId,
    projectId,
    targetFromJob(rows[0]),
  );
  await getDb().transaction(async (transaction) => {
    await transaction.execute(
      sql`select ${workspaces.id} from ${workspaces} where ${workspaces.id} = ${workspaceId} for update`,
    );
    const locked = await transaction
      .select({ status: aiJobs.status })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.id, jobId),
          eq(aiJobs.workspaceId, workspaceId),
          eq(aiJobs.projectId, projectId),
        ),
      )
      .limit(1);
    if (locked[0]?.status !== "failed" && locked[0]?.status !== "canceled") {
      throw new PlatformError(
        "ai_job_not_retryable",
        409,
        "Only failed or canceled AI jobs can be retried.",
      );
    }
    const hourAgo = new Date(Date.now() - 60 * 60 * 1_000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const activeUser = await transaction
      .select({ total: count() })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.createdByUserId, actor.userId),
          inArray(aiJobs.status, ["queued", "running"]),
        ),
      );
    const activeWorkspace = await transaction
      .select({ total: count() })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.workspaceId, workspaceId),
          inArray(aiJobs.status, ["queued", "running"]),
        ),
      );
    const hourlyUser = await transaction
      .select({ total: count() })
      .from(aiJobs)
      .where(
        and(
          eq(aiJobs.createdByUserId, actor.userId),
          gt(aiJobs.createdAt, hourAgo),
        ),
      );
    const dailyWorkspace = await transaction
      .select({ total: count() })
      .from(aiJobs)
      .where(
        and(eq(aiJobs.workspaceId, workspaceId), gt(aiJobs.createdAt, dayAgo)),
      );
    const hourlyUserRetries = await transaction
      .select({ total: count() })
      .from(aiJobAttempts)
      .innerJoin(aiJobs, eq(aiJobAttempts.jobId, aiJobs.id))
      .where(
        and(
          eq(aiJobs.createdByUserId, actor.userId),
          gt(aiJobAttempts.attemptNumber, 1),
          gt(aiJobAttempts.startedAt, hourAgo),
        ),
      );
    const dailyWorkspaceRetries = await transaction
      .select({ total: count() })
      .from(aiJobAttempts)
      .innerJoin(aiJobs, eq(aiJobAttempts.jobId, aiJobs.id))
      .where(
        and(
          eq(aiJobs.workspaceId, workspaceId),
          gt(aiJobAttempts.attemptNumber, 1),
          gt(aiJobAttempts.startedAt, dayAgo),
        ),
      );
    if ((activeUser[0]?.total ?? 0) >= config.runningPerUser) {
      throw new PlatformError(
        "ai_user_concurrency_limit",
        429,
        "Finish or cancel your active AI job before starting another.",
      );
    }
    if ((activeWorkspace[0]?.total ?? 0) >= config.runningPerWorkspace) {
      throw new PlatformError(
        "ai_workspace_concurrency_limit",
        429,
        "This workspace has reached its active AI job limit.",
      );
    }
    if (
      (hourlyUser[0]?.total ?? 0) + (hourlyUserRetries[0]?.total ?? 0) >=
      config.startsPerUserHour
    ) {
      throw new PlatformError(
        "ai_user_rate_limit",
        429,
        "You have reached the hourly AI job limit.",
      );
    }
    if (
      (dailyWorkspace[0]?.total ?? 0) +
        (dailyWorkspaceRetries[0]?.total ?? 0) >=
      config.startsPerWorkspaceDay
    ) {
      throw new PlatformError(
        "ai_workspace_rate_limit",
        429,
        "This workspace has reached its daily AI job limit.",
      );
    }
    await transaction
      .update(aiJobs)
      .set({
        status: "queued",
        provider: config.provider,
        model: config.model,
        contextSnapshot: context.snapshot,
        evidenceMap: context.evidenceMap,
        contextFingerprint: context.fingerprint,
        result: null,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        canceledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(aiJobs.id, jobId));
  });
  return getAiJob(actor, workspaceId, projectId, jobId);
}

export async function cancelAiJob(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  jobId: string,
) {
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({ kind: aiJobs.kind })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.id, jobId),
        eq(aiJobs.workspaceId, workspaceId),
        eq(aiJobs.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  assertJobAuthorization(rows[0].kind, access, actor.userId);
  const now = new Date();
  const updated = await getDb()
    .update(aiJobs)
    .set({
      status: "canceled",
      canceledAt: now,
      completedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: null,
      errorMessage: null,
      updatedAt: now,
    })
    .where(
      and(eq(aiJobs.id, jobId), inArray(aiJobs.status, ["queued", "running"])),
    )
    .returning({ id: aiJobs.id });
  if (!updated[0]) {
    throw new PlatformError(
      "ai_job_not_cancelable",
      409,
      "This AI job can no longer be canceled.",
    );
  }
  await getDb()
    .update(aiJobAttempts)
    .set({ status: "canceled", completedAt: now })
    .where(
      and(eq(aiJobAttempts.jobId, jobId), eq(aiJobAttempts.status, "running")),
    );
  return getAiJob(actor, workspaceId, projectId, jobId);
}

export async function runAiJob(jobId: string) {
  await expireAbandonedJobs();
  const config = getAiConfig();
  if (!config.enabled) return;
  const runnerId = randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(
    now.getTime() +
      Math.max(
        MINIMUM_LEASE_DURATION_MS,
        config.timeoutMs + LEASE_TIMEOUT_GRACE_MS,
      ),
  );
  let job: typeof aiJobs.$inferSelect | undefined;
  let attemptId = "";
  let attemptNumber = 0;
  await getDb().transaction(async (transaction) => {
    const queued = await transaction
      .select({
        status: aiJobs.status,
        provider: aiJobs.provider,
        model: aiJobs.model,
      })
      .from(aiJobs)
      .where(eq(aiJobs.id, jobId))
      .for("update")
      .limit(1);
    if (queued[0]?.status !== "queued") return;
    if (
      queued[0].provider !== config.provider ||
      queued[0].model !== config.model
    ) {
      await transaction
        .update(aiJobs)
        .set({
          status: "failed",
          errorCode: "ai_execution_config_changed",
          errorMessage: CONFIG_CHANGED_MESSAGE,
          completedAt: now,
          updatedAt: now,
        })
        .where(and(eq(aiJobs.id, jobId), eq(aiJobs.status, "queued")));
      return;
    }
    const claimed = await transaction
      .update(aiJobs)
      .set({
        status: "running",
        leaseOwner: runnerId,
        leaseExpiresAt,
        startedAt: now,
        completedAt: null,
        updatedAt: now,
      })
      .where(and(eq(aiJobs.id, jobId), eq(aiJobs.status, "queued")))
      .returning();
    job = claimed[0];
    if (!job) return;
    const attempts = await transaction
      .select({ value: count() })
      .from(aiJobAttempts)
      .where(eq(aiJobAttempts.jobId, jobId));
    attemptNumber = (attempts[0]?.value ?? 0) + 1;
    attemptId = randomUUID();
    await transaction.insert(aiJobAttempts).values({
      id: attemptId,
      jobId,
      attemptNumber,
      provider: job.provider,
      model: job.model,
    });
  });
  if (!job) return;
  try {
    const schema = resultSchemas[job.kind];
    const prompt = jobPrompt(
      job.kind,
      job.contextSnapshot as AiContextSnapshot,
    );
    const generation = await createAiProvider(config).generate({
      schemaName: job.kind,
      schema: z.toJSONSchema(schema) as Record<string, unknown>,
      ...prompt,
    });
    if (
      generation.provider !== job.provider ||
      generation.model !== job.model
    ) {
      throw new AiJobExecutionError(
        "ai_execution_config_changed",
        "The AI provider response did not match the job's approved execution configuration.",
      );
    }
    const result = schema.parse(generation.output) as AiJobResult;
    validateEvidenceKeys(result, job.evidenceMap as Record<string, AiEvidence>);
    let currentFingerprint: string;
    try {
      currentFingerprint = await currentAiContextFingerprint(
        { userId: job.createdByUserId, email: "" },
        job.workspaceId,
        job.projectId,
        targetFromJob(job),
      );
    } catch {
      throw new AiJobExecutionError(
        "ai_evidence_unavailable",
        "The AI job evidence is no longer available. Run a fresh analysis.",
      );
    }
    if (currentFingerprint !== job.contextFingerprint) {
      throw new AiJobExecutionError(
        "ai_context_changed",
        "The AI job context changed during this attempt. Run a fresh analysis.",
      );
    }
    const completedAt = new Date();
    await getDb().transaction(async (transaction) => {
      const finished = await transaction
        .update(aiJobs)
        .set({
          status: "succeeded",
          result: result as Record<string, unknown>,
          errorCode: null,
          errorMessage: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt,
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(aiJobs.id, jobId),
            eq(aiJobs.status, "running"),
            eq(aiJobs.leaseOwner, runnerId),
          ),
        )
        .returning({ id: aiJobs.id });
      await transaction
        .update(aiJobAttempts)
        .set({
          status: finished[0] ? "succeeded" : "canceled",
          providerRequestId: generation.providerRequestId,
          inputTokens: generation.usage.inputTokens,
          outputTokens: generation.usage.outputTokens,
          cachedInputTokens: generation.usage.cachedInputTokens,
          durationMs: generation.durationMs,
          completedAt,
        })
        .where(
          and(
            eq(aiJobAttempts.id, attemptId),
            eq(aiJobAttempts.status, "running"),
          ),
        );
      if (finished[0]) {
        await transaction.insert(auditEvents).values({
          id: randomUUID(),
          workspaceId: job!.workspaceId,
          actorType: "ai_agent",
          actorId: null,
          eventType: "ai_job.succeeded.v1",
          targetType: "ai_job",
          targetId: jobId,
          metadata: {
            projectId: job!.projectId,
            kind: job!.kind,
            provider: job!.provider,
            model: job!.model,
          },
        });
      }
    });
  } catch (error) {
    const providerError =
      error instanceof AiProviderError
        ? error
        : error instanceof AiJobExecutionError
          ? error
          : error instanceof z.ZodError
            ? new AiProviderError(
                "provider_malformed_response",
                "The AI provider returned output that did not match the required schema.",
              )
            : new AiProviderError(
                "provider_unavailable",
                "The AI job could not be completed.",
              );
    const completedAt = new Date();
    await getDb().transaction(async (transaction) => {
      const failed = await transaction
        .update(aiJobs)
        .set({
          status: "failed",
          errorCode: providerError.code,
          errorMessage: providerError.message,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt,
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(aiJobs.id, jobId),
            eq(aiJobs.status, "running"),
            eq(aiJobs.leaseOwner, runnerId),
          ),
        )
        .returning({ id: aiJobs.id });
      await transaction
        .update(aiJobAttempts)
        .set({
          status: failed[0] ? "failed" : "canceled",
          errorCode: providerError.code,
          errorMessage: providerError.message,
          completedAt,
        })
        .where(
          and(
            eq(aiJobAttempts.id, attemptId),
            eq(aiJobAttempts.status, "running"),
          ),
        );
    });
  }
}

function selectedCandidates(
  result: ScopeChangeAnalysisResult,
  selection: z.infer<typeof aiActionSelectionSchema>,
) {
  const workByKey = new Map(
    result.workCandidates.map((item) => [item.candidateKey, item]),
  );
  const questionByKey = new Map(
    result.clarificationCandidates.map((item) => [item.candidateKey, item]),
  );
  const work = selection.workCandidateKeys.map((key) => workByKey.get(key));
  const clarifications = selection.clarificationCandidateKeys.map((key) =>
    questionByKey.get(key),
  );
  if (work.some((item) => !item) || clarifications.some((item) => !item)) {
    throw new PlatformError(
      "ai_candidate_unavailable",
      409,
      "One or more selected AI candidates are unavailable.",
    );
  }
  return {
    work: work as ScopeChangeAnalysisResult["workCandidates"],
    clarifications:
      clarifications as ScopeChangeAnalysisResult["clarificationCandidates"],
  };
}

async function actionJob(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  jobId: string,
  rawInput: unknown,
) {
  const selection = aiActionSelectionSchema.parse(rawInput);
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  assertProjectManager(access, actor.userId);
  const rows = await getDb()
    .select()
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.id, jobId),
        eq(aiJobs.workspaceId, workspaceId),
        eq(aiJobs.projectId, projectId),
      ),
    )
    .limit(1);
  const job = rows[0];
  if (!job) throw notFound();
  if (
    job.kind !== "scope_change_analysis" ||
    job.status !== "succeeded" ||
    !job.result
  ) {
    throw new PlatformError(
      "ai_action_unavailable",
      409,
      "This AI job cannot create draft records.",
    );
  }
  if (selection.contextFingerprint !== job.contextFingerprint) {
    throw new PlatformError(
      "ai_context_stale",
      409,
      "The analysis context has changed. Run a fresh analysis before confirming.",
    );
  }
  const result = resultSchemas.scope_change_analysis.parse(job.result);
  const candidates = selectedCandidates(result, selection);
  return { job, selection, candidates };
}

export async function previewAiActions(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  jobId: string,
  rawInput: unknown,
) {
  const prepared = await actionJob(
    actor,
    workspaceId,
    projectId,
    jobId,
    rawInput,
  );
  const fingerprint = await currentAiContextFingerprint(
    actor,
    workspaceId,
    projectId,
    targetFromJob(prepared.job),
  );
  if (fingerprint !== prepared.job.contextFingerprint) {
    throw new PlatformError(
      "ai_context_stale",
      409,
      "The analysis context has changed. Run a fresh analysis before confirming.",
    );
  }
  return {
    contextFingerprint: prepared.job.contextFingerprint,
    work: prepared.candidates.work,
    clarifications: prepared.candidates.clarifications,
    effects: {
      workStatus: "backlog",
      workPurpose: "unclassified",
      assigned: false,
      commerciallyLinked: false,
      clarificationStatus: "draft",
      requestAndClientStateChanged: false,
    },
  };
}

export async function confirmAiActions(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  jobId: string,
  rawInput: unknown,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const prepared = await actionJob(
    actor,
    workspaceId,
    projectId,
    jobId,
    rawInput,
  );
  await entitlements.assertAllowed("delivery.work.manage", {
    userId: actor.userId,
    workspaceId,
  });
  const existingExecutions = await getDb()
    .select({ id: aiActionExecutions.id })
    .from(aiActionExecutions)
    .where(
      and(
        eq(aiActionExecutions.jobId, jobId),
        eq(
          aiActionExecutions.idempotencyKey,
          prepared.selection.idempotencyKey,
        ),
      ),
    )
    .limit(1);
  if (existingExecutions[0]) {
    return getAiActionExecution(
      actor,
      workspaceId,
      projectId,
      existingExecutions[0].id,
    );
  }
  const currentFingerprint = await currentAiContextFingerprint(
    actor,
    workspaceId,
    projectId,
    targetFromJob(prepared.job),
  );
  if (currentFingerprint !== prepared.job.contextFingerprint) {
    throw new PlatformError(
      "ai_context_stale",
      409,
      "The analysis context has changed. Run a fresh analysis before confirming.",
    );
  }
  const db = getDb();
  let executionId = "";
  await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select ${projects.id} from ${projects} where ${projects.id} = ${projectId} and ${projects.workspaceId} = ${workspaceId} for update`,
    );
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const lockedFingerprint = await currentAiContextFingerprint(
      actor,
      workspaceId,
      projectId,
      targetFromJob(prepared.job),
    );
    if (lockedFingerprint !== prepared.job.contextFingerprint) {
      throw new PlatformError(
        "ai_context_stale",
        409,
        "The analysis context changed before confirmation.",
      );
    }
    const existing = await transaction
      .select({ id: aiActionExecutions.id })
      .from(aiActionExecutions)
      .where(
        and(
          eq(aiActionExecutions.jobId, jobId),
          eq(
            aiActionExecutions.idempotencyKey,
            prepared.selection.idempotencyKey,
          ),
        ),
      )
      .limit(1);
    if (existing[0]) {
      executionId = existing[0].id;
      return;
    }
    const lockedJobs = await transaction
      .select()
      .from(aiJobs)
      .where(and(eq(aiJobs.id, jobId), eq(aiJobs.projectId, projectId)))
      .for("update")
      .limit(1);
    const lockedJob = lockedJobs[0];
    if (
      !lockedJob ||
      lockedJob.status !== "succeeded" ||
      lockedJob.contextFingerprint !== prepared.selection.contextFingerprint ||
      lockedJob.requestId !== prepared.job.requestId
    ) {
      throw new PlatformError(
        "ai_context_stale",
        409,
        "The analysis context changed before confirmation.",
      );
    }
    const requestRows = await transaction
      .select({ id: commercialRequests.id })
      .from(commercialRequests)
      .where(
        and(
          eq(commercialRequests.id, lockedJob.requestId!),
          eq(commercialRequests.projectId, projectId),
        ),
      )
      .limit(1);
    if (!requestRows[0]) throw notFound();
    executionId = randomUUID();
    await transaction.insert(aiActionExecutions).values({
      id: executionId,
      jobId,
      workspaceId,
      projectId,
      confirmedByUserId: actor.userId,
      idempotencyKey: prepared.selection.idempotencyKey,
      selection: {
        workCandidateKeys: prepared.selection.workCandidateKeys,
        clarificationCandidateKeys:
          prepared.selection.clarificationCandidateKeys,
      },
      contextFingerprint: lockedJob.contextFingerprint,
    });
    const allocation = prepared.candidates.work.length
      ? await transaction
          .update(projects)
          .set({
            nextWorkItemNumber: sql`${projects.nextWorkItemNumber} + ${prepared.candidates.work.length}`,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectId))
          .returning({
            firstNumber: sql<number>`${projects.nextWorkItemNumber} - ${prepared.candidates.work.length}`,
          })
      : [];
    const orderRows = await transaction
      .select({ value: max(workItems.sortOrder) })
      .from(workItems)
      .where(
        and(
          eq(workItems.projectId, projectId),
          eq(workItems.status, "backlog"),
        ),
      );
    const firstOrder = (orderRows[0]?.value ?? -1) + 1;
    const workRecords = prepared.candidates.work.map((candidate, index) => ({
      id: randomUUID(),
      candidate,
      number: allocation[0]!.firstNumber + index,
      sortOrder: firstOrder + index,
    }));
    if (workRecords.length) {
      await transaction.insert(workItems).values(
        workRecords.map((item) => ({
          id: item.id,
          projectId,
          number: item.number,
          title: item.candidate.title,
          description: item.candidate.description,
          acceptanceCriteria: item.candidate.acceptanceCriteria,
          status: "backlog" as const,
          priority: "none" as const,
          purpose: "unclassified" as const,
          assigneeUserId: null,
          sortOrder: item.sortOrder,
        })),
      );
    }
    const clarificationRecords = prepared.candidates.clarifications.map(
      (candidate) => ({
        id: randomUUID(),
        candidate,
      }),
    );
    if (clarificationRecords.length) {
      await transaction.insert(commercialRequestClarifications).values(
        clarificationRecords.map((item) => ({
          id: item.id,
          projectId,
          requestId: lockedJob.requestId!,
          question: item.candidate.question,
          status: "draft" as const,
          originatingJobId: jobId,
          createdByUserId: actor.userId,
        })),
      );
    }
    const mappings = [
      ...workRecords.map((item) => ({
        executionId,
        candidateKey: item.candidate.candidateKey,
        recordType: "work_item" as const,
        recordId: item.id,
      })),
      ...clarificationRecords.map((item) => ({
        executionId,
        candidateKey: item.candidate.candidateKey,
        recordType: "clarification" as const,
        recordId: item.id,
      })),
    ];
    if (mappings.length)
      await transaction.insert(aiActionRecords).values(mappings);
    await transaction.insert(auditEvents).values([
      {
        id: randomUUID(),
        workspaceId,
        actorType: "human" as const,
        actorId: actor.userId,
        eventType: "ai_action.confirmed.v1",
        targetType: "ai_job",
        targetId: jobId,
        metadata: {
          projectId,
          executionId,
          aiJobId: jobId,
        },
      },
      ...mappings.map((mapping) => ({
        id: randomUUID(),
        workspaceId,
        actorType: "ai_agent" as const,
        actorId: null,
        eventType:
          mapping.recordType === "work_item"
            ? "ai_work_candidate.created.v1"
            : "ai_clarification_candidate.created.v1",
        targetType: mapping.recordType,
        targetId: mapping.recordId,
        metadata: {
          projectId,
          aiJobId: jobId,
          confirmedByUserId: actor.userId,
        },
      })),
    ]);
  });
  return getAiActionExecution(actor, workspaceId, projectId, executionId);
}

async function getAiActionExecution(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  executionId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const [executions, records] = await Promise.all([
    getDb()
      .select()
      .from(aiActionExecutions)
      .where(
        and(
          eq(aiActionExecutions.id, executionId),
          eq(aiActionExecutions.workspaceId, workspaceId),
          eq(aiActionExecutions.projectId, projectId),
        ),
      )
      .limit(1),
    getDb()
      .select()
      .from(aiActionRecords)
      .where(eq(aiActionRecords.executionId, executionId))
      .orderBy(asc(aiActionRecords.candidateKey)),
  ]);
  if (!executions[0]) throw notFound();
  return { ...executions[0], records };
}
