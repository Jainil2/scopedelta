import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  max,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  commercialBaselineVersionDecisions,
  commercialBaselineVersionSources,
  commercialBaselineVersions,
  commercialBasisLinks,
  commercialDecisions,
  commercialEvidenceSources,
  commercialRequests,
  commercialScopeItemLineages,
  commercialScopeItemRevisions,
  commercialScopeItems,
  commercialScopeRevisionAnchors,
  projects,
  users,
} from "@/db/schema";
import type {
  ActivateCommercialBaselineVersionInput,
  CommercialHistoryFilters,
  CreateCommercialAmendmentInput,
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

const MAX_BASELINE_VERSIONS = 50;

export async function createCommercialAmendment(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateCommercialAmendmentInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  await assertAmendmentManage(actor, workspaceId, projectId, entitlements);
  const versionId = await getDb().transaction(async (transaction) => {
    await getWritableCommercialManager(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    await lockProject(transaction, projectId);
    await assertReadySource(transaction, projectId, input.sourceId);
    const current = await getCurrentBaselineVersion(transaction, projectId);
    if (!current) {
      throw conflict(
        "baseline_not_effective",
        "Make the initial baseline effective before preparing an amendment.",
      );
    }
    const existing = await transaction
      .select({ id: commercialBaselineVersions.id })
      .from(commercialBaselineVersions)
      .where(
        and(
          eq(commercialBaselineVersions.baselineId, current.baselineId),
          eq(commercialBaselineVersions.projectId, projectId),
          eq(commercialBaselineVersions.previousVersionId, current.id),
          eq(commercialBaselineVersions.sourceId, input.sourceId),
          eq(commercialBaselineVersions.label, input.label),
          eq(commercialBaselineVersions.state, "draft"),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0].id;
    const otherDraft = await transaction
      .select({ id: commercialBaselineVersions.id })
      .from(commercialBaselineVersions)
      .where(
        and(
          eq(commercialBaselineVersions.baselineId, current.baselineId),
          eq(commercialBaselineVersions.state, "draft"),
        ),
      )
      .limit(1);
    if (otherDraft[0]) {
      throw conflict(
        "baseline_draft_exists",
        "Finish the existing baseline amendment draft before preparing another.",
      );
    }
    await assertVersionCapacity(transaction, current.baselineId);

    const id = randomUUID();
    await transaction.insert(commercialBaselineVersions).values({
      id,
      projectId,
      baselineId: current.baselineId,
      sourceId: input.sourceId,
      previousVersionId: current.id,
      versionNumber: null,
      label: input.label,
      state: "draft",
      createdByUserId: actor.userId,
    });
    await copyVersionSources(
      transaction,
      projectId,
      current.id,
      id,
      input.sourceId,
    );
    await carryForwardScopeItems(
      transaction,
      actor.userId,
      projectId,
      current.id,
      id,
    );
    await linkFormalizedDecisions(
      transaction,
      projectId,
      id,
      input.decisionIds,
    );
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "commercial.baseline_version.drafted.v1",
      targetType: "commercial_baseline_version",
      targetId: id,
      metadata: {
        projectId,
        baselineId: current.baselineId,
        previousVersionId: current.id,
        sourceId: input.sourceId,
        decisionIds: input.decisionIds,
      },
    });
    return id;
  });
  return getCommercialBaselineVersion(actor, workspaceId, projectId, versionId);
}

export async function activateCommercialBaselineVersion(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  versionId: string,
  input: ActivateCommercialBaselineVersionInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  await assertAmendmentManage(actor, workspaceId, projectId, entitlements);
  await getDb().transaction(async (transaction) => {
    await getWritableCommercialManager(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    await lockProject(transaction, projectId);
    const rows = await transaction
      .select({
        id: commercialBaselineVersions.id,
        baselineId: commercialBaselineVersions.baselineId,
        previousVersionId: commercialBaselineVersions.previousVersionId,
        state: commercialBaselineVersions.state,
        versionNumber: commercialBaselineVersions.versionNumber,
      })
      .from(commercialBaselineVersions)
      .where(
        and(
          eq(commercialBaselineVersions.id, versionId),
          eq(commercialBaselineVersions.projectId, projectId),
        ),
      )
      .for("update")
      .limit(1);
    const version = rows[0];
    if (!version) throw notFound();
    if (version.state === "effective") return;
    if (version.state !== "draft") {
      throw conflict(
        "baseline_version_not_draft",
        "Only a draft baseline version can become effective.",
      );
    }
    const effectiveAt = input.effectiveAt
      ? new Date(input.effectiveAt)
      : new Date();
    if (effectiveAt.getTime() > Date.now()) {
      throw conflict(
        "baseline_effective_time_future",
        "A baseline version can become effective now or at an earlier recorded time.",
      );
    }
    const current = await getCurrentBaselineVersion(
      transaction,
      projectId,
      version.baselineId,
    );
    if (
      current?.effectiveAt &&
      effectiveAt.getTime() < current.effectiveAt.getTime()
    ) {
      throw conflict(
        "baseline_effective_time_order",
        "An amendment cannot become effective before the version it supersedes.",
      );
    }
    if (version.previousVersionId) {
      if (!current || current.id !== version.previousVersionId) {
        throw conflict(
          "baseline_chain_changed",
          "The effective baseline changed while this amendment was being prepared. Prepare a new amendment from the current version.",
        );
      }
      await assertCompleteLineage(
        transaction,
        projectId,
        versionId,
        current.id,
      );
    } else if (current) {
      throw conflict(
        "baseline_chain_changed",
        "This project already has an effective baseline version.",
      );
    } else {
      await assertInitialScope(transaction, projectId, versionId);
    }
    const nextVersionNumber = (current?.versionNumber ?? 0) + 1;
    if (current) {
      await transaction
        .update(commercialBaselineVersions)
        .set({ state: "superseded", supersededAt: effectiveAt })
        .where(eq(commercialBaselineVersions.id, current.id));
    }
    await transaction
      .update(commercialBaselineVersions)
      .set({
        state: "effective",
        versionNumber: nextVersionNumber,
        effectiveAt,
        effectiveByUserId: actor.userId,
      })
      .where(eq(commercialBaselineVersions.id, versionId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "commercial.baseline_version.effective.v1",
      targetType: "commercial_baseline_version",
      targetId: versionId,
      metadata: {
        projectId,
        baselineId: version.baselineId,
        previousVersionId: version.previousVersionId ?? "",
        versionNumber: String(nextVersionNumber),
      },
    });
  });
  return getCommercialBaselineVersion(actor, workspaceId, projectId, versionId);
}

export async function listCommercialHistory(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  filters: CommercialHistoryFilters,
) {
  await getCommercialManagerAccess(getDb(), actor, workspaceId, projectId);
  const where = eq(commercialBaselineVersions.projectId, projectId);
  const [versions, totals] = await Promise.all([
    getDb()
      .select({
        id: commercialBaselineVersions.id,
        baselineId: commercialBaselineVersions.baselineId,
        previousVersionId: commercialBaselineVersions.previousVersionId,
        versionNumber: commercialBaselineVersions.versionNumber,
        label: commercialBaselineVersions.label,
        state: commercialBaselineVersions.state,
        sourceId: commercialBaselineVersions.sourceId,
        sourceName: commercialEvidenceSources.name,
        recordedAt: commercialBaselineVersions.createdAt,
        effectiveAt: commercialBaselineVersions.effectiveAt,
        supersededAt: commercialBaselineVersions.supersededAt,
        createdByUserId: commercialBaselineVersions.createdByUserId,
        createdByName: users.name,
      })
      .from(commercialBaselineVersions)
      .innerJoin(
        commercialEvidenceSources,
        eq(commercialEvidenceSources.id, commercialBaselineVersions.sourceId),
      )
      .innerJoin(
        users,
        eq(users.id, commercialBaselineVersions.createdByUserId),
      )
      .where(where)
      .orderBy(
        desc(commercialBaselineVersions.effectiveAt),
        desc(commercialBaselineVersions.createdAt),
        desc(commercialBaselineVersions.id),
      )
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb()
      .select({ total: count() })
      .from(commercialBaselineVersions)
      .where(where),
  ]);
  const versionIds = versions.map((version) => version.id);
  const [lineageRows, decisionRows, scopeRows] = versionIds.length
    ? await Promise.all([
        getDb()
          .select({
            baselineVersionId: commercialScopeItemLineages.baselineVersionId,
            kind: commercialScopeItemLineages.kind,
            currentScopeItemId: commercialScopeItemLineages.currentScopeItemId,
            previousScopeItemId:
              commercialScopeItemLineages.previousScopeItemId,
          })
          .from(commercialScopeItemLineages)
          .where(
            inArray(commercialScopeItemLineages.baselineVersionId, versionIds),
          )
          .orderBy(
            asc(commercialScopeItemLineages.baselineVersionId),
            asc(commercialScopeItemLineages.kind),
            asc(commercialScopeItemLineages.currentScopeItemId),
          ),
        getDb()
          .select({
            baselineVersionId:
              commercialBaselineVersionDecisions.baselineVersionId,
            decisionId: commercialDecisions.id,
            disposition: commercialDecisions.disposition,
            requestTitle: commercialRequests.title,
            confirmedAt: commercialDecisions.confirmedAt,
            supersededAt: commercialDecisions.supersededAt,
          })
          .from(commercialBaselineVersionDecisions)
          .innerJoin(
            commercialDecisions,
            eq(
              commercialDecisions.id,
              commercialBaselineVersionDecisions.decisionId,
            ),
          )
          .innerJoin(
            commercialRequests,
            eq(commercialRequests.id, commercialDecisions.requestId),
          )
          .where(
            inArray(
              commercialBaselineVersionDecisions.baselineVersionId,
              versionIds,
            ),
          )
          .orderBy(desc(commercialDecisions.confirmedAt)),
        getDb()
          .select({
            id: commercialScopeItems.id,
            baselineVersionId: commercialScopeItems.baselineVersionId,
            archivedAt: commercialScopeItems.archivedAt,
          })
          .from(commercialScopeItems)
          .where(inArray(commercialScopeItems.baselineVersionId, versionIds))
          .orderBy(
            asc(commercialScopeItems.baselineVersionId),
            asc(commercialScopeItems.id),
          ),
      ])
    : [[], [], []];
  const scopeItemIds = scopeRows.map((row) => row.id);
  const latest = getDb()
    .select({
      scopeItemId: commercialScopeItemRevisions.scopeItemId,
      revisionNumber: max(commercialScopeItemRevisions.revisionNumber).as(
        "history_revision_number",
      ),
    })
    .from(commercialScopeItemRevisions)
    .where(
      scopeItemIds.length
        ? inArray(commercialScopeItemRevisions.scopeItemId, scopeItemIds)
        : sql`false`,
    )
    .groupBy(commercialScopeItemRevisions.scopeItemId)
    .as("history_latest_revisions");
  const [historyItems, workCounts, sourceRows] = versionIds.length
    ? await Promise.all([
        getDb()
          .select({
            id: commercialScopeItemRevisions.scopeItemId,
            scopeKind: commercialScopeItemRevisions.kind,
            title: commercialScopeItemRevisions.title,
          })
          .from(commercialScopeItemRevisions)
          .innerJoin(
            latest,
            and(
              eq(latest.scopeItemId, commercialScopeItemRevisions.scopeItemId),
              eq(
                latest.revisionNumber,
                commercialScopeItemRevisions.revisionNumber,
              ),
            ),
          ),
        getDb()
          .select({
            scopeItemId: commercialScopeItemRevisions.scopeItemId,
            total: sql<number>`count(distinct ${commercialBasisLinks.workItemId})::int`,
          })
          .from(commercialScopeItemRevisions)
          .innerJoin(
            commercialBasisLinks,
            eq(
              commercialBasisLinks.scopeItemRevisionId,
              commercialScopeItemRevisions.id,
            ),
          )
          .where(
            scopeItemIds.length
              ? inArray(commercialScopeItemRevisions.scopeItemId, scopeItemIds)
              : sql`false`,
          )
          .groupBy(commercialScopeItemRevisions.scopeItemId),
        getDb()
          .select({
            baselineVersionId:
              commercialBaselineVersionSources.baselineVersionId,
            id: commercialEvidenceSources.id,
            name: commercialEvidenceSources.name,
          })
          .from(commercialBaselineVersionSources)
          .innerJoin(
            commercialEvidenceSources,
            eq(
              commercialEvidenceSources.id,
              commercialBaselineVersionSources.sourceId,
            ),
          )
          .where(
            inArray(
              commercialBaselineVersionSources.baselineVersionId,
              versionIds,
            ),
          )
          .orderBy(
            asc(commercialBaselineVersionSources.baselineVersionId),
            asc(commercialEvidenceSources.createdAt),
          ),
      ])
    : [[], [], []];
  const historyItemById = new Map(historyItems.map((item) => [item.id, item]));
  const lineageByItemId = new Map(
    lineageRows.map((row) => [row.currentScopeItemId, row.kind]),
  );
  const workCountByItemId = new Map(
    workCounts.map((row) => [row.scopeItemId, row.total]),
  );
  return {
    data: versions.map((version) => ({
      ...version,
      scopeItems: scopeRows.filter(
        (row) => row.baselineVersionId === version.id,
      ).length,
      items: scopeRows
        .filter((row) => row.baselineVersionId === version.id)
        .flatMap((row) => {
          const item = historyItemById.get(row.id);
          return item
            ? [
                {
                  ...row,
                  ...item,
                  lineageKind: lineageByItemId.get(row.id) ?? null,
                  workLinks: workCountByItemId.get(row.id) ?? 0,
                },
              ]
            : [];
        }),
      sources: sourceRows.filter((row) => row.baselineVersionId === version.id),
      lineage: lineageRows
        .filter((row) => row.baselineVersionId === version.id)
        .reduce<Partial<Record<(typeof lineageRows)[number]["kind"], number>>>(
          (totals, row) => ({
            ...totals,
            [row.kind]: (totals[row.kind] ?? 0) + 1,
          }),
          {},
        ),
      changes: lineageRows
        .filter((row) => row.baselineVersionId === version.id)
        .flatMap((row) => {
          const item = historyItemById.get(row.currentScopeItemId);
          return item
            ? [
                {
                  ...row,
                  scopeKind: item.scopeKind,
                  title: item.title,
                },
              ]
            : [];
        }),
      decisions: decisionRows.filter(
        (row) => row.baselineVersionId === version.id,
      ),
    })),
    page: {
      number: filters.page,
      size: filters.pageSize,
      total: totals[0]?.total ?? 0,
      pages: Math.max(1, Math.ceil((totals[0]?.total ?? 0) / filters.pageSize)),
    },
  };
}

export async function getCommercialBaselineVersion(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  versionId: string,
) {
  await getCommercialManagerAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({
      id: commercialBaselineVersions.id,
      baselineId: commercialBaselineVersions.baselineId,
      previousVersionId: commercialBaselineVersions.previousVersionId,
      versionNumber: commercialBaselineVersions.versionNumber,
      label: commercialBaselineVersions.label,
      state: commercialBaselineVersions.state,
      sourceId: commercialBaselineVersions.sourceId,
      recordedAt: commercialBaselineVersions.createdAt,
      effectiveAt: commercialBaselineVersions.effectiveAt,
      supersededAt: commercialBaselineVersions.supersededAt,
    })
    .from(commercialBaselineVersions)
    .where(
      and(
        eq(commercialBaselineVersions.id, versionId),
        eq(commercialBaselineVersions.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function assertDraftBaselineVersion(
  transaction: Transaction,
  projectId: string,
  versionId: string,
) {
  const rows = await transaction
    .select({
      id: commercialBaselineVersions.id,
      previousVersionId: commercialBaselineVersions.previousVersionId,
      state: commercialBaselineVersions.state,
    })
    .from(commercialBaselineVersions)
    .where(
      and(
        eq(commercialBaselineVersions.id, versionId),
        eq(commercialBaselineVersions.projectId, projectId),
      ),
    )
    .for("update")
    .limit(1);
  if (!rows[0]) throw notFound();
  if (rows[0].state !== "draft") {
    throw conflict(
      "baseline_version_immutable",
      "Effective and historical baseline versions cannot be changed. Prepare an amendment instead.",
    );
  }
  return rows[0];
}

export async function getBaselineVersionEvidenceSourceIds(
  transaction: Transaction,
  projectId: string,
  versionId: string,
) {
  const rows = await transaction
    .select({ sourceId: commercialBaselineVersionSources.sourceId })
    .from(commercialBaselineVersionSources)
    .where(
      and(
        eq(commercialBaselineVersionSources.projectId, projectId),
        eq(commercialBaselineVersionSources.baselineVersionId, versionId),
      ),
    );
  if (!rows.length) throw notFound();
  return rows.map((row) => row.sourceId);
}

async function carryForwardScopeItems(
  transaction: Transaction,
  actorUserId: string,
  projectId: string,
  previousVersionId: string,
  currentVersionId: string,
) {
  const latest = transaction
    .select({
      scopeItemId: commercialScopeItemRevisions.scopeItemId,
      revisionNumber: max(commercialScopeItemRevisions.revisionNumber).as(
        "carry_revision_number",
      ),
    })
    .from(commercialScopeItemRevisions)
    .where(eq(commercialScopeItemRevisions.projectId, projectId))
    .groupBy(commercialScopeItemRevisions.scopeItemId)
    .as("carry_latest_revisions");
  const previousItems = await transaction
    .select({
      id: commercialScopeItems.id,
      materialBasisScopeItemId: commercialScopeItems.materialBasisScopeItemId,
      revisionId: commercialScopeItemRevisions.id,
      kind: commercialScopeItemRevisions.kind,
      title: commercialScopeItemRevisions.title,
      details: commercialScopeItemRevisions.details,
    })
    .from(commercialScopeItems)
    .innerJoin(latest, eq(latest.scopeItemId, commercialScopeItems.id))
    .innerJoin(
      commercialScopeItemRevisions,
      and(
        eq(commercialScopeItemRevisions.scopeItemId, commercialScopeItems.id),
        eq(commercialScopeItemRevisions.revisionNumber, latest.revisionNumber),
      ),
    )
    .where(
      and(
        eq(commercialScopeItems.projectId, projectId),
        eq(commercialScopeItems.baselineVersionId, previousVersionId),
        isNull(commercialScopeItems.archivedAt),
      ),
    )
    .orderBy(asc(commercialScopeItems.id));
  if (!previousItems.length) return;
  const anchorRows = await transaction
    .select({
      revisionId: commercialScopeRevisionAnchors.scopeItemRevisionId,
      evidenceAnchorId: commercialScopeRevisionAnchors.evidenceAnchorId,
    })
    .from(commercialScopeRevisionAnchors)
    .where(
      inArray(
        commercialScopeRevisionAnchors.scopeItemRevisionId,
        previousItems.map((item) => item.revisionId),
      ),
    );
  const copies = previousItems.map((item) => ({
    previous: item,
    itemId: randomUUID(),
    revisionId: randomUUID(),
  }));
  await transaction.insert(commercialScopeItems).values(
    copies.map(({ previous, itemId }) => ({
      id: itemId,
      projectId,
      baselineVersionId: currentVersionId,
      materialBasisScopeItemId: previous.materialBasisScopeItemId,
      idempotencyKey: randomUUID(),
      createdByUserId: actorUserId,
    })),
  );
  await transaction.insert(commercialScopeItemRevisions).values(
    copies.map(({ previous, itemId, revisionId }) => ({
      id: revisionId,
      projectId,
      scopeItemId: itemId,
      idempotencyKey: randomUUID(),
      revisionNumber: 1,
      kind: previous.kind,
      title: previous.title,
      details: previous.details,
      createdByUserId: actorUserId,
    })),
  );
  const carriedAnchors = copies.flatMap(({ previous, revisionId }) =>
    anchorRows
      .filter((anchor) => anchor.revisionId === previous.revisionId)
      .map((anchor) => ({
        projectId,
        scopeItemRevisionId: revisionId,
        evidenceAnchorId: anchor.evidenceAnchorId,
      })),
  );
  if (carriedAnchors.length) {
    await transaction
      .insert(commercialScopeRevisionAnchors)
      .values(carriedAnchors);
  }
  await transaction.insert(commercialScopeItemLineages).values(
    copies.map(({ previous, itemId }) => ({
      id: randomUUID(),
      projectId,
      baselineVersionId: currentVersionId,
      previousScopeItemId: previous.id,
      currentScopeItemId: itemId,
      kind: "carried_forward" as const,
      createdByUserId: actorUserId,
    })),
  );
}

async function copyVersionSources(
  transaction: Transaction,
  projectId: string,
  previousVersionId: string,
  currentVersionId: string,
  amendmentSourceId: string,
) {
  const sources = await transaction
    .select({ sourceId: commercialBaselineVersionSources.sourceId })
    .from(commercialBaselineVersionSources)
    .where(
      and(
        eq(commercialBaselineVersionSources.projectId, projectId),
        eq(
          commercialBaselineVersionSources.baselineVersionId,
          previousVersionId,
        ),
      ),
    );
  const sourceIds = [
    ...new Set([
      ...sources.map((source) => source.sourceId),
      amendmentSourceId,
    ]),
  ];
  await transaction.insert(commercialBaselineVersionSources).values(
    sourceIds.map((sourceId) => ({
      projectId,
      baselineVersionId: currentVersionId,
      sourceId,
    })),
  );
}

async function linkFormalizedDecisions(
  transaction: Transaction,
  projectId: string,
  versionId: string,
  decisionIds: string[],
) {
  const uniqueDecisionIds = [...new Set(decisionIds)];
  if (!uniqueDecisionIds.length) return;
  const decisions = await transaction
    .select({ id: commercialDecisions.id })
    .from(commercialDecisions)
    .where(
      and(
        eq(commercialDecisions.projectId, projectId),
        inArray(commercialDecisions.id, uniqueDecisionIds),
      ),
    );
  if (decisions.length !== uniqueDecisionIds.length) throw notFound();
  await transaction.insert(commercialBaselineVersionDecisions).values(
    uniqueDecisionIds.map((decisionId) => ({
      projectId,
      baselineVersionId: versionId,
      decisionId,
    })),
  );
}

async function assertCompleteLineage(
  transaction: Transaction,
  projectId: string,
  versionId: string,
  previousVersionId: string,
) {
  const [previousTotals, currentTotals, lineageTotals] = await Promise.all([
    transaction
      .select({ total: count() })
      .from(commercialScopeItems)
      .where(
        and(
          eq(commercialScopeItems.projectId, projectId),
          eq(commercialScopeItems.baselineVersionId, previousVersionId),
          isNull(commercialScopeItems.archivedAt),
        ),
      ),
    transaction
      .select({ total: count() })
      .from(commercialScopeItems)
      .where(
        and(
          eq(commercialScopeItems.projectId, projectId),
          eq(commercialScopeItems.baselineVersionId, versionId),
        ),
      ),
    transaction
      .select({
        total: count(),
        previousTotal: sql<number>`count(${commercialScopeItemLineages.previousScopeItemId})::int`,
      })
      .from(commercialScopeItemLineages)
      .where(
        and(
          eq(commercialScopeItemLineages.projectId, projectId),
          eq(commercialScopeItemLineages.baselineVersionId, versionId),
        ),
      ),
  ]);
  if (
    (previousTotals[0]?.total ?? 0) !==
      (lineageTotals[0]?.previousTotal ?? 0) ||
    (currentTotals[0]?.total ?? 0) !== (lineageTotals[0]?.total ?? 0)
  ) {
    throw conflict(
      "baseline_lineage_incomplete",
      "Every prior and draft scope item must have one explicit lineage outcome before activation.",
    );
  }
}

async function assertInitialScope(
  transaction: Transaction,
  projectId: string,
  versionId: string,
) {
  const rows = await transaction
    .select({ total: count() })
    .from(commercialScopeItems)
    .where(
      and(
        eq(commercialScopeItems.projectId, projectId),
        eq(commercialScopeItems.baselineVersionId, versionId),
        isNull(commercialScopeItems.archivedAt),
      ),
    );
  if (!(rows[0]?.total ?? 0)) {
    throw conflict(
      "baseline_scope_required",
      "Add at least one scope item before making the initial baseline effective.",
    );
  }
}

async function getCurrentBaselineVersion(
  transaction: Transaction,
  projectId: string,
  baselineId?: string,
) {
  const conditions = [
    eq(commercialBaselineVersions.projectId, projectId),
    eq(commercialBaselineVersions.state, "effective" as const),
  ];
  if (baselineId)
    conditions.push(eq(commercialBaselineVersions.baselineId, baselineId));
  const rows = await transaction
    .select({
      id: commercialBaselineVersions.id,
      baselineId: commercialBaselineVersions.baselineId,
      versionNumber: commercialBaselineVersions.versionNumber,
      effectiveAt: commercialBaselineVersions.effectiveAt,
    })
    .from(commercialBaselineVersions)
    .where(and(...conditions))
    .for("update")
    .limit(1);
  return rows[0] ?? null;
}

async function assertReadySource(
  transaction: Transaction,
  projectId: string,
  sourceId: string,
) {
  const rows = await transaction
    .select({ state: commercialEvidenceSources.parseState })
    .from(commercialEvidenceSources)
    .where(
      and(
        eq(commercialEvidenceSources.id, sourceId),
        eq(commercialEvidenceSources.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  if (rows[0].state !== "ready") {
    throw conflict(
      "source_not_ready",
      "Resolve the amendment source parsing issue before preparing a baseline version.",
    );
  }
}

async function assertVersionCapacity(
  transaction: Transaction,
  baselineId: string,
) {
  const rows = await transaction
    .select({ total: count() })
    .from(commercialBaselineVersions)
    .where(eq(commercialBaselineVersions.baselineId, baselineId));
  if ((rows[0]?.total ?? 0) >= MAX_BASELINE_VERSIONS) {
    throw conflict(
      "baseline_version_limit",
      `A commercial baseline may contain at most ${MAX_BASELINE_VERSIONS} versions.`,
    );
  }
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

async function assertAmendmentManage(
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
