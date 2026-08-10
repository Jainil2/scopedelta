import { randomUUID } from "node:crypto";

import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  commercialBasisLinks,
  commercialDecisionAnchors,
  commercialDecisions,
  commercialDecisionScopeItems,
  commercialEvidenceAnchors,
  commercialEvidenceSources,
  commercialImpactAssessmentAnchors,
  commercialImpactAssessments,
  commercialRequestAnchors,
  commercialRequests,
  commercialRequestScopeItems,
  commercialScopeItemRevisions,
  commercialScopeItems,
  projects,
  users,
  workItems,
} from "@/db/schema";
import type {
  CommercialRequestFilters,
  CreateCommercialDecisionInput,
  CreateCommercialImpactAssessmentInput,
  CreateCommercialRequestInput,
  UpdateCommercialRequestStateInput,
} from "@/lib/commercial-validation";
import {
  communityEntitlementPolicy,
  type EntitlementPolicy,
} from "@/lib/entitlements";
import { notFound, PlatformError } from "@/lib/platform-errors";
import {
  assertProjectManager,
  assertWritableProject,
  getProjectAccess,
  insertAudit,
  type Executor,
  type Transaction,
} from "@/server/delivery";
import type { UserActor } from "@/server/workspaces";

const MAX_REQUESTS_PER_PROJECT = 1_000;
const MAX_DECISIONS_PER_REQUEST = 50;
const MAX_IMPACTS_PER_REQUEST = 100;
const AUTHORIZING_DISPOSITIONS = [
  "covered",
  "absorbed",
  "swap",
  "paid_change",
] as const;

type EvidenceAnchorInput = {
  sourceId: string;
  startOffset: number;
  endOffset: number;
  label?: string | null;
};

type ImpactInput = Omit<
  CreateCommercialImpactAssessmentInput,
  "decisionId" | "supersedesImpactAssessmentId"
>;

export async function listCommercialRequests(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  filters: CommercialRequestFilters,
) {
  await getCommercialManagerAccess(getDb(), actor, workspaceId, projectId);
  const conditions = [eq(commercialRequests.projectId, projectId)];
  if (filters.state)
    conditions.push(eq(commercialRequests.state, filters.state));
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        id: commercialRequests.id,
        state: commercialRequests.state,
        title: commercialRequests.title,
        requestText: commercialRequests.requestText,
        externalRequester: commercialRequests.externalRequester,
        receivedAt: commercialRequests.receivedAt,
        createdAt: commercialRequests.createdAt,
        updatedAt: commercialRequests.updatedAt,
        decisionId: commercialDecisions.id,
        disposition: commercialDecisions.disposition,
        coverageBasis: commercialDecisions.coverageBasis,
        rationale: commercialDecisions.rationale,
        confirmedAt: commercialDecisions.confirmedAt,
        supersedesDecisionId: commercialDecisions.supersedesDecisionId,
        decisionActorUserId: commercialDecisions.createdByUserId,
        decisionActorName: users.name,
      })
      .from(commercialRequests)
      .leftJoin(
        commercialDecisions,
        and(
          eq(commercialDecisions.requestId, commercialRequests.id),
          isNull(commercialDecisions.supersededAt),
        ),
      )
      .leftJoin(users, eq(users.id, commercialDecisions.createdByUserId))
      .where(where)
      .orderBy(desc(commercialRequests.receivedAt), desc(commercialRequests.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb().select({ total: count() }).from(commercialRequests).where(where),
  ]);
  const hydrated = await hydrateRequestRows(projectId, rows, true);
  return {
    data: hydrated,
    page: {
      number: filters.page,
      size: filters.pageSize,
      total: totals[0]?.total ?? 0,
      pages: Math.max(1, Math.ceil((totals[0]?.total ?? 0) / filters.pageSize)),
    },
  };
}

export async function getCommercialRequest(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  requestId: string,
) {
  await getCommercialManagerAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({
      id: commercialRequests.id,
      state: commercialRequests.state,
      title: commercialRequests.title,
      requestText: commercialRequests.requestText,
      externalRequester: commercialRequests.externalRequester,
      receivedAt: commercialRequests.receivedAt,
      createdAt: commercialRequests.createdAt,
      updatedAt: commercialRequests.updatedAt,
      decisionId: commercialDecisions.id,
      disposition: commercialDecisions.disposition,
      coverageBasis: commercialDecisions.coverageBasis,
      rationale: commercialDecisions.rationale,
      confirmedAt: commercialDecisions.confirmedAt,
      supersedesDecisionId: commercialDecisions.supersedesDecisionId,
      decisionActorUserId: commercialDecisions.createdByUserId,
      decisionActorName: users.name,
    })
    .from(commercialRequests)
    .leftJoin(
      commercialDecisions,
      and(
        eq(commercialDecisions.requestId, commercialRequests.id),
        isNull(commercialDecisions.supersededAt),
      ),
    )
    .leftJoin(users, eq(users.id, commercialDecisions.createdByUserId))
    .where(
      and(
        eq(commercialRequests.id, requestId),
        eq(commercialRequests.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  const hydrated = await hydrateRequestRows(projectId, rows, true);
  return hydrated[0]!;
}

export async function createCommercialRequest(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateCommercialRequestInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  await assertCommercialManage(actor, workspaceId, projectId, entitlements);
  const requestId = await getDb().transaction(async (transaction) => {
    await getWritableCommercialManager(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    await lockProject(transaction, projectId);
    const existing = await transaction
      .select({ id: commercialRequests.id })
      .from(commercialRequests)
      .where(
        and(
          eq(commercialRequests.projectId, projectId),
          eq(commercialRequests.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0].id;
    await assertRequestCapacity(transaction, projectId);
    const scopeItemIds = [...new Set(input.scopeItemIds)];
    await assertScopeItems(transaction, projectId, scopeItemIds, false);
    const id = randomUUID();
    await transaction.insert(commercialRequests).values({
      id,
      projectId,
      idempotencyKey: input.idempotencyKey,
      state: "open",
      title: input.title,
      requestText: input.requestText,
      externalRequester: input.externalRequester,
      receivedAt: new Date(input.receivedAt),
      createdByUserId: actor.userId,
    });
    if (scopeItemIds.length) {
      await transaction.insert(commercialRequestScopeItems).values(
        scopeItemIds.map((scopeItemId) => ({
          projectId,
          requestId: id,
          scopeItemId,
        })),
      );
    }
    const anchorIds = await createEvidenceAnchors(
      transaction,
      actor.userId,
      projectId,
      input.anchors,
    );
    if (anchorIds.length) {
      await transaction.insert(commercialRequestAnchors).values(
        anchorIds.map((evidenceAnchorId) => ({
          projectId,
          requestId: id,
          evidenceAnchorId,
        })),
      );
    }
    const impactId = input.impact
      ? await insertImpactAssessment(
          transaction,
          actor.userId,
          projectId,
          id,
          null,
          input.impact,
          null,
        )
      : null;
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "commercial.request.created.v1",
      targetType: "commercial_request",
      targetId: id,
      metadata: {
        projectId,
        state: "open",
        scopeItemIds,
        anchorIds,
        ...(impactId ? { impactAssessmentId: impactId } : {}),
      },
    });
    return id;
  });
  return getCommercialRequest(actor, workspaceId, projectId, requestId);
}

export async function updateCommercialRequestState(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  requestId: string,
  input: UpdateCommercialRequestStateInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  await assertCommercialManage(actor, workspaceId, projectId, entitlements);
  await getDb().transaction(async (transaction) => {
    await getWritableCommercialManager(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    const request = await transaction
      .select({ state: commercialRequests.state })
      .from(commercialRequests)
      .where(
        and(
          eq(commercialRequests.id, requestId),
          eq(commercialRequests.projectId, projectId),
        ),
      )
      .for("update")
      .limit(1);
    if (!request[0]) throw notFound();
    if (request[0].state === input.state) return;
    const currentDecision = await transaction
      .select({ id: commercialDecisions.id })
      .from(commercialDecisions)
      .where(
        and(
          eq(commercialDecisions.requestId, requestId),
          eq(commercialDecisions.projectId, projectId),
          isNull(commercialDecisions.supersededAt),
        ),
      )
      .limit(1);
    if (currentDecision[0]) {
      throw conflict(
        "request_has_effective_decision",
        "Supersede the current decision instead of reopening this request.",
      );
    }
    await transaction
      .update(commercialRequests)
      .set({ state: input.state, updatedAt: new Date() })
      .where(eq(commercialRequests.id, requestId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "commercial.request.state.updated.v1",
      targetType: "commercial_request",
      targetId: requestId,
      metadata: {
        projectId,
        previousState: request[0].state,
        state: input.state,
      },
    });
  });
  return getCommercialRequest(actor, workspaceId, projectId, requestId);
}

export async function createCommercialDecision(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  requestId: string,
  input: CreateCommercialDecisionInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  await assertCommercialManage(actor, workspaceId, projectId, entitlements);
  await getDb().transaction(async (transaction) => {
    await getWritableCommercialManager(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    const request = await transaction
      .select({ state: commercialRequests.state })
      .from(commercialRequests)
      .where(
        and(
          eq(commercialRequests.id, requestId),
          eq(commercialRequests.projectId, projectId),
        ),
      )
      .for("update")
      .limit(1);
    if (!request[0]) throw notFound();
    const duplicate = await transaction
      .select({ id: commercialDecisions.id })
      .from(commercialDecisions)
      .where(
        and(
          eq(commercialDecisions.requestId, requestId),
          eq(commercialDecisions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (duplicate[0]) return duplicate[0].id;
    validateDecisionInput(request[0].state, input);
    await assertDecisionCapacity(transaction, requestId);
    const current = await transaction
      .select({ id: commercialDecisions.id })
      .from(commercialDecisions)
      .where(
        and(
          eq(commercialDecisions.requestId, requestId),
          eq(commercialDecisions.projectId, projectId),
          isNull(commercialDecisions.supersededAt),
        ),
      )
      .for("update")
      .limit(1);
    const currentDecisionId = current[0]?.id ?? null;
    assertDecisionSupersession(
      currentDecisionId,
      input.supersedesDecisionId ?? null,
    );
    const scope = await validateDecisionScope(transaction, projectId, input);
    const { id, confirmedAt } = await insertDecisionRecord(
      transaction,
      actor.userId,
      projectId,
      requestId,
      currentDecisionId,
      input,
    );
    const anchorIds = await insertDecisionEvidence(
      transaction,
      actor.userId,
      projectId,
      id,
      scope,
      input.anchors,
    );
    const impact = await insertDecisionImpact(
      transaction,
      actor.userId,
      projectId,
      requestId,
      id,
      input.impact ?? null,
    );
    await finalizeDecision(
      transaction,
      actor,
      workspaceId,
      projectId,
      requestId,
      request[0].state,
      currentDecisionId,
      id,
      confirmedAt,
      input,
      scope,
      anchorIds,
      impact,
    );
    return id;
  });
  return getCommercialRequest(actor, workspaceId, projectId, requestId);
}

type RequestState = typeof commercialRequests.$inferSelect.state;
type DecisionScopeIds = {
  affectedScopeItemIds: string[];
  swapOffsetScopeItemIds: string[];
};

function validateDecisionInput(
  requestState: RequestState,
  input: CreateCommercialDecisionInput,
) {
  if (requestState === "withdrawn") {
    throw conflict(
      "request_withdrawn",
      "Reopen this request before confirming a decision.",
    );
  }
  if (input.disposition !== "covered" && input.coverageBasis) {
    throw conflict(
      "coverage_basis_not_allowed",
      "Only covered decisions can record an existing-obligation basis.",
    );
  }
  if (input.disposition === "swap" && !input.swapOffsetScopeItemIds.length) {
    throw conflict(
      "swap_offset_required",
      "A scope swap requires at least one active offsetting scope item.",
    );
  }
  if (input.disposition !== "swap" && input.swapOffsetScopeItemIds.length) {
    throw conflict(
      "swap_offset_not_allowed",
      "Only scope-swap decisions can identify offsetting scope.",
    );
  }
}

function assertDecisionSupersession(
  currentDecisionId: string | null,
  supersedesDecisionId: string | null,
) {
  if (currentDecisionId === supersedesDecisionId) return;
  throw conflict(
    "decision_supersession_conflict",
    currentDecisionId
      ? "Supersede the current effective decision explicitly."
      : "There is no current decision to supersede.",
  );
}

async function validateDecisionScope(
  transaction: Transaction,
  projectId: string,
  input: CreateCommercialDecisionInput,
): Promise<DecisionScopeIds> {
  const affectedScopeItemIds = [...new Set(input.affectedScopeItemIds)];
  const swapOffsetScopeItemIds = [...new Set(input.swapOffsetScopeItemIds)];
  if (swapOffsetScopeItemIds.some((id) => affectedScopeItemIds.includes(id))) {
    throw conflict(
      "swap_scope_overlap",
      "Accepted and offsetting scope items must be different.",
    );
  }
  await assertScopeItems(transaction, projectId, affectedScopeItemIds, false);
  await assertScopeItems(transaction, projectId, swapOffsetScopeItemIds, true);
  return { affectedScopeItemIds, swapOffsetScopeItemIds };
}

async function insertDecisionRecord(
  transaction: Transaction,
  actorUserId: string,
  projectId: string,
  requestId: string,
  currentDecisionId: string | null,
  input: CreateCommercialDecisionInput,
) {
  const confirmedAt = new Date();
  if (currentDecisionId) {
    await transaction
      .update(commercialDecisions)
      .set({ supersededAt: confirmedAt })
      .where(eq(commercialDecisions.id, currentDecisionId));
  }
  const id = randomUUID();
  await transaction.insert(commercialDecisions).values({
    id,
    projectId,
    requestId,
    idempotencyKey: input.idempotencyKey,
    disposition: input.disposition,
    coverageBasis: input.coverageBasis,
    rationale: input.rationale,
    supersedesDecisionId: currentDecisionId,
    confirmedAt,
    createdByUserId: actorUserId,
  });
  return { id, confirmedAt };
}

async function insertDecisionEvidence(
  transaction: Transaction,
  actorUserId: string,
  projectId: string,
  decisionId: string,
  scope: DecisionScopeIds,
  anchors: EvidenceAnchorInput[],
) {
  const scopeRows = [
    ...scope.affectedScopeItemIds.map((scopeItemId) => ({
      projectId,
      decisionId,
      scopeItemId,
      role: "affected" as const,
    })),
    ...scope.swapOffsetScopeItemIds.map((scopeItemId) => ({
      projectId,
      decisionId,
      scopeItemId,
      role: "swap_offset" as const,
    })),
  ];
  if (scopeRows.length)
    await transaction.insert(commercialDecisionScopeItems).values(scopeRows);
  const anchorIds = await createEvidenceAnchors(
    transaction,
    actorUserId,
    projectId,
    anchors,
  );
  if (anchorIds.length) {
    await transaction.insert(commercialDecisionAnchors).values(
      anchorIds.map((evidenceAnchorId) => ({
        projectId,
        decisionId,
        evidenceAnchorId,
      })),
    );
  }
  return anchorIds;
}

async function insertDecisionImpact(
  transaction: Transaction,
  actorUserId: string,
  projectId: string,
  requestId: string,
  decisionId: string,
  impact: ImpactInput | null,
) {
  if (!impact) return { impactId: null, previousImpactId: null };
  const previous = await transaction
    .select({ id: commercialImpactAssessments.id })
    .from(commercialImpactAssessments)
    .where(
      and(
        eq(commercialImpactAssessments.requestId, requestId),
        eq(commercialImpactAssessments.projectId, projectId),
      ),
    )
    .orderBy(
      desc(commercialImpactAssessments.createdAt),
      desc(commercialImpactAssessments.id),
    )
    .for("update")
    .limit(1);
  const previousImpactId = previous[0]?.id ?? null;
  const impactId = await insertImpactAssessment(
    transaction,
    actorUserId,
    projectId,
    requestId,
    decisionId,
    impact,
    previousImpactId,
  );
  return { impactId, previousImpactId };
}

async function finalizeDecision(
  transaction: Transaction,
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  requestId: string,
  previousState: RequestState,
  currentDecisionId: string | null,
  decisionId: string,
  confirmedAt: Date,
  input: CreateCommercialDecisionInput,
  scope: DecisionScopeIds,
  anchorIds: string[],
  impact: { impactId: string | null; previousImpactId: string | null },
) {
  await transaction
    .update(commercialRequests)
    .set({ state: "resolved", updatedAt: confirmedAt })
    .where(eq(commercialRequests.id, requestId));
  await insertAudit(transaction, actor, workspaceId, {
    eventType: "commercial.decision.confirmed.v1",
    targetType: "commercial_decision",
    targetId: decisionId,
    metadata: {
      projectId,
      requestId,
      disposition: input.disposition,
      coverageBasis: input.coverageBasis ?? "",
      supersedesDecisionId: currentDecisionId ?? "",
      ...scope,
      anchorIds,
      ...(impact.impactId ? { impactAssessmentId: impact.impactId } : {}),
      ...(impact.previousImpactId
        ? { supersedesImpactAssessmentId: impact.previousImpactId }
        : {}),
    },
  });
  if (previousState !== "resolved") {
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "commercial.request.state.updated.v1",
      targetType: "commercial_request",
      targetId: requestId,
      metadata: { projectId, previousState, state: "resolved" },
    });
  }
}

export async function createCommercialImpactAssessment(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  requestId: string,
  input: CreateCommercialImpactAssessmentInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  await assertCommercialManage(actor, workspaceId, projectId, entitlements);
  await getDb().transaction(async (transaction) => {
    await getWritableCommercialManager(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    const request = await transaction
      .select({ id: commercialRequests.id })
      .from(commercialRequests)
      .where(
        and(
          eq(commercialRequests.id, requestId),
          eq(commercialRequests.projectId, projectId),
        ),
      )
      .for("update")
      .limit(1);
    if (!request[0]) throw notFound();
    const duplicate = await transaction
      .select({ id: commercialImpactAssessments.id })
      .from(commercialImpactAssessments)
      .where(
        and(
          eq(commercialImpactAssessments.requestId, requestId),
          eq(commercialImpactAssessments.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (duplicate[0]) return;
    await assertImpactCapacity(transaction, requestId);
    if (input.decisionId) {
      const decision = await transaction
        .select({ id: commercialDecisions.id })
        .from(commercialDecisions)
        .where(
          and(
            eq(commercialDecisions.id, input.decisionId),
            eq(commercialDecisions.requestId, requestId),
            eq(commercialDecisions.projectId, projectId),
          ),
        )
        .limit(1);
      if (!decision[0]) throw notFound();
    }
    if (input.supersedesImpactAssessmentId) {
      const previous = await transaction
        .select({ id: commercialImpactAssessments.id })
        .from(commercialImpactAssessments)
        .where(
          and(
            eq(
              commercialImpactAssessments.id,
              input.supersedesImpactAssessmentId,
            ),
            eq(commercialImpactAssessments.requestId, requestId),
            eq(commercialImpactAssessments.projectId, projectId),
          ),
        )
        .limit(1);
      if (!previous[0]) throw notFound();
    }
    const id = await insertImpactAssessment(
      transaction,
      actor.userId,
      projectId,
      requestId,
      input.decisionId ?? null,
      input,
      input.supersedesImpactAssessmentId ?? null,
    );
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "commercial.impact.recorded.v1",
      targetType: "commercial_impact_assessment",
      targetId: id,
      metadata: {
        projectId,
        requestId,
        decisionId: input.decisionId ?? "",
        confidence: input.confidence,
        supersedesImpactAssessmentId: input.supersedesImpactAssessmentId ?? "",
        changedFields: impactChangedFields(input),
      },
    });
  });
  return getCommercialRequest(actor, workspaceId, projectId, requestId);
}

export function isAuthorizingDisposition(value: string | null) {
  return AUTHORIZING_DISPOSITIONS.includes(
    value as (typeof AUTHORIZING_DISPOSITIONS)[number],
  );
}

async function hydrateRequestRows<
  T extends {
    id: string;
    decisionId: string | null;
    disposition:
      | "covered"
      | "absorbed"
      | "swap"
      | "paid_change"
      | "deferred"
      | "rejected"
      | null;
    coverageBasis:
      | "baseline"
      | "defect_or_warranty"
      | "revision_allowance"
      | "other_existing_obligation"
      | null;
    rationale: string | null;
    confirmedAt: Date | null;
    supersedesDecisionId: string | null;
    decisionActorUserId: string | null;
    decisionActorName: string | null;
  },
>(projectId: string, rows: T[], includeHistory = false) {
  const requestIds = rows.map((row) => row.id);
  if (!requestIds.length) return [];
  const decisionIds = rows.flatMap((row) =>
    row.decisionId ? [row.decisionId] : [],
  );
  const [
    requestScopes,
    requestAnchors,
    decisionScopes,
    decisionAnchors,
    impacts,
    activeLinks,
    histories,
  ] = await Promise.all([
    getDb()
      .select({
        requestId: commercialRequestScopeItems.requestId,
        scopeItemId: commercialScopeItems.id,
        kind: commercialScopeItemRevisions.kind,
        title: commercialScopeItemRevisions.title,
        archivedAt: commercialScopeItems.archivedAt,
      })
      .from(commercialRequestScopeItems)
      .innerJoin(
        commercialScopeItems,
        eq(commercialScopeItems.id, commercialRequestScopeItems.scopeItemId),
      )
      .innerJoin(
        commercialScopeItemRevisions,
        eq(commercialScopeItemRevisions.scopeItemId, commercialScopeItems.id),
      )
      .where(
        and(
          inArray(commercialRequestScopeItems.requestId, requestIds),
          eq(commercialRequestScopeItems.projectId, projectId),
        ),
      )
      .orderBy(desc(commercialScopeItemRevisions.revisionNumber)),
    getDb()
      .select({
        requestId: commercialRequestAnchors.requestId,
        id: commercialEvidenceAnchors.id,
        sourceId: commercialEvidenceSources.id,
        sourceName: commercialEvidenceSources.name,
        startOffset: commercialEvidenceAnchors.startOffset,
        endOffset: commercialEvidenceAnchors.endOffset,
        label: commercialEvidenceAnchors.label,
      })
      .from(commercialRequestAnchors)
      .innerJoin(
        commercialEvidenceAnchors,
        eq(
          commercialEvidenceAnchors.id,
          commercialRequestAnchors.evidenceAnchorId,
        ),
      )
      .innerJoin(
        commercialEvidenceSources,
        eq(commercialEvidenceSources.id, commercialEvidenceAnchors.sourceId),
      )
      .where(
        and(
          inArray(commercialRequestAnchors.requestId, requestIds),
          eq(commercialRequestAnchors.projectId, projectId),
        ),
      ),
    decisionIds.length
      ? getDb()
          .select({
            decisionId: commercialDecisionScopeItems.decisionId,
            scopeItemId: commercialScopeItems.id,
            role: commercialDecisionScopeItems.role,
            kind: commercialScopeItemRevisions.kind,
            title: commercialScopeItemRevisions.title,
            archivedAt: commercialScopeItems.archivedAt,
          })
          .from(commercialDecisionScopeItems)
          .innerJoin(
            commercialScopeItems,
            eq(
              commercialScopeItems.id,
              commercialDecisionScopeItems.scopeItemId,
            ),
          )
          .innerJoin(
            commercialScopeItemRevisions,
            eq(
              commercialScopeItemRevisions.scopeItemId,
              commercialScopeItems.id,
            ),
          )
          .where(
            and(
              inArray(commercialDecisionScopeItems.decisionId, decisionIds),
              eq(commercialDecisionScopeItems.projectId, projectId),
            ),
          )
          .orderBy(desc(commercialScopeItemRevisions.revisionNumber))
      : [],
    decisionIds.length
      ? getDb()
          .select({
            decisionId: commercialDecisionAnchors.decisionId,
            id: commercialEvidenceAnchors.id,
            sourceId: commercialEvidenceSources.id,
            sourceName: commercialEvidenceSources.name,
            startOffset: commercialEvidenceAnchors.startOffset,
            endOffset: commercialEvidenceAnchors.endOffset,
            label: commercialEvidenceAnchors.label,
          })
          .from(commercialDecisionAnchors)
          .innerJoin(
            commercialEvidenceAnchors,
            eq(
              commercialEvidenceAnchors.id,
              commercialDecisionAnchors.evidenceAnchorId,
            ),
          )
          .innerJoin(
            commercialEvidenceSources,
            eq(
              commercialEvidenceSources.id,
              commercialEvidenceAnchors.sourceId,
            ),
          )
          .where(
            and(
              inArray(commercialDecisionAnchors.decisionId, decisionIds),
              eq(commercialDecisionAnchors.projectId, projectId),
            ),
          )
      : [],
    getDb()
      .select({
        id: commercialImpactAssessments.id,
        requestId: commercialImpactAssessments.requestId,
        decisionId: commercialImpactAssessments.decisionId,
        confidence: commercialImpactAssessments.confidence,
        effortMinutes: commercialImpactAssessments.effortMinutes,
        scheduleDeltaDays: commercialImpactAssessments.scheduleDeltaDays,
        targetDate: commercialImpactAssessments.targetDate,
        monetaryAmount: commercialImpactAssessments.monetaryAmount,
        currencyCode: commercialImpactAssessments.currencyCode,
        notes: commercialImpactAssessments.notes,
        supersedesImpactAssessmentId:
          commercialImpactAssessments.supersedesImpactAssessmentId,
        createdAt: commercialImpactAssessments.createdAt,
      })
      .from(commercialImpactAssessments)
      .where(
        and(
          inArray(commercialImpactAssessments.requestId, requestIds),
          eq(commercialImpactAssessments.projectId, projectId),
        ),
      )
      .orderBy(desc(commercialImpactAssessments.createdAt))
      .limit(requestIds.length * 10),
    getDb()
      .select({
        requestId: commercialDecisions.requestId,
        supersededAt: commercialDecisions.supersededAt,
        workItemId: workItems.id,
        workItemNumber: workItems.number,
        workItemTitle: workItems.title,
        workItemStatus: workItems.status,
      })
      .from(commercialBasisLinks)
      .innerJoin(
        commercialDecisions,
        eq(commercialDecisions.id, commercialBasisLinks.decisionId),
      )
      .innerJoin(workItems, eq(workItems.id, commercialBasisLinks.workItemId))
      .where(
        and(
          inArray(commercialDecisions.requestId, requestIds),
          eq(commercialBasisLinks.projectId, projectId),
          isNull(workItems.archivedAt),
          notInArray(workItems.status, ["done", "canceled"]),
        ),
      ),
    includeHistory
      ? getDb()
          .select({
            id: commercialDecisions.id,
            requestId: commercialDecisions.requestId,
            disposition: commercialDecisions.disposition,
            coverageBasis: commercialDecisions.coverageBasis,
            rationale: commercialDecisions.rationale,
            confirmedAt: commercialDecisions.confirmedAt,
            supersededAt: commercialDecisions.supersededAt,
            supersedesDecisionId: commercialDecisions.supersedesDecisionId,
            actorUserId: commercialDecisions.createdByUserId,
            actorName: users.name,
          })
          .from(commercialDecisions)
          .innerJoin(users, eq(users.id, commercialDecisions.createdByUserId))
          .where(
            and(
              inArray(commercialDecisions.requestId, requestIds),
              eq(commercialDecisions.projectId, projectId),
            ),
          )
          .orderBy(desc(commercialDecisions.confirmedAt))
          .limit(requestIds.length * MAX_DECISIONS_PER_REQUEST)
      : [],
  ]);

  return rows.map((row) => {
    const seenRequestScope = new Set<string>();
    const seenDecisionScope = new Set<string>();
    const currentDecision = row.decisionId
      ? {
          id: row.decisionId,
          disposition: row.disposition!,
          coverageBasis: row.coverageBasis,
          rationale: row.rationale,
          confirmedAt: row.confirmedAt!,
          supersedesDecisionId: row.supersedesDecisionId,
          actorUserId: row.decisionActorUserId!,
          actorName: row.decisionActorName!,
          scopeItems: decisionScopes
            .filter((scope) => {
              if (scope.decisionId !== row.decisionId) return false;
              const key = `${scope.role}:${scope.scopeItemId}`;
              if (seenDecisionScope.has(key)) return false;
              seenDecisionScope.add(key);
              return true;
            })
            .map(({ scopeItemId, ...scope }) => ({
              id: scopeItemId,
              ...scope,
            })),
          anchors: decisionAnchors.filter(
            (anchor) => anchor.decisionId === row.decisionId,
          ),
        }
      : null;
    const contradictionWorkItemIds = new Set(
      activeLinks
        .filter(
          (link) =>
            link.requestId === row.id &&
            (link.supersededAt !== null ||
              row.disposition === "deferred" ||
              row.disposition === "rejected"),
        )
        .map((link) => link.workItemId),
    );
    return {
      ...row,
      currentDecision,
      affectedScopeItems: requestScopes
        .filter((scope) => {
          if (scope.requestId !== row.id) return false;
          if (seenRequestScope.has(scope.scopeItemId)) return false;
          seenRequestScope.add(scope.scopeItemId);
          return true;
        })
        .map(({ scopeItemId, ...scope }) => ({ id: scopeItemId, ...scope })),
      anchors: requestAnchors.filter((anchor) => anchor.requestId === row.id),
      impacts: impacts
        .filter((impact) => impact.requestId === row.id)
        .slice(0, 10),
      contradictionCount: contradictionWorkItemIds.size,
      linkedWorkItems: activeLinks
        .filter((link) => link.requestId === row.id)
        .filter(
          (link, index, all) =>
            all.findIndex(
              (candidate) => candidate.workItemId === link.workItemId,
            ) === index,
        )
        .map((link) => ({
          id: link.workItemId,
          number: link.workItemNumber,
          title: link.workItemTitle,
          status: link.workItemStatus,
        })),
      decisionHistory: histories.filter(
        (decision) => decision.requestId === row.id,
      ),
    };
  });
}

async function createEvidenceAnchors(
  transaction: Transaction,
  actorUserId: string,
  projectId: string,
  anchors: EvidenceAnchorInput[],
) {
  if (!anchors.length) return [];
  const sourceIds = [...new Set(anchors.map((anchor) => anchor.sourceId))];
  const sources = await transaction
    .select({
      id: commercialEvidenceSources.id,
      text: commercialEvidenceSources.extractedText,
    })
    .from(commercialEvidenceSources)
    .where(
      and(
        inArray(commercialEvidenceSources.id, sourceIds),
        eq(commercialEvidenceSources.projectId, projectId),
        eq(commercialEvidenceSources.parseState, "ready"),
      ),
    );
  if (sources.length !== sourceIds.length) throw notFound();
  const textBySource = new Map(
    sources.map((source) => [source.id, source.text]),
  );
  if (
    anchors.some((anchor) => {
      const text = textBySource.get(anchor.sourceId);
      return (
        !text ||
        anchor.endOffset <= anchor.startOffset ||
        anchor.endOffset > text.length
      );
    })
  ) {
    throw conflict(
      "evidence_anchor_invalid",
      "An evidence selection is outside the extracted source text.",
    );
  }
  const rows = anchors.map((anchor) => ({
    id: randomUUID(),
    projectId,
    sourceId: anchor.sourceId,
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset,
    label: anchor.label || null,
    createdByUserId: actorUserId,
  }));
  await transaction.insert(commercialEvidenceAnchors).values(rows);
  return rows.map((row) => row.id);
}

async function insertImpactAssessment(
  transaction: Transaction,
  actorUserId: string,
  projectId: string,
  requestId: string,
  decisionId: string | null,
  input: ImpactInput,
  supersedesImpactAssessmentId: string | null,
) {
  await assertImpactCapacity(transaction, requestId);
  const id = randomUUID();
  await transaction.insert(commercialImpactAssessments).values({
    id,
    projectId,
    requestId,
    decisionId,
    idempotencyKey: input.idempotencyKey,
    confidence: input.confidence,
    effortMinutes: input.effortMinutes,
    scheduleDeltaDays: input.scheduleDeltaDays,
    targetDate: input.targetDate,
    monetaryAmount: input.monetaryAmount,
    currencyCode: input.currencyCode,
    notes: input.notes,
    supersedesImpactAssessmentId,
    createdByUserId: actorUserId,
  });
  const anchorIds = await createEvidenceAnchors(
    transaction,
    actorUserId,
    projectId,
    input.anchors,
  );
  if (anchorIds.length) {
    await transaction.insert(commercialImpactAssessmentAnchors).values(
      anchorIds.map((evidenceAnchorId) => ({
        projectId,
        impactAssessmentId: id,
        evidenceAnchorId,
      })),
    );
  }
  return id;
}

async function assertScopeItems(
  transaction: Transaction,
  projectId: string,
  scopeItemIds: string[],
  requireActive: boolean,
) {
  if (!scopeItemIds.length) return;
  const rows = await transaction
    .select({ id: commercialScopeItems.id })
    .from(commercialScopeItems)
    .where(
      and(
        inArray(commercialScopeItems.id, scopeItemIds),
        eq(commercialScopeItems.projectId, projectId),
        ...(requireActive ? [isNull(commercialScopeItems.archivedAt)] : []),
      ),
    );
  if (rows.length !== scopeItemIds.length) throw notFound();
}

async function assertRequestCapacity(
  transaction: Transaction,
  projectId: string,
) {
  const rows = await transaction
    .select({ total: count() })
    .from(commercialRequests)
    .where(eq(commercialRequests.projectId, projectId));
  if ((rows[0]?.total ?? 0) >= MAX_REQUESTS_PER_PROJECT) {
    throw conflict(
      "commercial_request_limit",
      `A project may contain at most ${MAX_REQUESTS_PER_PROJECT} commercial requests.`,
    );
  }
}

async function assertDecisionCapacity(
  transaction: Transaction,
  requestId: string,
) {
  const rows = await transaction
    .select({ total: count() })
    .from(commercialDecisions)
    .where(eq(commercialDecisions.requestId, requestId));
  if ((rows[0]?.total ?? 0) >= MAX_DECISIONS_PER_REQUEST) {
    throw conflict(
      "commercial_decision_limit",
      `A request may contain at most ${MAX_DECISIONS_PER_REQUEST} decision records.`,
    );
  }
}

async function assertImpactCapacity(
  transaction: Transaction,
  requestId: string,
) {
  const rows = await transaction
    .select({ total: count() })
    .from(commercialImpactAssessments)
    .where(eq(commercialImpactAssessments.requestId, requestId));
  if ((rows[0]?.total ?? 0) >= MAX_IMPACTS_PER_REQUEST) {
    throw conflict(
      "commercial_impact_limit",
      `A request may contain at most ${MAX_IMPACTS_PER_REQUEST} impact records.`,
    );
  }
}

function impactChangedFields(input: ImpactInput) {
  return [
    input.effortMinutes != null ? "effortMinutes" : null,
    input.scheduleDeltaDays != null ? "scheduleDeltaDays" : null,
    input.targetDate != null ? "targetDate" : null,
    input.monetaryAmount != null ? "monetaryAmount" : null,
    input.notes != null ? "notes" : null,
    input.anchors.length ? "anchors" : null,
  ].filter((value): value is string => value !== null);
}

async function getCommercialManagerAccess(
  database: Executor,
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  const access = await getProjectAccess(
    database,
    actor,
    workspaceId,
    projectId,
  );
  assertProjectManager(access, actor.userId);
  return access;
}

async function assertCommercialManage(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  entitlements: EntitlementPolicy,
) {
  await getCommercialManagerAccess(getDb(), actor, workspaceId, projectId);
  await entitlements.assertAllowed("commercial.baseline.manage", {
    userId: actor.userId,
    workspaceId,
  });
}

async function getWritableCommercialManager(
  transaction: Transaction,
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  const access = await assertWritableProject(
    transaction,
    actor,
    workspaceId,
    projectId,
  );
  assertProjectManager(access, actor.userId);
  return access;
}

async function lockProject(transaction: Transaction, projectId: string) {
  await transaction.execute(
    sql`select 1 from ${projects} where ${projects.id} = ${projectId} for update`,
  );
}

function conflict(code: string, message: string) {
  return new PlatformError(code, 409, message);
}
