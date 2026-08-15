import "server-only";

import { createHash } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, max, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  commercialBaselineVersions,
  commercialBasisLinks,
  commercialDecisions,
  commercialEvidenceAnchors,
  commercialEvidenceSources,
  commercialRequestAnchors,
  commercialRequests,
  commercialScopeItemRevisions,
  commercialScopeItems,
  milestones,
  workItemDependencies,
  workItems,
  type AiJobKind,
} from "@/db/schema";
import type { AiJobTarget } from "@/lib/ai/contracts";
import { getAiConfig } from "@/lib/env";
import { notFound, PlatformError } from "@/lib/platform-errors";
import { assertProjectManager, getProjectAccess } from "@/server/delivery";
import {
  getDeliveryEvidenceTrace,
  getEngineeringCoverage,
} from "@/server/engineering-delivery";
import type { UserActor } from "@/server/workspaces";

export type AiEvidence = {
  type: string;
  label: string;
  recordId?: string;
};

export type AiContextSnapshot = {
  kind: AiJobKind;
  targetLabel: string;
  facts: Array<{
    evidenceKey: string;
    type: string;
    label: string;
    content: unknown;
  }>;
  deterministicFacts?: unknown;
  truncated: boolean;
};

export type AssembledAiContext = {
  snapshot: AiContextSnapshot;
  evidenceMap: Record<string, AiEvidence>;
  fingerprint: string;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contextFingerprint(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function withoutRecordIdentifiers(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRecordIdentifiers);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([key]) => key !== "id" && !key.endsWith("Id") && !key.endsWith("Ids"),
      )
      .map(([key, item]) => [key, withoutRecordIdentifiers(item)]),
  );
}

function boundedContext(
  kind: AiJobKind,
  targetLabel: string,
  candidates: Array<
    Omit<AiContextSnapshot["facts"][number], "evidenceKey"> & {
      recordId?: string;
    }
  >,
  deterministicFacts?: unknown,
): AssembledAiContext {
  const limit = getAiConfig().contextCharacters;
  const facts: AiContextSnapshot["facts"] = [];
  const evidenceMap: Record<string, AiEvidence> = {};
  let truncated = false;
  for (const [index, candidate] of candidates.entries()) {
    const evidenceKey =
      `ev_${candidate.type}_${String(index + 1).padStart(3, "0")}`
        .toLowerCase()
        .replaceAll(/[^a-z0-9_]/g, "_");
    const next = {
      evidenceKey,
      type: candidate.type,
      label: candidate.label,
      content: withoutRecordIdentifiers(candidate.content),
    };
    const projected = {
      kind,
      targetLabel,
      facts: [...facts, next],
      deterministicFacts,
    };
    if (JSON.stringify(projected).length > limit) {
      truncated = true;
      break;
    }
    facts.push(next);
    evidenceMap[evidenceKey] = {
      type: candidate.type,
      label: candidate.label,
      recordId: candidate.recordId,
    };
  }
  if (!facts.length) {
    throw new PlatformError(
      "ai_context_too_large",
      422,
      "The selected context cannot fit within the configured AI limit.",
    );
  }
  const snapshot = { kind, targetLabel, facts, deterministicFacts, truncated };
  return {
    snapshot,
    evidenceMap,
    fingerprint: contextFingerprint({ snapshot, evidenceMap }),
  };
}

async function scopeChangeContext(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  requestId: string,
) {
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  assertProjectManager(access, actor.userId);
  const db = getDb();
  const latestScopeRevisions = db
    .select({
      scopeItemId: commercialScopeItemRevisions.scopeItemId,
      revisionNumber: max(commercialScopeItemRevisions.revisionNumber).as(
        "ai_latest_scope_revision_number",
      ),
    })
    .from(commercialScopeItemRevisions)
    .where(eq(commercialScopeItemRevisions.projectId, projectId))
    .groupBy(commercialScopeItemRevisions.scopeItemId)
    .as("ai_latest_scope_revisions");
  const [
    requestRows,
    decisionRows,
    requestRowsRelated,
    baselineRows,
    scopeRows,
    workRows,
    anchorRows,
    coverage,
  ] = await Promise.all([
    db
      .select()
      .from(commercialRequests)
      .where(
        and(
          eq(commercialRequests.id, requestId),
          eq(commercialRequests.projectId, projectId),
        ),
      )
      .limit(1),
    db
      .select({
        id: commercialDecisions.id,
        disposition: commercialDecisions.disposition,
        coverageBasis: commercialDecisions.coverageBasis,
        rationale: commercialDecisions.rationale,
        confirmedAt: commercialDecisions.confirmedAt,
        supersededAt: commercialDecisions.supersededAt,
      })
      .from(commercialDecisions)
      .where(
        and(
          eq(commercialDecisions.projectId, projectId),
          eq(commercialDecisions.requestId, requestId),
        ),
      )
      .orderBy(desc(commercialDecisions.confirmedAt))
      .limit(50),
    db
      .select({
        id: commercialRequests.id,
        title: commercialRequests.title,
        requestText: commercialRequests.requestText,
        state: commercialRequests.state,
        receivedAt: commercialRequests.receivedAt,
      })
      .from(commercialRequests)
      .where(eq(commercialRequests.projectId, projectId))
      .orderBy(desc(commercialRequests.receivedAt))
      .limit(30),
    db
      .select({
        id: commercialBaselineVersions.id,
        label: commercialBaselineVersions.label,
        versionNumber: commercialBaselineVersions.versionNumber,
        state: commercialBaselineVersions.state,
        effectiveAt: commercialBaselineVersions.effectiveAt,
      })
      .from(commercialBaselineVersions)
      .where(
        and(
          eq(commercialBaselineVersions.projectId, projectId),
          eq(commercialBaselineVersions.state, "effective"),
        ),
      )
      .orderBy(desc(commercialBaselineVersions.createdAt))
      .limit(20),
    db
      .select({
        id: commercialScopeItemRevisions.id,
        title: commercialScopeItemRevisions.title,
        details: commercialScopeItemRevisions.details,
        kind: commercialScopeItemRevisions.kind,
        revisionNumber: commercialScopeItemRevisions.revisionNumber,
        baselineLabel: commercialBaselineVersions.label,
        baselineVersionNumber: commercialBaselineVersions.versionNumber,
        baselineState: commercialBaselineVersions.state,
        baselineEffectiveAt: commercialBaselineVersions.effectiveAt,
      })
      .from(commercialScopeItemRevisions)
      .innerJoin(
        commercialScopeItems,
        eq(commercialScopeItems.id, commercialScopeItemRevisions.scopeItemId),
      )
      .innerJoin(
        latestScopeRevisions,
        and(
          eq(
            latestScopeRevisions.scopeItemId,
            commercialScopeItemRevisions.scopeItemId,
          ),
          eq(
            latestScopeRevisions.revisionNumber,
            commercialScopeItemRevisions.revisionNumber,
          ),
        ),
      )
      .innerJoin(
        commercialBaselineVersions,
        eq(
          commercialBaselineVersions.id,
          commercialScopeItems.baselineVersionId,
        ),
      )
      .where(
        and(
          eq(commercialScopeItemRevisions.projectId, projectId),
          eq(commercialBaselineVersions.state, "effective"),
          isNull(commercialScopeItems.archivedAt),
        ),
      )
      .orderBy(asc(commercialScopeItemRevisions.title))
      .limit(100),
    db
      .select({
        id: workItems.id,
        number: workItems.number,
        title: workItems.title,
        description: workItems.description,
        status: workItems.status,
        purpose: workItems.purpose,
        basisType: commercialBasisLinks.basisType,
        decisionId: commercialBasisLinks.decisionId,
      })
      .from(workItems)
      .leftJoin(
        commercialBasisLinks,
        eq(commercialBasisLinks.workItemId, workItems.id),
      )
      .where(eq(workItems.projectId, projectId))
      .orderBy(asc(workItems.number))
      .limit(100),
    db
      .select({
        id: commercialEvidenceAnchors.id,
        label: commercialEvidenceAnchors.label,
        sourceName: commercialEvidenceSources.name,
        excerpt: sql<string>`substring(${commercialEvidenceSources.extractedText} from ${commercialEvidenceAnchors.startOffset} + 1 for ${commercialEvidenceAnchors.endOffset} - ${commercialEvidenceAnchors.startOffset})`,
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
          eq(commercialRequestAnchors.projectId, projectId),
          eq(commercialRequestAnchors.requestId, requestId),
        ),
      )
      .orderBy(asc(commercialEvidenceAnchors.startOffset))
      .limit(50),
    getEngineeringCoverage(actor, workspaceId, projectId, {
      page: 1,
      pageSize: 100,
    }),
  ]);
  const request = requestRows[0];
  if (!request) throw notFound();
  const candidates = [
    {
      type: "request",
      label: request.title,
      recordId: request.id,
      content: {
        title: request.title,
        requestText: request.requestText,
        state: request.state,
        externalRequester: request.externalRequester,
        receivedAt: request.receivedAt,
      },
    },
    ...decisionRows.map((item) => ({
      type: "decision",
      label: `${item.disposition} decision`,
      recordId: item.id,
      content: {
        disposition: item.disposition,
        coverageBasis: item.coverageBasis,
        rationale: item.rationale,
        confirmedAt: item.confirmedAt,
        current: item.supersededAt === null,
      },
    })),
    ...anchorRows.map((item) => ({
      type: "evidence_anchor",
      label: item.label || item.sourceName,
      recordId: item.id,
      content: {
        source: item.sourceName,
        label: item.label,
        excerpt: item.excerpt,
      },
    })),
    ...baselineRows.map((item) => ({
      type: "baseline",
      label: item.label,
      recordId: item.id,
      content: {
        label: item.label,
        versionNumber: item.versionNumber,
        state: item.state,
        effectiveAt: item.effectiveAt,
      },
    })),
    ...scopeRows.map((item) => ({
      type: "scope",
      label: item.title,
      recordId: item.id,
      content: {
        title: item.title,
        details: item.details,
        kind: item.kind,
        revisionNumber: item.revisionNumber,
        revisionState: "current",
        baseline: {
          label: item.baselineLabel,
          versionNumber: item.baselineVersionNumber,
          state: item.baselineState,
          effectiveAt: item.baselineEffectiveAt,
        },
      },
    })),
    ...requestRowsRelated
      .filter((item) => item.id !== requestId)
      .map((item) => ({
        type: "related_request",
        label: item.title,
        recordId: item.id,
        content: {
          title: item.title,
          requestText: item.requestText,
          state: item.state,
          receivedAt: item.receivedAt,
        },
      })),
    ...workRows.map((item) => ({
      type: "work",
      label: `Work ${item.number}: ${item.title}`,
      recordId: item.id,
      content: {
        identifier: `${access.key}-${item.number}`,
        title: item.title,
        description: item.description,
        status: item.status,
        purpose: item.purpose,
        commerciallyLinkedToRequest: decisionRows.some(
          (decision) => decision.id === item.decisionId,
        ),
      },
    })),
    ...coverage.items.map((item) => ({
      type: "delivery_evidence",
      label: item.identifier,
      recordId: item.workItemId || undefined,
      content: item,
    })),
  ];
  return boundedContext("scope_change_analysis", request.title, candidates, {
    engineeringCoverage: coverage.summary,
    truncated: coverage.truncated,
  });
}

async function deliveryRiskContext(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  milestoneId?: string,
) {
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  assertProjectManager(access, actor.userId);
  const db = getDb();
  const [coverage, requests, milestoneRows] = await Promise.all([
    getEngineeringCoverage(actor, workspaceId, projectId, {
      page: 1,
      pageSize: 100,
      milestoneId,
    }),
    db
      .select({
        id: commercialRequests.id,
        title: commercialRequests.title,
        state: commercialRequests.state,
        receivedAt: commercialRequests.receivedAt,
      })
      .from(commercialRequests)
      .where(eq(commercialRequests.projectId, projectId))
      .orderBy(desc(commercialRequests.receivedAt))
      .limit(100),
    milestoneId
      ? db
          .select({ id: milestones.id, name: milestones.name })
          .from(milestones)
          .where(
            and(
              eq(milestones.id, milestoneId),
              eq(milestones.projectId, projectId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  if (milestoneId && !milestoneRows[0]) throw notFound();
  const candidates = [
    ...coverage.items.map((item) => ({
      type: "coverage",
      label: item.identifier,
      recordId: item.workItemId || undefined,
      content: item,
    })),
    ...requests.map((item) => ({
      type: "commercial_request",
      label: item.title,
      recordId: item.id,
      content: {
        title: item.title,
        state: item.state,
        receivedAt: item.receivedAt,
      },
    })),
  ];
  return boundedContext(
    "delivery_risk_brief",
    milestoneRows[0]?.name || `${access.key} delivery`,
    candidates,
    { summary: coverage.summary, truncated: coverage.truncated },
  );
}

async function workQaContext(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
) {
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const trace = await getDeliveryEvidenceTrace(
    actor,
    workspaceId,
    projectId,
    workItemId,
  );
  const dependencyRows = await getDb()
    .select({
      id: workItemDependencies.id,
      blockerWorkItemId: workItemDependencies.blockerWorkItemId,
      blockedWorkItemId: workItemDependencies.blockedWorkItemId,
    })
    .from(workItemDependencies)
    .where(
      and(
        eq(workItemDependencies.projectId, projectId),
        or(
          eq(workItemDependencies.blockerWorkItemId, workItemId),
          eq(workItemDependencies.blockedWorkItemId, workItemId),
        ),
      ),
    )
    .limit(100);
  const relatedIds = [
    ...new Set(
      dependencyRows.map((dependency) =>
        dependency.blockerWorkItemId === workItemId
          ? dependency.blockedWorkItemId
          : dependency.blockerWorkItemId,
      ),
    ),
  ];
  const relatedWork = relatedIds.length
    ? await getDb()
        .select({
          id: workItems.id,
          number: workItems.number,
          title: workItems.title,
          status: workItems.status,
        })
        .from(workItems)
        .where(
          and(
            eq(workItems.projectId, projectId),
            inArray(workItems.id, relatedIds),
          ),
        )
    : [];
  const relatedById = new Map(relatedWork.map((item) => [item.id, item]));
  const candidates = [
    {
      type: "work",
      label: trace.work.identifier,
      recordId: trace.work.id,
      content: trace.work,
    },
    ...trace.commercialBasis.map((item) => ({
      type: "commercial_basis",
      label: item.scopeTitle || item.disposition || "Commercial basis",
      recordId: item.id,
      content: item,
    })),
    ...dependencyRows.flatMap((dependency) => {
      const relatedId =
        dependency.blockerWorkItemId === workItemId
          ? dependency.blockedWorkItemId
          : dependency.blockerWorkItemId;
      const related = relatedById.get(relatedId);
      if (!related) return [];
      return [
        {
          type: "dependency",
          label: `${access.key}-${related.number}: ${related.title}`,
          recordId: dependency.id,
          content: {
            direction:
              dependency.blockerWorkItemId === workItemId
                ? "blocks"
                : "blocked_by",
            identifier: `${access.key}-${related.number}`,
            title: related.title,
            status: related.status,
          },
        },
      ];
    }),
    ...trace.implementation.map((item) => ({
      type: "implementation",
      label: item.title,
      recordId: item.artifactId,
      content: item,
    })),
    ...trace.verification.map((item) => ({
      type: "verification",
      label: `${item.category}: ${item.result}`,
      recordId: item.id,
      content: item,
    })),
    ...trace.defects.map((item) => ({
      type: "defect",
      label: item.title,
      recordId: item.id,
      content: item,
    })),
    ...trace.acceptance.map((item) => ({
      type: "acceptance",
      label: item.title,
      recordId: item.id,
      content: item,
    })),
  ];
  return boundedContext(
    "work_context_qa_pack",
    trace.work.identifier,
    candidates,
  );
}

export async function assembleAiContext(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  target: AiJobTarget,
): Promise<AssembledAiContext> {
  if (target.kind === "scope_change_analysis") {
    return scopeChangeContext(actor, workspaceId, projectId, target.requestId);
  }
  if (target.kind === "delivery_risk_brief") {
    return deliveryRiskContext(
      actor,
      workspaceId,
      projectId,
      target.milestoneId,
    );
  }
  return workQaContext(actor, workspaceId, projectId, target.workItemId);
}

export async function currentAiContextFingerprint(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  target: AiJobTarget,
) {
  return (await assembleAiContext(actor, workspaceId, projectId, target))
    .fingerprint;
}
