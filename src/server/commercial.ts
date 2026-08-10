import { createHash, randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  max,
  notInArray,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  commercialBaselineVersions,
  commercialBaselineVersionSources,
  commercialBaselines,
  commercialBasisLinks,
  commercialDecisions,
  commercialEvidenceAnchors,
  commercialEvidenceSources,
  commercialRequests,
  commercialScopeItemRevisions,
  commercialScopeItemLineages,
  commercialScopeItems,
  commercialScopeRevisionAnchors,
  projects,
  workItems,
} from "@/db/schema";
import type {
  CommercialBasisLinkInput,
  CommercialDriftFilters,
  CreateCommercialBaselineInput,
  CreateCommercialScopeItemInput,
  CreateCommercialSourceInput,
  UpdateCommercialScopeItemInput,
  WorkPurposeInput,
} from "@/lib/commercial-validation";
import {
  communityEntitlementPolicy,
  type EntitlementPolicy,
} from "@/lib/entitlements";
import { notFound, PlatformError } from "@/lib/platform-errors";
import {
  decodeCommercialSource,
  parseCommercialSource,
} from "@/server/commercial-parser";
import {
  assertProjectManager,
  assertWritableProject,
  getProjectAccess,
  insertAudit,
  type Executor,
  type Transaction,
} from "@/server/delivery";
import type { UserActor } from "@/server/workspaces";
import {
  assertDraftBaselineVersion,
  getBaselineVersionEvidenceSourceIds,
} from "@/server/commercial-amendments";

const MAX_SCOPE_ITEMS_PER_BASELINE = 500;
const MAX_SOURCES_PER_PROJECT = 100;

export async function listCommercialOverview(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  await getCommercialManagerAccess(getDb(), actor, workspaceId, projectId);
  const latest = getDb()
    .select({
      scopeItemId: commercialScopeItemRevisions.scopeItemId,
      revisionNumber: max(commercialScopeItemRevisions.revisionNumber).as(
        "latest_revision_number",
      ),
    })
    .from(commercialScopeItemRevisions)
    .where(eq(commercialScopeItemRevisions.projectId, projectId))
    .groupBy(commercialScopeItemRevisions.scopeItemId)
    .as("latest_scope_revisions");

  const [sources, baselineRows] = await Promise.all([
    getDb()
      .select({
        id: commercialEvidenceSources.id,
        kind: commercialEvidenceSources.kind,
        name: commercialEvidenceSources.name,
        mediaType: commercialEvidenceSources.mediaType,
        byteSize: commercialEvidenceSources.byteSize,
        contentSha256: commercialEvidenceSources.contentSha256,
        parseState: commercialEvidenceSources.parseState,
        parseErrorCode: commercialEvidenceSources.parseErrorCode,
        createdAt: commercialEvidenceSources.createdAt,
      })
      .from(commercialEvidenceSources)
      .where(eq(commercialEvidenceSources.projectId, projectId))
      .orderBy(desc(commercialEvidenceSources.createdAt))
      .limit(MAX_SOURCES_PER_PROJECT),
    getDb()
      .select({
        id: commercialBaselines.id,
        versionId: commercialBaselineVersions.id,
        previousVersionId: commercialBaselineVersions.previousVersionId,
        versionNumber: commercialBaselineVersions.versionNumber,
        label: commercialBaselineVersions.label,
        state: commercialBaselineVersions.state,
        sourceId: commercialBaselineVersions.sourceId,
        effectiveAt: commercialBaselineVersions.effectiveAt,
        supersededAt: commercialBaselineVersions.supersededAt,
        createdAt: commercialBaselineVersions.createdAt,
      })
      .from(commercialBaselines)
      .innerJoin(
        commercialBaselineVersions,
        eq(commercialBaselineVersions.baselineId, commercialBaselines.id),
      )
      .where(eq(commercialBaselines.projectId, projectId))
      .orderBy(desc(commercialBaselineVersions.createdAt))
      .limit(50),
  ]);
  const selectedVersion =
    baselineRows.find((version) => version.state === "draft") ??
    baselineRows.find((version) => version.state === "effective") ??
    baselineRows[0];
  const items = selectedVersion
    ? await getDb()
        .select({
          id: commercialScopeItems.id,
          baselineVersionId: commercialScopeItems.baselineVersionId,
          lineageKind: commercialScopeItemLineages.kind,
          archivedAt: commercialScopeItems.archivedAt,
          revisionId: commercialScopeItemRevisions.id,
          revisionNumber: commercialScopeItemRevisions.revisionNumber,
          kind: commercialScopeItemRevisions.kind,
          title: commercialScopeItemRevisions.title,
          details: commercialScopeItemRevisions.details,
          updatedAt: commercialScopeItems.updatedAt,
        })
        .from(commercialScopeItems)
        .innerJoin(latest, eq(latest.scopeItemId, commercialScopeItems.id))
        .innerJoin(
          commercialScopeItemRevisions,
          and(
            eq(
              commercialScopeItemRevisions.scopeItemId,
              commercialScopeItems.id,
            ),
            eq(
              commercialScopeItemRevisions.revisionNumber,
              latest.revisionNumber,
            ),
          ),
        )
        .leftJoin(
          commercialScopeItemLineages,
          and(
            eq(
              commercialScopeItemLineages.currentScopeItemId,
              commercialScopeItems.id,
            ),
            eq(
              commercialScopeItemLineages.baselineVersionId,
              commercialScopeItems.baselineVersionId,
            ),
          ),
        )
        .where(
          and(
            eq(commercialScopeItems.projectId, projectId),
            eq(
              commercialScopeItems.baselineVersionId,
              selectedVersion.versionId,
            ),
          ),
        )
        .orderBy(
          asc(commercialScopeItemRevisions.kind),
          asc(commercialScopeItemRevisions.title),
        )
        .limit(MAX_SCOPE_ITEMS_PER_BASELINE)
    : [];

  const revisionIds = items.map((item) => item.revisionId);
  const anchors = revisionIds.length
    ? await getDb()
        .select({
          revisionId: commercialScopeRevisionAnchors.scopeItemRevisionId,
          id: commercialEvidenceAnchors.id,
          sourceId: commercialEvidenceAnchors.sourceId,
          startOffset: commercialEvidenceAnchors.startOffset,
          endOffset: commercialEvidenceAnchors.endOffset,
          label: commercialEvidenceAnchors.label,
        })
        .from(commercialScopeRevisionAnchors)
        .innerJoin(
          commercialEvidenceAnchors,
          eq(
            commercialEvidenceAnchors.id,
            commercialScopeRevisionAnchors.evidenceAnchorId,
          ),
        )
        .where(
          inArray(
            commercialScopeRevisionAnchors.scopeItemRevisionId,
            revisionIds,
          ),
        )
        .orderBy(asc(commercialEvidenceAnchors.startOffset))
    : [];

  return {
    sources,
    baseline: selectedVersion
      ? { ...selectedVersion, versions: baselineRows }
      : null,
    scopeItems: items.map((item) => ({
      ...item,
      anchors: anchors.filter(
        (anchor) => anchor.revisionId === item.revisionId,
      ),
    })),
    limits: {
      maximumSources: MAX_SOURCES_PER_PROJECT,
      maximumScopeItems: MAX_SCOPE_ITEMS_PER_BASELINE,
    },
  };
}

export async function getCommercialSource(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  sourceId: string,
) {
  await getCommercialManagerAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({
      id: commercialEvidenceSources.id,
      kind: commercialEvidenceSources.kind,
      name: commercialEvidenceSources.name,
      mediaType: commercialEvidenceSources.mediaType,
      byteSize: commercialEvidenceSources.byteSize,
      contentSha256: commercialEvidenceSources.contentSha256,
      parseState: commercialEvidenceSources.parseState,
      parseErrorCode: commercialEvidenceSources.parseErrorCode,
      extractedText: commercialEvidenceSources.extractedText,
      createdAt: commercialEvidenceSources.createdAt,
    })
    .from(commercialEvidenceSources)
    .where(
      and(
        eq(commercialEvidenceSources.id, sourceId),
        eq(commercialEvidenceSources.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function downloadCommercialSource(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  sourceId: string,
) {
  await getCommercialManagerAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({
      name: commercialEvidenceSources.name,
      mediaType: commercialEvidenceSources.mediaType,
      content: commercialEvidenceSources.originalContent,
    })
    .from(commercialEvidenceSources)
    .where(
      and(
        eq(commercialEvidenceSources.id, sourceId),
        eq(commercialEvidenceSources.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function createCommercialSource(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateCommercialSourceInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  await assertCommercialManage(actor, workspaceId, projectId, entitlements);
  const content = decodeCommercialSource(
    input.contentBase64,
    input.kind,
    input.name,
    input.mediaType,
  );
  const hash = createHash("sha256").update(content).digest("hex");
  const parsed = await parseCommercialSource(content, input.kind);
  const sourceId = await getDb().transaction(async (transaction) => {
    await getWritableCommercialManager(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    await lockProject(transaction, projectId);
    const existing = await transaction
      .select({
        id: commercialEvidenceSources.id,
        contentSha256: commercialEvidenceSources.contentSha256,
        kind: commercialEvidenceSources.kind,
      })
      .from(commercialEvidenceSources)
      .where(
        and(
          eq(commercialEvidenceSources.projectId, projectId),
          eq(commercialEvidenceSources.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) {
      if (existing[0].contentSha256 === hash && existing[0].kind === input.kind)
        return existing[0].id;
      throw conflict(
        "idempotency_conflict",
        "That idempotency key is already in use.",
      );
    }
    await assertSourceCapacity(transaction, projectId);
    const id = randomUUID();
    await transaction.insert(commercialEvidenceSources).values({
      id,
      projectId,
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      name: input.name,
      mediaType: input.mediaType,
      byteSize: content.byteLength,
      contentSha256: hash,
      originalContent: content,
      extractedText: parsed.text,
      parseState: parsed.state,
      parseErrorCode: parsed.errorCode,
      createdByUserId: actor.userId,
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "commercial.source.created.v1",
      targetType: "commercial_evidence_source",
      targetId: id,
      metadata: {
        projectId,
        kind: input.kind,
        parseState: parsed.state,
        byteSize: String(content.byteLength),
      },
    });
    return id;
  });
  return getCommercialSource(actor, workspaceId, projectId, sourceId);
}

export async function retryCommercialSource(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  sourceId: string,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  await assertCommercialManage(actor, workspaceId, projectId, entitlements);
  const rows = await getDb()
    .select({
      kind: commercialEvidenceSources.kind,
      content: commercialEvidenceSources.originalContent,
    })
    .from(commercialEvidenceSources)
    .where(
      and(
        eq(commercialEvidenceSources.id, sourceId),
        eq(commercialEvidenceSources.projectId, projectId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  const existingBaselineUse = await getDb()
    .select({ id: commercialBaselineVersions.id })
    .from(commercialBaselineVersions)
    .where(eq(commercialBaselineVersions.sourceId, sourceId))
    .limit(1);
  if (existingBaselineUse[0]) {
    throw conflict(
      "source_in_use",
      "Baseline evidence is immutable after the baseline is created.",
    );
  }
  const parsed = await parseCommercialSource(rows[0].content, rows[0].kind);
  await getDb().transaction(async (transaction) => {
    await getWritableCommercialManager(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    await lockProject(transaction, projectId);
    const baselineUse = await transaction
      .select({ id: commercialBaselineVersions.id })
      .from(commercialBaselineVersions)
      .where(eq(commercialBaselineVersions.sourceId, sourceId))
      .limit(1);
    if (baselineUse[0]) {
      throw conflict(
        "source_in_use",
        "Baseline evidence is immutable after the baseline is created.",
      );
    }
    await transaction
      .update(commercialEvidenceSources)
      .set({
        extractedText: parsed.text,
        parseState: parsed.state,
        parseErrorCode: parsed.errorCode,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(commercialEvidenceSources.id, sourceId),
          eq(commercialEvidenceSources.projectId, projectId),
        ),
      );
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "commercial.source.parsing.retried.v1",
      targetType: "commercial_evidence_source",
      targetId: sourceId,
      metadata: { projectId, parseState: parsed.state },
    });
  });
  return getCommercialSource(actor, workspaceId, projectId, sourceId);
}

export async function createCommercialBaseline(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateCommercialBaselineInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  await assertCommercialManage(actor, workspaceId, projectId, entitlements);
  const baselineId = await getDb().transaction(async (transaction) => {
    await getWritableCommercialManager(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    await lockProject(transaction, projectId);
    const source = await transaction
      .select({ state: commercialEvidenceSources.parseState })
      .from(commercialEvidenceSources)
      .where(
        and(
          eq(commercialEvidenceSources.id, input.sourceId),
          eq(commercialEvidenceSources.projectId, projectId),
        ),
      )
      .limit(1);
    if (!source[0]) throw notFound();
    if (source[0].state !== "ready") {
      throw conflict(
        "source_not_ready",
        "Resolve the source parsing issue before creating a baseline.",
      );
    }
    const existing = await transaction
      .select({
        id: commercialBaselines.id,
        sourceId: commercialBaselineVersions.sourceId,
      })
      .from(commercialBaselines)
      .innerJoin(
        commercialBaselineVersions,
        eq(commercialBaselineVersions.baselineId, commercialBaselines.id),
      )
      .where(eq(commercialBaselines.projectId, projectId))
      .limit(1);
    if (existing[0]) {
      if (existing[0].sourceId === input.sourceId) return existing[0].id;
      throw conflict(
        "baseline_exists",
        "This project already has its initial commercial baseline.",
      );
    }
    const id = randomUUID();
    const versionId = randomUUID();
    await transaction.insert(commercialBaselines).values({
      id,
      projectId,
      createdByUserId: actor.userId,
    });
    await transaction.insert(commercialBaselineVersions).values({
      id: versionId,
      projectId,
      baselineId: id,
      sourceId: input.sourceId,
      versionNumber: null,
      label: "Initial baseline",
      state: "draft",
      createdByUserId: actor.userId,
    });
    await transaction.insert(commercialBaselineVersionSources).values({
      projectId,
      baselineVersionId: versionId,
      sourceId: input.sourceId,
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "commercial.baseline.created.v1",
      targetType: "commercial_baseline",
      targetId: id,
      metadata: { projectId, versionId, sourceId: input.sourceId },
    });
    return id;
  });
  const overview = await listCommercialOverview(actor, workspaceId, projectId);
  if (overview.baseline?.id !== baselineId) throw notFound();
  return overview.baseline;
}

export async function createCommercialScopeItem(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateCommercialScopeItemInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  await assertCommercialManage(actor, workspaceId, projectId, entitlements);
  const itemId = await getDb().transaction(async (transaction) => {
    await getWritableCommercialManager(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    await lockProject(transaction, projectId);
    const existing = await transaction
      .select({ id: commercialScopeItems.id })
      .from(commercialScopeItems)
      .where(
        and(
          eq(commercialScopeItems.projectId, projectId),
          eq(commercialScopeItems.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0].id;
    const version = await assertDraftBaselineVersion(
      transaction,
      projectId,
      input.baselineVersionId,
    );
    await assertScopeCapacity(transaction, projectId, input.baselineVersionId);
    const id = randomUUID();
    const revisionId = randomUUID();
    await transaction.insert(commercialScopeItems).values({
      id,
      projectId,
      baselineVersionId: input.baselineVersionId,
      materialBasisScopeItemId: id,
      idempotencyKey: input.idempotencyKey,
      createdByUserId: actor.userId,
    });
    await transaction.insert(commercialScopeItemRevisions).values({
      id: revisionId,
      projectId,
      scopeItemId: id,
      idempotencyKey: input.revisionIdempotencyKey,
      revisionNumber: 1,
      kind: input.kind,
      title: input.title,
      details: input.details,
      createdByUserId: actor.userId,
    });
    await insertAnchors(
      transaction,
      actor.userId,
      projectId,
      input.baselineVersionId,
      revisionId,
      input.anchors,
    );
    if (version.previousVersionId) {
      await transaction.insert(commercialScopeItemLineages).values({
        id: randomUUID(),
        projectId,
        baselineVersionId: input.baselineVersionId,
        previousScopeItemId: null,
        currentScopeItemId: id,
        kind: "added",
        createdByUserId: actor.userId,
      });
    }
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "commercial.scope_item.created.v1",
      targetType: "commercial_scope_item",
      targetId: id,
      metadata: {
        projectId,
        baselineVersionId: input.baselineVersionId,
        revisionId,
        kind: input.kind,
      },
    });
    return id;
  });
  return getCommercialScopeItem(actor, workspaceId, projectId, itemId);
}

export async function updateCommercialScopeItem(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  itemId: string,
  input: UpdateCommercialScopeItemInput,
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
    const item = await transaction
      .select({
        id: commercialScopeItems.id,
        baselineVersionId: commercialScopeItems.baselineVersionId,
        archivedAt: commercialScopeItems.archivedAt,
      })
      .from(commercialScopeItems)
      .where(
        and(
          eq(commercialScopeItems.id, itemId),
          eq(commercialScopeItems.projectId, projectId),
        ),
      )
      .for("update")
      .limit(1);
    if (!item[0]) throw notFound();
    const version = await assertDraftBaselineVersion(
      transaction,
      projectId,
      item[0].baselineVersionId,
    );
    if (item[0].archivedAt) {
      throw conflict("scope_item_archived", "Restore this scope item first.");
    }
    const duplicate = await transaction
      .select({ id: commercialScopeItemRevisions.id })
      .from(commercialScopeItemRevisions)
      .where(
        and(
          eq(commercialScopeItemRevisions.scopeItemId, itemId),
          eq(commercialScopeItemRevisions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (duplicate[0]) return;
    const latest = await transaction
      .select({ number: max(commercialScopeItemRevisions.revisionNumber) })
      .from(commercialScopeItemRevisions)
      .where(eq(commercialScopeItemRevisions.scopeItemId, itemId));
    const revisionId = randomUUID();
    await transaction.insert(commercialScopeItemRevisions).values({
      id: revisionId,
      projectId,
      scopeItemId: itemId,
      idempotencyKey: input.idempotencyKey,
      revisionNumber: (latest[0]?.number ?? 0) + 1,
      kind: input.kind,
      title: input.title,
      details: input.details,
      createdByUserId: actor.userId,
    });
    await insertAnchors(
      transaction,
      actor.userId,
      projectId,
      item[0].baselineVersionId,
      revisionId,
      input.anchors,
    );
    await transaction
      .update(commercialScopeItems)
      .set({ materialBasisScopeItemId: itemId, updatedAt: new Date() })
      .where(eq(commercialScopeItems.id, itemId));
    if (version.previousVersionId) {
      await transaction
        .update(commercialScopeItemLineages)
        .set({ kind: "revised" })
        .where(
          and(
            eq(
              commercialScopeItemLineages.baselineVersionId,
              item[0].baselineVersionId,
            ),
            eq(commercialScopeItemLineages.currentScopeItemId, itemId),
            sql`${commercialScopeItemLineages.previousScopeItemId} is not null`,
          ),
        );
    }
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "commercial.scope_item.revised.v1",
      targetType: "commercial_scope_item",
      targetId: itemId,
      metadata: {
        projectId,
        revisionId,
        changedFields: ["kind", "title", "details", "anchors"],
      },
    });
  });
  return getCommercialScopeItem(actor, workspaceId, projectId, itemId);
}

export async function setCommercialScopeItemArchived(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  itemId: string,
  archived: boolean,
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
    const item = await transaction
      .select({
        baselineVersionId: commercialScopeItems.baselineVersionId,
      })
      .from(commercialScopeItems)
      .where(
        and(
          eq(commercialScopeItems.id, itemId),
          eq(commercialScopeItems.projectId, projectId),
        ),
      )
      .for("update")
      .limit(1);
    if (!item[0]) throw notFound();
    const version = await assertDraftBaselineVersion(
      transaction,
      projectId,
      item[0].baselineVersionId,
    );
    const rows = await transaction
      .update(commercialScopeItems)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(
        and(
          eq(commercialScopeItems.id, itemId),
          eq(commercialScopeItems.projectId, projectId),
        ),
      )
      .returning({ id: commercialScopeItems.id });
    if (!rows[0]) throw notFound();
    if (version.previousVersionId) {
      const latest = await transaction
        .select({ number: max(commercialScopeItemRevisions.revisionNumber) })
        .from(commercialScopeItemRevisions)
        .where(eq(commercialScopeItemRevisions.scopeItemId, itemId));
      await transaction
        .update(commercialScopeItemLineages)
        .set({
          kind: archived
            ? "retired"
            : (latest[0]?.number ?? 1) > 1
              ? "revised"
              : "carried_forward",
        })
        .where(
          and(
            eq(
              commercialScopeItemLineages.baselineVersionId,
              item[0].baselineVersionId,
            ),
            eq(commercialScopeItemLineages.currentScopeItemId, itemId),
            sql`${commercialScopeItemLineages.previousScopeItemId} is not null`,
          ),
        );
    }
    await insertAudit(transaction, actor, workspaceId, {
      eventType: archived
        ? "commercial.scope_item.archived.v1"
        : "commercial.scope_item.restored.v1",
      targetType: "commercial_scope_item",
      targetId: itemId,
      metadata: { projectId },
    });
  });
  return getCommercialScopeItem(actor, workspaceId, projectId, itemId);
}

export async function getWorkCommercialProvenance(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const work = await getDb()
    .select({
      id: workItems.id,
      purpose: workItems.purpose,
      status: workItems.status,
      archivedAt: workItems.archivedAt,
    })
    .from(workItems)
    .where(
      and(eq(workItems.id, workItemId), eq(workItems.projectId, projectId)),
    )
    .limit(1);
  if (!work[0]) throw notFound();
  const links = await getDb()
    .select({
      id: commercialBasisLinks.id,
      basisType: commercialBasisLinks.basisType,
      scopeItemId: commercialScopeItemRevisions.scopeItemId,
      scopeItemRevisionId: commercialScopeItemRevisions.id,
      revisionNumber: commercialScopeItemRevisions.revisionNumber,
      kind: commercialScopeItemRevisions.kind,
      title: commercialScopeItemRevisions.title,
      archivedAt: commercialScopeItems.archivedAt,
      decisionId: commercialDecisions.id,
      requestTitle: commercialRequests.title,
      disposition: commercialDecisions.disposition,
      coverageBasis: commercialDecisions.coverageBasis,
      decisionConfirmedAt: commercialDecisions.confirmedAt,
      decisionSupersededAt: commercialDecisions.supersededAt,
    })
    .from(commercialBasisLinks)
    .leftJoin(
      commercialScopeItemRevisions,
      eq(
        commercialScopeItemRevisions.id,
        commercialBasisLinks.scopeItemRevisionId,
      ),
    )
    .leftJoin(
      commercialScopeItems,
      eq(commercialScopeItems.id, commercialScopeItemRevisions.scopeItemId),
    )
    .leftJoin(
      commercialDecisions,
      eq(commercialDecisions.id, commercialBasisLinks.decisionId),
    )
    .leftJoin(
      commercialRequests,
      eq(commercialRequests.id, commercialDecisions.requestId),
    )
    .where(
      and(
        eq(commercialBasisLinks.projectId, projectId),
        eq(commercialBasisLinks.workItemId, workItemId),
      ),
    )
    .orderBy(asc(commercialBasisLinks.basisType), asc(commercialBasisLinks.id));
  const [currentScope, currentVersions] = await Promise.all([
    getDb()
      .select({
        materialBasisScopeItemId: commercialScopeItems.materialBasisScopeItemId,
      })
      .from(commercialScopeItems)
      .innerJoin(
        commercialBaselineVersions,
        eq(
          commercialBaselineVersions.id,
          commercialScopeItems.baselineVersionId,
        ),
      )
      .where(
        and(
          eq(commercialScopeItems.projectId, projectId),
          isNull(commercialScopeItems.archivedAt),
          eq(commercialBaselineVersions.state, "effective"),
        ),
      ),
    getDb()
      .select({ id: commercialBaselineVersions.id })
      .from(commercialBaselineVersions)
      .where(
        and(
          eq(commercialBaselineVersions.projectId, projectId),
          eq(commercialBaselineVersions.state, "effective"),
        ),
      )
      .limit(1),
  ]);
  const effectiveMaterialBasisIds = new Set(
    currentScope.map((item) => item.materialBasisScopeItemId),
  );
  const activeWork =
    work[0].archivedAt === null &&
    work[0].status !== "done" &&
    work[0].status !== "canceled";
  const projectedLinks = links.map((link) => ({
    ...link,
    effective:
      link.basisType === "baseline_scope_item"
        ? Boolean(
            link.scopeItemId && effectiveMaterialBasisIds.has(link.scopeItemId),
          )
        : link.decisionSupersededAt === null &&
          isAuthorizingDecision(link.disposition),
    stale:
      link.basisType === "baseline_scope_item" &&
      Boolean(currentVersions[0]) &&
      Boolean(link.scopeItemId) &&
      !effectiveMaterialBasisIds.has(link.scopeItemId!) &&
      activeWork,
    contradiction:
      link.basisType === "commercial_decision" &&
      activeWork &&
      (link.decisionSupersededAt !== null ||
        link.disposition === "deferred" ||
        link.disposition === "rejected"),
  }));
  return {
    ...work[0],
    state: commercialState(
      work[0].purpose,
      projectedLinks.filter((link) => link.effective).length,
      projectedLinks.filter((link) => link.stale).length,
    ),
    links: projectedLinks,
  };
}

export async function listCommercialBasisOptions(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  await getCommercialManagerAccess(getDb(), actor, workspaceId, projectId);
  const latest = getDb()
    .select({
      scopeItemId: commercialScopeItemRevisions.scopeItemId,
      revisionNumber: max(commercialScopeItemRevisions.revisionNumber).as(
        "latest_basis_revision_number",
      ),
    })
    .from(commercialScopeItemRevisions)
    .where(eq(commercialScopeItemRevisions.projectId, projectId))
    .groupBy(commercialScopeItemRevisions.scopeItemId)
    .as("latest_basis_options");
  const [scopeOptions, decisionOptions] = await Promise.all([
    getDb()
      .select({
        scopeItemId: commercialScopeItems.id,
        scopeItemRevisionId: commercialScopeItemRevisions.id,
        baselineVersionId: commercialScopeItems.baselineVersionId,
        baselineVersionNumber: commercialBaselineVersions.versionNumber,
        revisionNumber: commercialScopeItemRevisions.revisionNumber,
        kind: commercialScopeItemRevisions.kind,
        title: commercialScopeItemRevisions.title,
      })
      .from(commercialScopeItems)
      .innerJoin(
        commercialBaselineVersions,
        eq(
          commercialBaselineVersions.id,
          commercialScopeItems.baselineVersionId,
        ),
      )
      .innerJoin(latest, eq(latest.scopeItemId, commercialScopeItems.id))
      .innerJoin(
        commercialScopeItemRevisions,
        and(
          eq(commercialScopeItemRevisions.scopeItemId, commercialScopeItems.id),
          eq(
            commercialScopeItemRevisions.revisionNumber,
            latest.revisionNumber,
          ),
        ),
      )
      .where(
        and(
          eq(commercialScopeItems.projectId, projectId),
          isNull(commercialScopeItems.archivedAt),
          eq(commercialBaselineVersions.state, "effective"),
        ),
      )
      .orderBy(
        asc(commercialScopeItemRevisions.kind),
        asc(commercialScopeItemRevisions.title),
      )
      .limit(MAX_SCOPE_ITEMS_PER_BASELINE),
    getDb()
      .select({
        decisionId: commercialDecisions.id,
        requestId: commercialRequests.id,
        requestTitle: commercialRequests.title,
        disposition: commercialDecisions.disposition,
        coverageBasis: commercialDecisions.coverageBasis,
        confirmedAt: commercialDecisions.confirmedAt,
      })
      .from(commercialDecisions)
      .innerJoin(
        commercialRequests,
        eq(commercialRequests.id, commercialDecisions.requestId),
      )
      .where(
        and(
          eq(commercialDecisions.projectId, projectId),
          isNull(commercialDecisions.supersededAt),
          sql`${commercialDecisions.disposition} in ('covered', 'absorbed', 'swap', 'paid_change')`,
        ),
      )
      .orderBy(
        desc(commercialDecisions.confirmedAt),
        desc(commercialDecisions.id),
      )
      .limit(500),
  ]);
  return [
    ...scopeOptions.map((option) => ({
      basisType: "baseline_scope_item" as const,
      ...option,
    })),
    ...decisionOptions.map((option) => ({
      basisType: "commercial_decision" as const,
      ...option,
    })),
  ];
}

export async function updateWorkPurpose(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  input: WorkPurposeInput,
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
    const current = await transaction
      .select({ purpose: workItems.purpose })
      .from(workItems)
      .where(
        and(eq(workItems.id, workItemId), eq(workItems.projectId, projectId)),
      )
      .limit(1);
    if (!current[0]) throw notFound();
    if (current[0].purpose === input.purpose) return;
    await transaction
      .update(workItems)
      .set({ purpose: input.purpose, updatedAt: new Date() })
      .where(eq(workItems.id, workItemId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "work_item.purpose.updated.v1",
      targetType: "work_item",
      targetId: workItemId,
      metadata: {
        projectId,
        previousPurpose: current[0].purpose,
        purpose: input.purpose,
      },
    });
  });
  return getWorkCommercialProvenance(actor, workspaceId, projectId, workItemId);
}

export async function createCommercialBasisLink(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  input: CommercialBasisLinkInput,
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
    const work = await transaction
      .select({ id: workItems.id })
      .from(workItems)
      .where(
        and(eq(workItems.id, workItemId), eq(workItems.projectId, projectId)),
      )
      .limit(1);
    if (!work[0]) throw notFound();
    const basisType =
      "basisType" in input ? input.basisType : "baseline_scope_item";
    let scopeItemRevisionId: string | null = null;
    let decisionId: string | null = null;
    if (!("basisType" in input) || input.basisType === "baseline_scope_item") {
      const selectedRevisionId = input.scopeItemRevisionId;
      scopeItemRevisionId = selectedRevisionId;
      const revision = await transaction
        .select({
          itemId: commercialScopeItems.id,
          archivedAt: commercialScopeItems.archivedAt,
          baselineState: commercialBaselineVersions.state,
          revisionNumber: commercialScopeItemRevisions.revisionNumber,
        })
        .from(commercialScopeItemRevisions)
        .innerJoin(
          commercialScopeItems,
          eq(commercialScopeItems.id, commercialScopeItemRevisions.scopeItemId),
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
            eq(commercialScopeItemRevisions.id, selectedRevisionId),
            eq(commercialScopeItemRevisions.projectId, projectId),
          ),
        )
        .for("update")
        .limit(1);
      if (!revision[0]) throw notFound();
      if (revision[0].archivedAt) {
        throw conflict(
          "scope_item_archived",
          "Archived scope cannot authorize new work links.",
        );
      }
      if (revision[0].baselineState !== "effective") {
        throw conflict(
          "scope_item_not_effective",
          "Only scope from the current effective baseline can authorize work.",
        );
      }
      const latest = await transaction
        .select({ number: max(commercialScopeItemRevisions.revisionNumber) })
        .from(commercialScopeItemRevisions)
        .where(
          eq(commercialScopeItemRevisions.scopeItemId, revision[0].itemId),
        );
      if (latest[0]?.number !== revision[0].revisionNumber) {
        throw conflict(
          "scope_revision_superseded",
          "Link work to the current scope-item revision.",
        );
      }
    } else {
      const selectedDecisionId = input.decisionId;
      decisionId = selectedDecisionId;
      const decision = await transaction
        .select({
          disposition: commercialDecisions.disposition,
          supersededAt: commercialDecisions.supersededAt,
        })
        .from(commercialDecisions)
        .where(
          and(
            eq(commercialDecisions.id, selectedDecisionId),
            eq(commercialDecisions.projectId, projectId),
          ),
        )
        .for("update")
        .limit(1);
      if (!decision[0]) throw notFound();
      if (
        decision[0].supersededAt ||
        !isAuthorizingDecision(decision[0].disposition)
      ) {
        throw conflict(
          "decision_not_authorizing",
          "Only a current covered, absorbed, swap, or paid-change decision can authorize work.",
        );
      }
    }
    const inserted = await transaction
      .insert(commercialBasisLinks)
      .values({
        id: randomUUID(),
        projectId,
        workItemId,
        basisType,
        scopeItemRevisionId,
        decisionId,
        createdByUserId: actor.userId,
      })
      .onConflictDoNothing()
      .returning({ id: commercialBasisLinks.id });
    if (inserted[0]) {
      await insertAudit(transaction, actor, workspaceId, {
        eventType: "work_item.commercial_basis.linked.v1",
        targetType: "work_item",
        targetId: workItemId,
        metadata: {
          projectId,
          basisType,
          scopeItemRevisionId: scopeItemRevisionId ?? "",
          decisionId: decisionId ?? "",
        },
      });
    }
  });
  return getWorkCommercialProvenance(actor, workspaceId, projectId, workItemId);
}

export async function removeCommercialBasisLink(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  linkId: string,
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
    const removed = await transaction
      .delete(commercialBasisLinks)
      .where(
        and(
          eq(commercialBasisLinks.id, linkId),
          eq(commercialBasisLinks.projectId, projectId),
          eq(commercialBasisLinks.workItemId, workItemId),
        ),
      )
      .returning({
        id: commercialBasisLinks.id,
        basisType: commercialBasisLinks.basisType,
        scopeItemRevisionId: commercialBasisLinks.scopeItemRevisionId,
        decisionId: commercialBasisLinks.decisionId,
      });
    if (!removed[0]) throw notFound();
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "work_item.commercial_basis.unlinked.v1",
      targetType: "work_item",
      targetId: workItemId,
      metadata: {
        projectId,
        basisType: removed[0].basisType,
        scopeItemRevisionId: removed[0].scopeItemRevisionId ?? "",
        decisionId: removed[0].decisionId ?? "",
      },
    });
  });
  return getWorkCommercialProvenance(actor, workspaceId, projectId, workItemId);
}

export async function listCommercialDrift(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  filters: CommercialDriftFilters,
) {
  await getCommercialManagerAccess(getDb(), actor, workspaceId, projectId);
  const currentBaselineBasis = sql`exists (
    select 1
    from ${commercialScopeItems} current_scope
    inner join ${commercialBaselineVersions} current_version
      on current_version.id = current_scope.baseline_version_id
      and current_version.project_id = current_scope.project_id
    where current_scope.project_id = ${projectId}
      and current_scope.material_basis_scope_item_id = ${commercialScopeItems.id}
      and current_scope.archived_at is null
      and current_version.state = 'effective'
  )`;
  const hasEffectiveBaseline = sql`exists (
    select 1
    from ${commercialBaselineVersions} current_version
    where current_version.project_id = ${projectId}
      and current_version.state = 'effective'
  )`;
  const effectiveBasisCount = sql<number>`(
    select count(*)::int
    from ${commercialBasisLinks}
    left join ${commercialScopeItemRevisions}
      on ${commercialScopeItemRevisions.id} = ${commercialBasisLinks.scopeItemRevisionId}
      and ${commercialScopeItemRevisions.projectId} = ${commercialBasisLinks.projectId}
    left join ${commercialScopeItems}
      on ${commercialScopeItems.id} = ${commercialScopeItemRevisions.scopeItemId}
      and ${commercialScopeItems.projectId} = ${commercialBasisLinks.projectId}
    left join ${commercialDecisions}
      on ${commercialDecisions.id} = ${commercialBasisLinks.decisionId}
      and ${commercialDecisions.projectId} = ${commercialBasisLinks.projectId}
    where ${commercialBasisLinks.workItemId} = ${workItems.id}
      and ${commercialBasisLinks.projectId} = ${projectId}
      and (
        (${commercialBasisLinks.basisType} = 'baseline_scope_item' and ${currentBaselineBasis})
        or
        (${commercialBasisLinks.basisType} = 'commercial_decision'
          and ${commercialDecisions.supersededAt} is null
          and ${commercialDecisions.disposition} in ('covered', 'absorbed', 'swap', 'paid_change'))
      )
  )`;
  const staleBasisCount = sql<number>`(
    select count(*)::int
    from ${commercialBasisLinks}
    inner join ${commercialScopeItemRevisions}
      on ${commercialScopeItemRevisions.id} = ${commercialBasisLinks.scopeItemRevisionId}
      and ${commercialScopeItemRevisions.projectId} = ${commercialBasisLinks.projectId}
    inner join ${commercialScopeItems}
      on ${commercialScopeItems.id} = ${commercialScopeItemRevisions.scopeItemId}
      and ${commercialScopeItems.projectId} = ${commercialBasisLinks.projectId}
    where ${commercialBasisLinks.workItemId} = ${workItems.id}
      and ${commercialBasisLinks.projectId} = ${projectId}
      and ${commercialBasisLinks.basisType} = 'baseline_scope_item'
      and ${hasEffectiveBaseline}
      and not (${currentBaselineBasis})
  )`;
  const conditions = [
    eq(workItems.projectId, projectId),
    isNull(workItems.archivedAt),
    notInArray(workItems.status, ["done", "canceled"]),
  ];
  if (filters.state === "commercially_unlinked") {
    conditions.push(eq(workItems.purpose, "client_delivery"));
    conditions.push(sql`${effectiveBasisCount} = 0`);
    conditions.push(sql`${staleBasisCount} = 0`);
  } else if (filters.state === "needs_classification") {
    conditions.push(eq(workItems.purpose, "unclassified"));
  } else if (filters.state === "stale_basis") {
    conditions.push(eq(workItems.purpose, "client_delivery"));
    conditions.push(sql`${effectiveBasisCount} = 0`);
    conditions.push(sql`${staleBasisCount} > 0`);
  } else if (filters.state === "linked") {
    conditions.push(eq(workItems.purpose, "client_delivery"));
    conditions.push(sql`${effectiveBasisCount} > 0`);
  } else if (filters.state === "support_internal") {
    conditions.push(
      sql`${workItems.purpose} in ('delivery_support', 'internal')`,
    );
  }
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        id: workItems.id,
        number: workItems.number,
        title: workItems.title,
        status: workItems.status,
        purpose: workItems.purpose,
        basisCount: sql<number>`count(${commercialBasisLinks.id}) filter (
          where
            (${commercialBasisLinks.basisType} = 'baseline_scope_item' and ${currentBaselineBasis})
            or
            (${commercialBasisLinks.basisType} = 'commercial_decision'
              and ${commercialDecisions.supersededAt} is null
              and ${commercialDecisions.disposition} in ('covered', 'absorbed', 'swap', 'paid_change'))
        )::int`,
        staleBasisCount: sql<number>`count(${commercialBasisLinks.id}) filter (
          where ${commercialBasisLinks.basisType} = 'baseline_scope_item'
            and ${hasEffectiveBaseline}
            and not (${currentBaselineBasis})
        )::int`,
        updatedAt: workItems.updatedAt,
      })
      .from(workItems)
      .leftJoin(
        commercialBasisLinks,
        and(
          eq(commercialBasisLinks.workItemId, workItems.id),
          eq(commercialBasisLinks.projectId, projectId),
        ),
      )
      .leftJoin(
        commercialScopeItemRevisions,
        and(
          eq(
            commercialScopeItemRevisions.id,
            commercialBasisLinks.scopeItemRevisionId,
          ),
          eq(commercialScopeItemRevisions.projectId, projectId),
        ),
      )
      .leftJoin(
        commercialScopeItems,
        and(
          eq(commercialScopeItems.id, commercialScopeItemRevisions.scopeItemId),
          eq(commercialScopeItems.projectId, projectId),
        ),
      )
      .leftJoin(
        commercialDecisions,
        and(
          eq(commercialDecisions.id, commercialBasisLinks.decisionId),
          eq(commercialDecisions.projectId, projectId),
        ),
      )
      .where(where)
      .groupBy(workItems.id)
      .orderBy(desc(workItems.updatedAt), desc(workItems.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb().select({ total: count() }).from(workItems).where(where),
  ]);
  return {
    data: rows.map((row) => ({
      ...row,
      state: commercialState(row.purpose, row.basisCount, row.staleBasisCount),
    })),
    page: {
      number: filters.page,
      size: filters.pageSize,
      total: totals[0]?.total ?? 0,
      pages: Math.max(1, Math.ceil((totals[0]?.total ?? 0) / filters.pageSize)),
    },
  };
}

async function getCommercialScopeItem(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  itemId: string,
) {
  const overview = await listCommercialOverview(actor, workspaceId, projectId);
  const item = overview.scopeItems.find((candidate) => candidate.id === itemId);
  if (!item) throw notFound();
  return item;
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

async function assertScopeCapacity(
  transaction: Transaction,
  projectId: string,
  baselineVersionId: string,
) {
  const totals = await transaction
    .select({ total: count() })
    .from(commercialScopeItems)
    .where(
      and(
        eq(commercialScopeItems.projectId, projectId),
        eq(commercialScopeItems.baselineVersionId, baselineVersionId),
      ),
    );
  if ((totals[0]?.total ?? 0) >= MAX_SCOPE_ITEMS_PER_BASELINE) {
    throw conflict(
      "scope_item_limit",
      `A baseline may contain at most ${MAX_SCOPE_ITEMS_PER_BASELINE} scope items.`,
    );
  }
}

async function assertSourceCapacity(
  transaction: Transaction,
  projectId: string,
) {
  const totals = await transaction
    .select({ total: count() })
    .from(commercialEvidenceSources)
    .where(eq(commercialEvidenceSources.projectId, projectId));
  if ((totals[0]?.total ?? 0) >= MAX_SOURCES_PER_PROJECT) {
    throw conflict(
      "source_limit",
      `A project may contain at most ${MAX_SOURCES_PER_PROJECT} commercial sources.`,
    );
  }
}

async function lockProject(transaction: Transaction, projectId: string) {
  await transaction.execute(
    sql`select 1 from ${projects} where ${projects.id} = ${projectId} for update`,
  );
}

async function insertAnchors(
  transaction: Transaction,
  actorUserId: string,
  projectId: string,
  baselineVersionId: string,
  revisionId: string,
  anchors: Array<{
    sourceId: string;
    startOffset: number;
    endOffset: number;
    label?: string | null;
  }>,
) {
  const allowedSourceIds = await getBaselineVersionEvidenceSourceIds(
    transaction,
    projectId,
    baselineVersionId,
  );
  if (anchors.some((anchor) => !allowedSourceIds.includes(anchor.sourceId))) {
    throw conflict(
      "evidence_source_mismatch",
      "Scope evidence must come from this baseline version's evidence chain.",
    );
  }
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
  if (
    anchors.some((anchor) => {
      const source = sources.find(
        (candidate) => candidate.id === anchor.sourceId,
      );
      return (
        !source?.text ||
        anchor.endOffset <= anchor.startOffset ||
        anchor.endOffset > source.text.length
      );
    })
  ) {
    throw conflict(
      "evidence_anchor_invalid",
      "An evidence selection is outside the extracted source text.",
    );
  }
  const anchorRows = anchors.map((anchor) => ({
    id: randomUUID(),
    projectId,
    sourceId: anchor.sourceId,
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset,
    label: anchor.label || null,
    createdByUserId: actorUserId,
  }));
  await transaction.insert(commercialEvidenceAnchors).values(anchorRows);
  await transaction.insert(commercialScopeRevisionAnchors).values(
    anchorRows.map((anchor) => ({
      projectId,
      scopeItemRevisionId: revisionId,
      evidenceAnchorId: anchor.id,
    })),
  );
}

function commercialState(
  purpose: "unclassified" | "client_delivery" | "delivery_support" | "internal",
  basisCount: number,
  staleBasisCount = 0,
) {
  if (purpose === "unclassified") return "needs_classification" as const;
  if (purpose === "client_delivery")
    return basisCount > 0
      ? ("linked" as const)
      : staleBasisCount > 0
        ? ("stale_basis" as const)
        : ("commercially_unlinked" as const);
  return "support_internal" as const;
}

function isAuthorizingDecision(disposition: string | null) {
  return (
    disposition === "covered" ||
    disposition === "absorbed" ||
    disposition === "swap" ||
    disposition === "paid_change"
  );
}

function conflict(code: string, message: string) {
  return new PlatformError(code, 409, message);
}
