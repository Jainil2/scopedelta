import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditEvents,
  clients,
  cycles,
  memberships,
  migrationImportRows,
  migrationImportSessionIdentities,
  migrationImportSessions,
  migrationSourceIdentities,
  migrationSourceObjects,
  milestones,
  projectLabels,
  projectMemberships,
  projects,
  projectTemplateApplications,
  projectTemplates,
  users,
  workItemLabels,
  workItems,
  workspaces,
  type MigrationRowOutcome,
  type MigrationSourceKind,
  type ProjectTemplateDefinition,
} from "@/db/schema";
import {
  buildCsvPreview,
  CsvBoundaryError,
  csvRecord,
  fingerprint,
  IMPORT_BATCH_SIZE,
  type NormalizedImportRow,
  type PreviewMessage,
} from "@/lib/adoption";
import type {
  ApplyProjectTemplateInput,
  ConfirmImportInput,
  CreateProjectTemplateInput,
  DeliveryExportFilters,
  ImportPreviewInput,
  UpdateProjectTemplateInput,
} from "@/lib/adoption-validation";
import { forbidden, notFound, PlatformError } from "@/lib/platform-errors";
import { assertActiveProjectCapacity } from "@/server/billing";
import type { UserActor } from "@/server/workspaces";
import { recordWorkspaceProductSignal } from "@/server/self-service";

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

const MAX_IMPORT_RESULT_ROWS = 100;
const MAX_EXPORT_RECORDS = 5_000;
const PROJECT_EXPORT_METADATA_RECORDS = 2;
const PROJECT_EXPORT_PAYLOAD_RECORDS =
  MAX_EXPORT_RECORDS - PROJECT_EXPORT_METADATA_RECORDS;
const IMPORT_LEASE_MS = 5 * 60 * 1_000;

export async function listProjectTemplates(
  actor: UserActor,
  workspaceId: string,
  options: { includeArchived?: boolean } = {},
) {
  await requireWorkspaceAdmin(getDb(), actor, workspaceId);
  return getDb()
    .select()
    .from(projectTemplates)
    .where(
      and(
        eq(projectTemplates.workspaceId, workspaceId),
        ...(options.includeArchived
          ? []
          : [isNull(projectTemplates.archivedAt)]),
      ),
    )
    .orderBy(asc(projectTemplates.name), asc(projectTemplates.id))
    .limit(100);
}

export async function createProjectTemplate(
  actor: UserActor,
  workspaceId: string,
  input: CreateProjectTemplateInput,
) {
  await requireWorkspaceAdmin(getDb(), actor, workspaceId);
  const id = randomUUID();
  try {
    await getDb().transaction(async (transaction) => {
      await requireWorkspaceAdmin(transaction, actor, workspaceId);
      await transaction.insert(projectTemplates).values({
        id,
        workspaceId,
        name: input.name,
        description: input.description,
        definition: input.definition,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
      });
      await insertAudit(transaction, actor, workspaceId, {
        eventType: "project_template.created.v1",
        targetType: "project_template",
        targetId: id,
        metadata: { version: "1" },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PlatformError(
        "project_template_name_conflict",
        409,
        "An active template already uses that name.",
      );
    }
    throw error;
  }
  return getProjectTemplate(actor, workspaceId, id);
}

export async function getProjectTemplate(
  actor: UserActor,
  workspaceId: string,
  templateId: string,
) {
  await requireWorkspaceAdmin(getDb(), actor, workspaceId);
  const rows = await getDb()
    .select()
    .from(projectTemplates)
    .where(
      and(
        eq(projectTemplates.id, templateId),
        eq(projectTemplates.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function updateProjectTemplate(
  actor: UserActor,
  workspaceId: string,
  templateId: string,
  input: UpdateProjectTemplateInput,
) {
  try {
    await getDb().transaction(async (transaction) => {
      await requireWorkspaceAdmin(transaction, actor, workspaceId);
      const current = await transaction
        .select()
        .from(projectTemplates)
        .where(
          and(
            eq(projectTemplates.id, templateId),
            eq(projectTemplates.workspaceId, workspaceId),
          ),
        )
        .for("update");
      if (!current[0]) throw notFound();
      if (current[0].archivedAt) {
        throw new PlatformError(
          "project_template_archived",
          409,
          "Archived templates cannot be edited.",
        );
      }
      await transaction
        .update(projectTemplates)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.definition !== undefined
            ? { definition: input.definition }
            : {}),
          version: current[0].version + 1,
          updatedByUserId: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(projectTemplates.id, templateId));
      await insertAudit(transaction, actor, workspaceId, {
        eventType: "project_template.updated.v1",
        targetType: "project_template",
        targetId: templateId,
        metadata: { version: String(current[0].version + 1) },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PlatformError(
        "project_template_name_conflict",
        409,
        "An active template already uses that name.",
      );
    }
    throw error;
  }
  return getProjectTemplate(actor, workspaceId, templateId);
}

export async function archiveProjectTemplate(
  actor: UserActor,
  workspaceId: string,
  templateId: string,
) {
  await getDb().transaction(async (transaction) => {
    await requireWorkspaceAdmin(transaction, actor, workspaceId);
    const archived = await transaction
      .update(projectTemplates)
      .set({
        archivedAt: new Date(),
        updatedAt: new Date(),
        updatedByUserId: actor.userId,
      })
      .where(
        and(
          eq(projectTemplates.id, templateId),
          eq(projectTemplates.workspaceId, workspaceId),
          isNull(projectTemplates.archivedAt),
        ),
      )
      .returning({ id: projectTemplates.id });
    if (!archived[0]) throw notFound();
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "project_template.archived.v1",
      targetType: "project_template",
      targetId: templateId,
      metadata: {},
    });
  });
  return { id: templateId, archived: true };
}

export async function applyProjectTemplate(
  actor: UserActor,
  workspaceId: string,
  input: ApplyProjectTemplateInput,
) {
  const projectId = randomUUID();
  try {
    await getDb().transaction(async (transaction) => {
      await requireWorkspaceAdmin(transaction, actor, workspaceId);
      await transaction.execute(
        sql`select ${workspaces.id} from ${workspaces} where ${workspaces.id} = ${workspaceId} for update`,
      );
      await assertActiveProjectCapacity(transaction, workspaceId);
      const template = await transaction
        .select()
        .from(projectTemplates)
        .where(
          and(
            eq(projectTemplates.id, input.templateId),
            eq(projectTemplates.workspaceId, workspaceId),
            isNull(projectTemplates.archivedAt),
          ),
        )
        .limit(1);
      if (!template[0]) throw notFound();
      await assertActiveClient(transaction, workspaceId, input.clientId);
      await assertWorkspaceMember(transaction, workspaceId, input.leadUserId);
      const definition = template[0].definition;
      const needsStartDate =
        definition.cycles.length > 0 ||
        definition.milestones.some((item) => item.targetOffsetDays != null) ||
        definition.workItems.some((item) => item.targetOffsetDays != null);
      if (needsStartDate && !input.startDate) {
        throw new PlatformError(
          "template_date_start_required",
          409,
          "Choose a project start date to apply template date offsets.",
          { startDate: ["Required when the template contains date offsets."] },
        );
      }
      await createTemplateProject(transaction, actor, workspaceId, projectId, {
        ...input,
        summary: input.summary ?? template[0].definition.projectSummary,
      });
      await instantiateTemplateDefinition(
        transaction,
        actor,
        workspaceId,
        projectId,
        input.startDate,
        template[0].definition,
      );
      await transaction.insert(projectTemplateApplications).values({
        id: randomUUID(),
        workspaceId,
        templateId: template[0].id,
        templateVersion: template[0].version,
        projectId,
        snapshot: template[0].definition,
        appliedByUserId: actor.userId,
      });
      await insertAudit(transaction, actor, workspaceId, {
        eventType: "project_template.applied.v1",
        targetType: "project",
        targetId: projectId,
        metadata: {
          templateId: template[0].id,
          templateVersion: String(template[0].version),
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new PlatformError(
        "project_key_conflict",
        409,
        "That project key is already used in this workspace.",
        { key: ["Choose a unique project key."] },
      );
    }
    throw error;
  }
  return getCreatedProject(actor, workspaceId, projectId);
}

async function createTemplateProject(
  transaction: Transaction,
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: ApplyProjectTemplateInput,
) {
  await transaction.insert(projects).values({
    id: projectId,
    workspaceId,
    clientId: input.clientId,
    key: input.key.toUpperCase(),
    name: input.name,
    summary: input.summary,
    leadUserId: input.leadUserId,
    startDate: input.startDate,
    targetDate: input.targetDate,
    nextWorkItemNumber: 1,
  });
  await transaction
    .insert(projectMemberships)
    .values(
      [...new Set([actor.userId, input.leadUserId])].map((userId) => ({
        projectId,
        workspaceId,
        userId,
        addedByUserId: actor.userId,
      })),
    )
    .onConflictDoNothing();
}

async function instantiateTemplateDefinition(
  transaction: Transaction,
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  projectStartDate: string | null | undefined,
  definition: ProjectTemplateDefinition,
) {
  const milestoneIds = new Map<string, string>();
  for (const [index, milestone] of definition.milestones.entries()) {
    const id = randomUUID();
    milestoneIds.set(milestone.ref, id);
    await transaction.insert(milestones).values({
      id,
      projectId,
      name: milestone.name,
      description: milestone.description,
      targetDate: offsetDate(projectStartDate, milestone.targetOffsetDays),
      sortOrder: index,
    });
  }
  const cycleIds = new Map<string, string>();
  for (const [index, cycle] of definition.cycles.entries()) {
    const id = randomUUID();
    const startDate = offsetDate(projectStartDate, cycle.startOffsetDays);
    if (!startDate) continue;
    cycleIds.set(cycle.ref, id);
    await transaction.insert(cycles).values({
      id,
      projectId,
      sequence: index + 1,
      name: cycle.name,
      startDate,
      endDate: offsetDate(startDate, cycle.durationDays - 1)!,
      goal: cycle.goal,
    });
  }
  const labels = new Map<string, string>();
  for (const label of definition.workItems.flatMap((item) => item.labels)) {
    const key = normalizeKey(label);
    if (!labels.has(key)) labels.set(key, label);
  }
  const labelIds = new Map<string, string>();
  for (const [key, label] of labels) {
    const id = randomUUID();
    labelIds.set(key, id);
    await transaction.insert(projectLabels).values({
      id,
      projectId,
      name: label,
      color: "slate",
    });
  }
  const workIds = new Map(
    definition.workItems.map((item) => [item.ref, randomUUID()]),
  );
  const ordered = [
    ...definition.workItems.filter((item) => !item.parentRef),
    ...definition.workItems.filter((item) => item.parentRef),
  ];
  let number = 1;
  for (const item of ordered) {
    const workItemId = workIds.get(item.ref)!;
    await transaction.insert(workItems).values({
      id: workItemId,
      projectId,
      number,
      parentId: item.parentRef ? workIds.get(item.parentRef) : null,
      title: item.title,
      description: item.description,
      acceptanceCriteria: item.acceptanceCriteria,
      status: item.status,
      priority: item.priority,
      purpose: item.purpose,
      estimatePoints: item.estimatePoints,
      targetDate: offsetDate(projectStartDate, item.targetOffsetDays),
      milestoneId: item.milestoneRef
        ? milestoneIds.get(item.milestoneRef)
        : null,
      cycleId: item.cycleRef ? cycleIds.get(item.cycleRef) : null,
      sortOrder: number - 1,
    });
    if (item.labels.length) {
      const itemLabelKeys = [
        ...new Set(item.labels.map((label) => normalizeKey(label))),
      ];
      await transaction.insert(workItemLabels).values(
        itemLabelKeys.map((labelKey) => ({
          workItemId,
          projectId,
          labelId: labelIds.get(labelKey)!,
        })),
      );
    }
    number += 1;
  }
  await transaction
    .update(projects)
    .set({ nextWorkItemNumber: number, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  await insertAudit(transaction, actor, workspaceId, {
    eventType: "project.created.v1",
    targetType: "project",
    targetId: projectId,
    metadata: { creationSource: "project_template" },
  });
}

export async function createImportPreview(
  actor: UserActor,
  workspaceId: string,
  input: ImportPreviewInput,
) {
  await requireWorkspaceAdmin(getDb(), actor, workspaceId);
  await assertActiveClient(getDb(), workspaceId, input.options.clientId);
  await assertWorkspaceMember(
    getDb(),
    workspaceId,
    input.options.defaultLeadUserId,
  );
  let preview;
  try {
    preview = buildCsvPreview({
      csvText: input.csvText,
      sourceKind: input.sourceKind,
      mapping: input.mapping,
      options: input.options,
    });
  } catch (error) {
    if (error instanceof CsvBoundaryError) {
      throw new PlatformError(error.code, 400, error.message);
    }
    throw error;
  }

  await applyDatabasePreviewWarnings(
    workspaceId,
    input.sourceKind,
    input.sourceNamespace,
    preview.rows,
  );
  preview.counts = preview.rows.reduce(
    (counts, row) => {
      counts.total += 1;
      counts[row.outcome] += 1;
      return counts;
    },
    { total: 0, valid: 0, warning: 0, blocked: 0 },
  );

  const sessionId = randomUUID();
  const fileSha256 = fingerprint(input.csvText);
  await getDb().transaction(async (transaction) => {
    await requireWorkspaceAdmin(transaction, actor, workspaceId);
    await transaction.insert(migrationImportSessions).values({
      id: sessionId,
      workspaceId,
      sourceKind: input.sourceKind,
      sourceNamespace: input.sourceNamespace,
      sourceName: input.sourceName,
      fileName: input.fileName,
      fileSha256,
      state: "preview_ready",
      mapping: preview.mapping,
      options: input.options,
      unsupportedColumns: preview.unsupportedColumns,
      totalRows: preview.counts.total,
      validRows: preview.counts.valid,
      warningRows: preview.counts.warning,
      blockedRows: preview.counts.blocked,
      createdByUserId: actor.userId,
    });
    for (let offset = 0; offset < preview.rows.length; offset += 500) {
      const batch = preview.rows.slice(offset, offset + 500);
      await transaction.insert(migrationImportRows).values(
        batch.map((row) => ({
          id: randomUUID(),
          workspaceId,
          sessionId,
          rowNumber: row.rowNumber,
          objectKind: "work_item" as const,
          sourceProjectKey: row.normalized.sourceProjectKey,
          sourceObjectKey: row.normalized.sourceObjectKey,
          sourceFingerprint: row.fingerprint,
          outcome: row.outcome,
          normalizedData: row.normalized,
          messages: row.messages,
        })),
      );
    }
    await upsertPreviewIdentities(
      transaction,
      workspaceId,
      sessionId,
      input.sourceKind,
      input.sourceNamespace,
      preview.rows.map((row) => row.normalized),
    );
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "migration_import.preview_created.v1",
      targetType: "migration_import_session",
      targetId: sessionId,
      metadata: {
        sourceKind: input.sourceKind,
        totalRows: String(preview.counts.total),
        blockedRows: String(preview.counts.blocked),
        unsupportedColumnCount: String(preview.unsupportedColumns.length),
      },
    });
    await recordWorkspaceProductSignal(transaction, {
      workspaceId,
      eventType: "migration_import_started",
      outcome: "completed",
      subjectId: sessionId,
    });
  });
  return getImportSession(actor, workspaceId, sessionId);
}

async function applyDatabasePreviewWarnings(
  workspaceId: string,
  sourceKind: MigrationSourceKind,
  sourceNamespace: string,
  rows: Array<{
    outcome: "valid" | "warning" | "blocked";
    messages: PreviewMessage[];
    normalized: NormalizedImportRow;
    fingerprint: string;
  }>,
) {
  const projectKeys = [
    ...new Set(rows.map((row) => row.normalized.sourceProjectKey)),
  ];
  const [existingProjects, existingSourceObjects] = await Promise.all([
    projectKeys.length
      ? getDb()
          .select({ key: projects.key })
          .from(projects)
          .where(
            and(
              eq(projects.workspaceId, workspaceId),
              inArray(projects.key, projectKeys),
            ),
          )
      : [],
    getDb()
      .select({
        objectKind: migrationSourceObjects.objectKind,
        sourceProjectKey: migrationSourceObjects.sourceProjectKey,
        sourceObjectKey: migrationSourceObjects.sourceObjectKey,
        sourceFingerprint: migrationSourceObjects.sourceFingerprint,
      })
      .from(migrationSourceObjects)
      .where(
        and(
          eq(migrationSourceObjects.workspaceId, workspaceId),
          eq(migrationSourceObjects.sourceKind, sourceKind),
          eq(migrationSourceObjects.sourceNamespace, sourceNamespace),
          projectKeys.length
            ? inArray(migrationSourceObjects.sourceProjectKey, projectKeys)
            : sql`false`,
        ),
      ),
  ]);
  const existingProjectKeys = new Set(existingProjects.map((row) => row.key));
  const sourceObjects = new Map(
    existingSourceObjects.map((row) => [
      sourceObjectIdentity(
        row.objectKind,
        row.sourceProjectKey,
        row.sourceObjectKey,
      ),
      row,
    ]),
  );
  for (const row of rows) {
    const projectSource = sourceObjects.get(
      sourceObjectIdentity(
        "project",
        row.normalized.sourceProjectKey,
        row.normalized.sourceProjectKey,
      ),
    );
    const workSource = sourceObjects.get(
      sourceObjectIdentity(
        "work_item",
        row.normalized.sourceProjectKey,
        row.normalized.sourceObjectKey,
      ),
    );
    if (workSource) {
      row.messages.push({
        code: "source_already_imported",
        message:
          workSource.sourceFingerprint === row.fingerprint
            ? "This source object was already imported and will be skipped on confirmation."
            : "This source object already exists with a different fingerprint; it will not be overwritten.",
      });
      if (row.outcome === "valid") row.outcome = "warning";
    } else if (
      existingProjectKeys.has(row.normalized.sourceProjectKey) &&
      !projectSource
    ) {
      row.messages.push({
        code: "project_key_conflict",
        field: "projectKey",
        message:
          "That project key already exists without matching migration provenance; choose a different target key.",
      });
      row.outcome = "blocked";
    }
  }
}

async function upsertPreviewIdentities(
  transaction: Transaction,
  workspaceId: string,
  sessionId: string,
  sourceKind: MigrationSourceKind,
  sourceNamespace: string,
  rows: NormalizedImportRow[],
) {
  const identities = new Map<
    string,
    NonNullable<NormalizedImportRow["assigneeIdentity"]>
  >();
  for (const row of rows) {
    for (const identity of [row.assigneeIdentity, row.reporterIdentity]) {
      if (identity) identities.set(identity.identityKey, identity);
    }
  }
  if (!identities.size) return;
  const persistedIdentities = await transaction
    .insert(migrationSourceIdentities)
    .values(
      [...identities.values()].map((identity) => ({
        id: randomUUID(),
        workspaceId,
        sourceKind,
        sourceNamespace,
        identityKey: identity.identityKey,
        displayName: identity.displayName,
        email: identity.email,
        firstSessionId: sessionId,
        lastSessionId: sessionId,
      })),
    )
    .onConflictDoUpdate({
      target: [
        migrationSourceIdentities.workspaceId,
        migrationSourceIdentities.sourceKind,
        migrationSourceIdentities.sourceNamespace,
        migrationSourceIdentities.identityKey,
      ],
      set: { lastSessionId: sessionId, updatedAt: new Date() },
    })
    .returning({ id: migrationSourceIdentities.id });
  await transaction
    .insert(migrationImportSessionIdentities)
    .values(
      persistedIdentities.map((identity) => ({
        workspaceId,
        sessionId,
        identityId: identity.id,
      })),
    )
    .onConflictDoNothing();
}

export async function listImportSessions(
  actor: UserActor,
  workspaceId: string,
  page = 1,
  pageSize = 20,
) {
  await requireWorkspaceAdmin(getDb(), actor, workspaceId);
  const conditions = eq(migrationImportSessions.workspaceId, workspaceId);
  const [rows, totals] = await Promise.all([
    getDb()
      .select({
        id: migrationImportSessions.id,
        sourceKind: migrationImportSessions.sourceKind,
        sourceNamespace: migrationImportSessions.sourceNamespace,
        sourceName: migrationImportSessions.sourceName,
        fileName: migrationImportSessions.fileName,
        state: migrationImportSessions.state,
        totalRows: migrationImportSessions.totalRows,
        validRows: migrationImportSessions.validRows,
        warningRows: migrationImportSessions.warningRows,
        blockedRows: migrationImportSessions.blockedRows,
        createdProjects: migrationImportSessions.createdProjects,
        createdWorkItems: migrationImportSessions.createdWorkItems,
        skippedRows: migrationImportSessions.skippedRows,
        failedRows: migrationImportSessions.failedRows,
        committedAnything: migrationImportSessions.committedAnything,
        lastErrorCode: migrationImportSessions.lastErrorCode,
        createdAt: migrationImportSessions.createdAt,
        completedAt: migrationImportSessions.completedAt,
      })
      .from(migrationImportSessions)
      .where(conditions)
      .orderBy(
        desc(migrationImportSessions.createdAt),
        desc(migrationImportSessions.id),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    getDb()
      .select({ total: count() })
      .from(migrationImportSessions)
      .where(conditions),
  ]);
  const total = totals[0]?.total ?? 0;
  return {
    items: rows,
    pageInfo: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNextPage: page * pageSize < total,
    },
  };
}

export async function getImportSession(
  actor: UserActor,
  workspaceId: string,
  sessionId: string,
  rowPage = 1,
  rowPageSize = MAX_IMPORT_RESULT_ROWS,
) {
  await requireWorkspaceAdmin(getDb(), actor, workspaceId);
  const sessionRows = await getDb()
    .select()
    .from(migrationImportSessions)
    .where(
      and(
        eq(migrationImportSessions.id, sessionId),
        eq(migrationImportSessions.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!sessionRows[0]) throw notFound();
  const [rows, identities] = await Promise.all([
    getDb()
      .select({
        id: migrationImportRows.id,
        rowNumber: migrationImportRows.rowNumber,
        sourceProjectKey: migrationImportRows.sourceProjectKey,
        sourceObjectKey: migrationImportRows.sourceObjectKey,
        sourceFingerprint: migrationImportRows.sourceFingerprint,
        outcome: migrationImportRows.outcome,
        normalizedData: migrationImportRows.normalizedData,
        messages: migrationImportRows.messages,
        targetProjectId: migrationImportRows.targetProjectId,
        targetWorkItemId: migrationImportRows.targetWorkItemId,
        committedAt: migrationImportRows.committedAt,
      })
      .from(migrationImportRows)
      .where(eq(migrationImportRows.sessionId, sessionId))
      .orderBy(asc(migrationImportRows.rowNumber))
      .limit(Math.min(rowPageSize, MAX_IMPORT_RESULT_ROWS))
      .offset((rowPage - 1) * Math.min(rowPageSize, MAX_IMPORT_RESULT_ROWS)),
    getDb()
      .select({
        id: migrationSourceIdentities.id,
        identityKey: migrationSourceIdentities.identityKey,
        displayName: migrationSourceIdentities.displayName,
        email: migrationSourceIdentities.email,
        mappedUserId: migrationSourceIdentities.mappedUserId,
      })
      .from(migrationImportSessionIdentities)
      .innerJoin(
        migrationSourceIdentities,
        eq(
          migrationSourceIdentities.id,
          migrationImportSessionIdentities.identityId,
        ),
      )
      .where(
        and(
          eq(migrationImportSessionIdentities.workspaceId, workspaceId),
          eq(migrationImportSessionIdentities.sessionId, sessionId),
        ),
      )
      .orderBy(asc(migrationSourceIdentities.identityKey))
      .limit(500),
  ]);
  return {
    ...sessionRows[0],
    rows,
    identities,
    rowPageInfo: {
      page: rowPage,
      pageSize: Math.min(rowPageSize, MAX_IMPORT_RESULT_ROWS),
      total: sessionRows[0].totalRows,
      hasNextPage: rowPage * rowPageSize < sessionRows[0].totalRows,
    },
  };
}

export async function confirmImport(
  actor: UserActor,
  workspaceId: string,
  sessionId: string,
  input: ConfirmImportInput,
) {
  const claim = await claimImportSession(
    actor,
    workspaceId,
    sessionId,
    input.identityMappings,
  );
  if (!claim.claimed) {
    return getImportSession(actor, workspaceId, sessionId);
  }
  const session = claim.session;
  const options = session.options as ImportPreviewInput["options"];
  let lastErrorCode: string | null = null;
  try {
    const pendingRows = await getDb()
      .select({
        id: migrationImportRows.id,
        sourceProjectKey: migrationImportRows.sourceProjectKey,
        sourceObjectKey: migrationImportRows.sourceObjectKey,
        sourceFingerprint: migrationImportRows.sourceFingerprint,
        outcome: migrationImportRows.outcome,
        normalizedData: migrationImportRows.normalizedData,
      })
      .from(migrationImportRows)
      .where(
        and(
          eq(migrationImportRows.sessionId, sessionId),
          inArray(migrationImportRows.outcome, ["valid", "warning", "failed"]),
          isNull(migrationImportRows.targetWorkItemId),
        ),
      )
      .orderBy(asc(migrationImportRows.rowNumber));
    const projectGroups = new Map<string, typeof pendingRows>();
    for (const row of pendingRows) {
      projectGroups.set(row.sourceProjectKey, [
        ...(projectGroups.get(row.sourceProjectKey) ?? []),
        row,
      ]);
    }
    const projectIds = new Map<string, string>();
    const failedProjects = new Set<string>();
    for (const [sourceProjectKey, rows] of projectGroups) {
      try {
        const projectId = await ensureImportedProject({
          actor,
          workspaceId,
          session,
          options,
          sourceProjectKey,
          projectName: asNormalizedRow(rows[0].normalizedData).projectName,
        });
        projectIds.set(sourceProjectKey, projectId);
      } catch (error) {
        const code = platformCode(error, "import_project_failed");
        logImportError("project", error);
        lastErrorCode = code;
        failedProjects.add(sourceProjectKey);
        await markRowsFailed(
          rows.map((row) => row.id),
          code,
          safeImportFailureMessage(
            error,
            "The destination project could not be created.",
          ),
        );
      }
    }
    const commitRows = pendingRows
      .filter((row) => !failedProjects.has(row.sourceProjectKey))
      .sort((left, right) => {
        const leftChild = asNormalizedRow(left.normalizedData)
          .parentSourceObjectKey
          ? 1
          : 0;
        const rightChild = asNormalizedRow(right.normalizedData)
          .parentSourceObjectKey
          ? 1
          : 0;
        return leftChild - rightChild;
      });
    for (
      let offset = 0;
      offset < commitRows.length;
      offset += IMPORT_BATCH_SIZE
    ) {
      const batch = commitRows.slice(offset, offset + IMPORT_BATCH_SIZE);
      try {
        await commitImportBatch({
          actor,
          workspaceId,
          session,
          projectIds,
          rows: batch,
        });
        await extendImportLease(workspaceId, sessionId);
      } catch (error) {
        const code = platformCode(error, "import_batch_failed");
        logImportError("batch", error);
        lastErrorCode = code;
        await markRowsFailed(
          batch.map((row) => row.id),
          code,
          safeImportFailureMessage(
            error,
            "This bounded import batch could not be committed.",
          ),
        );
      }
    }
    await finalizeImportSession(actor, workspaceId, sessionId, lastErrorCode);
  } catch (error) {
    await getDb()
      .update(migrationImportSessions)
      .set({
        state: "failed",
        processingLeaseUntil: null,
        lastErrorCode: platformCode(error, "import_failed"),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(migrationImportSessions.id, sessionId),
          eq(migrationImportSessions.workspaceId, workspaceId),
        ),
      );
    throw error;
  }
  return getImportSession(actor, workspaceId, sessionId);
}

async function claimImportSession(
  actor: UserActor,
  workspaceId: string,
  sessionId: string,
  identityMappings: Record<string, string | null>,
) {
  return getDb().transaction(async (transaction) => {
    await requireWorkspaceAdmin(transaction, actor, workspaceId);
    const rows = await transaction
      .select()
      .from(migrationImportSessions)
      .where(
        and(
          eq(migrationImportSessions.id, sessionId),
          eq(migrationImportSessions.workspaceId, workspaceId),
        ),
      )
      .for("update");
    const session = rows[0];
    if (!session) throw notFound();
    if (session.state === "completed")
      return { claimed: false as const, session };
    if (
      session.state === "committing" &&
      session.processingLeaseUntil &&
      session.processingLeaseUntil > new Date()
    ) {
      throw new PlatformError(
        "import_in_progress",
        409,
        "This import is already being committed. Retry after the active lease expires.",
      );
    }
    await applyIdentityMappings(
      transaction,
      workspaceId,
      session,
      identityMappings,
    );
    const now = new Date();
    await transaction
      .update(migrationImportSessions)
      .set({
        state: "committing",
        processingLeaseUntil: new Date(now.getTime() + IMPORT_LEASE_MS),
        confirmedByUserId: actor.userId,
        confirmedAt: session.confirmedAt ?? now,
        completedAt: null,
        lastErrorCode: null,
        updatedAt: now,
      })
      .where(eq(migrationImportSessions.id, sessionId));
    return { claimed: true as const, session };
  });
}

async function applyIdentityMappings(
  transaction: Transaction,
  workspaceId: string,
  session: typeof migrationImportSessions.$inferSelect,
  identityMappings: Record<string, string | null>,
) {
  for (const [identityId, userId] of Object.entries(identityMappings)) {
    const identity = await transaction
      .select({ id: migrationSourceIdentities.id })
      .from(migrationSourceIdentities)
      .where(
        and(
          eq(migrationSourceIdentities.id, identityId),
          eq(migrationSourceIdentities.workspaceId, workspaceId),
          eq(migrationSourceIdentities.sourceKind, session.sourceKind),
          eq(
            migrationSourceIdentities.sourceNamespace,
            session.sourceNamespace,
          ),
        ),
      )
      .limit(1);
    if (!identity[0]) throw notFound();
    if (userId) await assertWorkspaceMember(transaction, workspaceId, userId);
    await transaction
      .update(migrationSourceIdentities)
      .set({ mappedUserId: userId, updatedAt: new Date() })
      .where(eq(migrationSourceIdentities.id, identityId));
  }
}

async function ensureImportedProject(input: {
  actor: UserActor;
  workspaceId: string;
  session: typeof migrationImportSessions.$inferSelect;
  options: ImportPreviewInput["options"];
  sourceProjectKey: string;
  projectName: string;
}) {
  return getDb().transaction(async (transaction) => {
    await requireWorkspaceAdmin(transaction, input.actor, input.workspaceId);
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${sourceObjectLockKey(
        input.workspaceId,
        input.session.sourceKind,
        input.session.sourceNamespace,
        "project",
        input.sourceProjectKey,
        input.sourceProjectKey,
      )}, 0))`,
    );
    const existingSource = await transaction
      .select({
        targetProjectId: migrationSourceObjects.targetProjectId,
        lifecycle: projects.lifecycle,
      })
      .from(migrationSourceObjects)
      .innerJoin(
        projects,
        eq(projects.id, migrationSourceObjects.targetProjectId),
      )
      .where(
        and(
          eq(migrationSourceObjects.workspaceId, input.workspaceId),
          eq(migrationSourceObjects.sourceKind, input.session.sourceKind),
          eq(
            migrationSourceObjects.sourceNamespace,
            input.session.sourceNamespace,
          ),
          eq(migrationSourceObjects.objectKind, "project"),
          sql`lower(${migrationSourceObjects.sourceProjectKey}) = ${normalizeKey(input.sourceProjectKey)}`,
          sql`lower(${migrationSourceObjects.sourceObjectKey}) = ${normalizeKey(input.sourceProjectKey)}`,
        ),
      )
      .limit(1);
    if (existingSource[0]) {
      if (existingSource[0].lifecycle !== "active") {
        throw new PlatformError(
          "import_project_read_only",
          409,
          "The previously imported project is no longer active.",
        );
      }
      return existingSource[0].targetProjectId;
    }
    const keyConflict = await transaction
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, input.workspaceId),
          eq(projects.key, input.sourceProjectKey),
        ),
      )
      .limit(1);
    if (keyConflict[0]) {
      throw new PlatformError(
        "import_project_key_conflict",
        409,
        "The project key exists without matching migration provenance.",
      );
    }
    await transaction.execute(
      sql`select ${workspaces.id} from ${workspaces} where ${workspaces.id} = ${input.workspaceId} for update`,
    );
    await assertActiveProjectCapacity(transaction, input.workspaceId);
    await assertActiveClient(
      transaction,
      input.workspaceId,
      input.options.clientId,
    );
    await assertWorkspaceMember(
      transaction,
      input.workspaceId,
      input.options.defaultLeadUserId,
    );
    const projectId = randomUUID();
    await transaction.insert(projects).values({
      id: projectId,
      workspaceId: input.workspaceId,
      clientId: input.options.clientId,
      key: input.sourceProjectKey,
      name: input.projectName,
      leadUserId: input.options.defaultLeadUserId,
    });
    await transaction
      .insert(projectMemberships)
      .values(
        [...new Set([input.actor.userId, input.options.defaultLeadUserId])].map(
          (userId) => ({
            projectId,
            workspaceId: input.workspaceId,
            userId,
            addedByUserId: input.actor.userId,
          }),
        ),
      )
      .onConflictDoNothing();
    await transaction.insert(migrationSourceObjects).values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      sourceKind: input.session.sourceKind,
      sourceNamespace: input.session.sourceNamespace,
      objectKind: "project",
      sourceProjectKey: input.sourceProjectKey,
      sourceObjectKey: input.sourceProjectKey,
      sourceFingerprint: fingerprint({
        key: input.sourceProjectKey,
        name: input.projectName,
      }),
      sourceMetadata: { sourceName: input.session.sourceName },
      targetProjectId: projectId,
      firstSessionId: input.session.id,
      lastSessionId: input.session.id,
    });
    await insertAudit(transaction, input.actor, input.workspaceId, {
      eventType: "project.created.v1",
      targetType: "project",
      targetId: projectId,
      metadata: {
        creationSource: "migration_import",
        importSessionId: input.session.id,
      },
    });
    return projectId;
  });
}

async function commitImportBatch(input: {
  actor: UserActor;
  workspaceId: string;
  session: typeof migrationImportSessions.$inferSelect;
  projectIds: Map<string, string>;
  rows: Array<{
    id: string;
    sourceProjectKey: string;
    sourceObjectKey: string;
    sourceFingerprint: string;
    outcome: MigrationRowOutcome;
    normalizedData: Record<string, unknown>;
  }>;
}) {
  await getDb().transaction(async (transaction) => {
    await requireWorkspaceAdmin(transaction, input.actor, input.workspaceId);
    const identityRows = await transaction
      .select({
        identityKey: migrationSourceIdentities.identityKey,
        mappedUserId: migrationSourceIdentities.mappedUserId,
      })
      .from(migrationSourceIdentities)
      .where(
        and(
          eq(migrationSourceIdentities.workspaceId, input.workspaceId),
          eq(migrationSourceIdentities.sourceKind, input.session.sourceKind),
          eq(
            migrationSourceIdentities.sourceNamespace,
            input.session.sourceNamespace,
          ),
        ),
      );
    const mappedUsers = new Map(
      identityRows.map((identity) => [
        identity.identityKey,
        identity.mappedUserId,
      ]),
    );
    const involvedProjectIds = [
      ...new Set(
        input.rows
          .map((row) => input.projectIds.get(row.sourceProjectKey))
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const projectRows = involvedProjectIds.length
      ? await transaction
          .select({
            id: projects.id,
            lifecycle: projects.lifecycle,
            nextWorkItemNumber: projects.nextWorkItemNumber,
          })
          .from(projects)
          .where(
            and(
              eq(projects.workspaceId, input.workspaceId),
              inArray(projects.id, involvedProjectIds),
            ),
          )
          .for("update")
      : [];
    const numberByProject = new Map(
      projectRows.map((project) => [project.id, project.nextWorkItemNumber]),
    );
    if (projectRows.some((project) => project.lifecycle !== "active")) {
      throw new PlatformError(
        "import_project_read_only",
        409,
        "An import destination project is no longer active.",
      );
    }
    const labelRows = involvedProjectIds.length
      ? await transaction
          .select({
            id: projectLabels.id,
            projectId: projectLabels.projectId,
            name: projectLabels.name,
          })
          .from(projectLabels)
          .where(inArray(projectLabels.projectId, involvedProjectIds))
      : [];
    const labelIds = new Map(
      labelRows.map((label) => [
        `${label.projectId}\u0000${normalizeKey(label.name)}`,
        label.id,
      ]),
    );

    for (const row of input.rows) {
      const projectId = input.projectIds.get(row.sourceProjectKey);
      if (!projectId) continue;
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${sourceObjectLockKey(
          input.workspaceId,
          input.session.sourceKind,
          input.session.sourceNamespace,
          "work_item",
          row.sourceProjectKey,
          row.sourceObjectKey,
        )}, 0))`,
      );
      const existing = await transaction
        .select({
          targetProjectId: migrationSourceObjects.targetProjectId,
          targetWorkItemId: migrationSourceObjects.targetWorkItemId,
        })
        .from(migrationSourceObjects)
        .where(
          and(
            eq(migrationSourceObjects.workspaceId, input.workspaceId),
            eq(migrationSourceObjects.sourceKind, input.session.sourceKind),
            eq(
              migrationSourceObjects.sourceNamespace,
              input.session.sourceNamespace,
            ),
            eq(migrationSourceObjects.objectKind, "work_item"),
            sql`lower(${migrationSourceObjects.sourceProjectKey}) = ${normalizeKey(row.sourceProjectKey)}`,
            sql`lower(${migrationSourceObjects.sourceObjectKey}) = ${normalizeKey(row.sourceObjectKey)}`,
          ),
        )
        .limit(1);
      if (existing[0]) {
        await transaction
          .update(migrationImportRows)
          .set({
            outcome: "skipped",
            targetProjectId: existing[0].targetProjectId,
            targetWorkItemId: existing[0].targetWorkItemId,
            committedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(migrationImportRows.id, row.id));
        continue;
      }
      const normalized = asNormalizedRow(row.normalizedData);
      let parentId: string | null = null;
      if (normalized.parentSourceObjectKey) {
        const parent = await transaction
          .select({ targetWorkItemId: migrationSourceObjects.targetWorkItemId })
          .from(migrationSourceObjects)
          .where(
            and(
              eq(migrationSourceObjects.workspaceId, input.workspaceId),
              eq(migrationSourceObjects.sourceKind, input.session.sourceKind),
              eq(
                migrationSourceObjects.sourceNamespace,
                input.session.sourceNamespace,
              ),
              eq(migrationSourceObjects.objectKind, "work_item"),
              sql`lower(${migrationSourceObjects.sourceProjectKey}) = ${normalizeKey(row.sourceProjectKey)}`,
              sql`lower(${migrationSourceObjects.sourceObjectKey}) = ${normalizeKey(normalized.parentSourceObjectKey)}`,
            ),
          )
          .limit(1);
        if (!parent[0]?.targetWorkItemId) {
          await updateRowFailure(
            transaction,
            row.id,
            "parent_not_committed",
            "The parent did not commit successfully, so this subtask was not flattened or created.",
          );
          continue;
        }
        parentId = parent[0].targetWorkItemId;
      }
      const assigneeUserId = normalized.assigneeIdentity
        ? (mappedUsers.get(normalized.assigneeIdentity.identityKey) ?? null)
        : null;
      if (assigneeUserId) {
        await transaction
          .insert(projectMemberships)
          .values({
            projectId,
            workspaceId: input.workspaceId,
            userId: assigneeUserId,
            addedByUserId: input.actor.userId,
          })
          .onConflictDoNothing();
      }
      const workItemId = randomUUID();
      const number = numberByProject.get(projectId);
      if (!number) throw notFound();
      await transaction.insert(workItems).values({
        id: workItemId,
        projectId,
        number,
        parentId,
        title: normalized.title,
        description: normalized.description,
        acceptanceCriteria: normalized.acceptanceCriteria,
        status: normalized.status,
        priority: normalized.priority,
        purpose: "unclassified",
        assigneeUserId,
        estimatePoints: normalized.estimatePoints,
        targetDate: normalized.targetDate,
        sortOrder: number - 1,
      });
      numberByProject.set(projectId, number + 1);
      const workLabelIds: string[] = [];
      for (const label of normalized.labels) {
        const cacheKey = `${projectId}\u0000${normalizeKey(label)}`;
        let labelId = labelIds.get(cacheKey);
        if (!labelId) {
          labelId = randomUUID();
          await transaction
            .insert(projectLabels)
            .values({ id: labelId, projectId, name: label, color: "slate" })
            .onConflictDoNothing();
          const persisted = await transaction
            .select({ id: projectLabels.id })
            .from(projectLabels)
            .where(
              and(
                eq(projectLabels.projectId, projectId),
                sql`lower(${projectLabels.name}) = ${normalizeKey(label)}`,
              ),
            )
            .limit(1);
          labelId = persisted[0]?.id;
          if (labelId) labelIds.set(cacheKey, labelId);
        }
        if (labelId) workLabelIds.push(labelId);
      }
      if (workLabelIds.length) {
        await transaction.insert(workItemLabels).values(
          workLabelIds.map((labelId) => ({
            workItemId,
            projectId,
            labelId,
          })),
        );
      }
      await transaction.insert(migrationSourceObjects).values({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        sourceKind: input.session.sourceKind,
        sourceNamespace: input.session.sourceNamespace,
        objectKind: "work_item",
        sourceProjectKey: row.sourceProjectKey,
        sourceObjectKey: row.sourceObjectKey,
        sourceUrl: normalized.sourceUrl,
        sourceFingerprint: row.sourceFingerprint,
        sourceMetadata: {
          issueType: normalized.issueType,
          assigneeIdentityKey: normalized.assigneeIdentity?.identityKey ?? null,
          reporterIdentityKey: normalized.reporterIdentity?.identityKey ?? null,
          sourceCreatedAt: normalized.sourceCreatedAt,
          sourceUpdatedAt: normalized.sourceUpdatedAt,
          unsupported: normalized.unsupported,
        },
        targetProjectId: projectId,
        targetWorkItemId: workItemId,
        firstSessionId: input.session.id,
        lastSessionId: input.session.id,
      });
      await transaction
        .update(migrationImportRows)
        .set({
          outcome: "created",
          targetProjectId: projectId,
          targetWorkItemId: workItemId,
          committedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(migrationImportRows.id, row.id));
    }
    for (const [projectId, nextWorkItemNumber] of numberByProject) {
      await transaction
        .update(projects)
        .set({ nextWorkItemNumber, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    }
  });
}

async function finalizeImportSession(
  actor: UserActor,
  workspaceId: string,
  sessionId: string,
  lastErrorCode: string | null,
) {
  await getDb().transaction(async (transaction) => {
    await requireWorkspaceAdmin(transaction, actor, workspaceId);
    const [outcomes, createdProjects] = await Promise.all([
      transaction
        .select({ outcome: migrationImportRows.outcome, total: count() })
        .from(migrationImportRows)
        .where(eq(migrationImportRows.sessionId, sessionId))
        .groupBy(migrationImportRows.outcome),
      transaction
        .select({ total: count() })
        .from(migrationSourceObjects)
        .where(
          and(
            eq(migrationSourceObjects.workspaceId, workspaceId),
            eq(migrationSourceObjects.objectKind, "project"),
            eq(migrationSourceObjects.firstSessionId, sessionId),
          ),
        ),
    ]);
    const counts = new Map(outcomes.map((row) => [row.outcome, row.total]));
    const createdWorkItems = counts.get("created") ?? 0;
    const skippedRows = counts.get("skipped") ?? 0;
    const failedRows = counts.get("failed") ?? 0;
    const blockedRows = counts.get("blocked") ?? 0;
    const completedAt = new Date();
    const state =
      failedRows || blockedRows ? "completed_with_errors" : "completed";
    await transaction
      .update(migrationImportSessions)
      .set({
        state,
        createdProjects: createdProjects[0]?.total ?? 0,
        createdWorkItems,
        skippedRows,
        failedRows,
        committedAnything:
          (createdProjects[0]?.total ?? 0) > 0 || createdWorkItems > 0,
        processingLeaseUntil: null,
        lastErrorCode,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(migrationImportSessions.id, sessionId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "migration_import.completed.v1",
      targetType: "migration_import_session",
      targetId: sessionId,
      metadata: {
        state,
        createdProjects: String(createdProjects[0]?.total ?? 0),
        createdWorkItems: String(createdWorkItems),
        skippedRows: String(skippedRows),
        failedRows: String(failedRows),
        blockedRows: String(blockedRows),
      },
    });
    await recordWorkspaceProductSignal(transaction, {
      workspaceId,
      eventType: "migration_import_completed",
      outcome: state === "completed" ? "succeeded" : "failed",
      dimension: state === "completed" ? "none" : "validation",
      subjectId: sessionId,
    });
  });
}

async function extendImportLease(workspaceId: string, sessionId: string) {
  await getDb()
    .update(migrationImportSessions)
    .set({
      processingLeaseUntil: new Date(Date.now() + IMPORT_LEASE_MS),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(migrationImportSessions.id, sessionId),
        eq(migrationImportSessions.workspaceId, workspaceId),
        eq(migrationImportSessions.state, "committing"),
      ),
    );
}

async function markRowsFailed(ids: string[], code: string, message: string) {
  if (!ids.length) return;
  for (const id of ids) {
    await getDb().transaction((transaction) =>
      updateRowFailure(transaction, id, code, message),
    );
  }
}

async function updateRowFailure(
  transaction: Transaction,
  rowId: string,
  code: string,
  message: string,
) {
  await transaction
    .update(migrationImportRows)
    .set({
      outcome: "failed",
      messages: sql`${migrationImportRows.messages} || ${JSON.stringify([
        { code, message },
      ])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(migrationImportRows.id, rowId));
}

export async function exportDeliveryCore(
  actor: UserActor,
  workspaceId: string,
  filters: DeliveryExportFilters,
) {
  await requireWorkspaceAdmin(getDb(), actor, workspaceId);
  const projectConditions = [eq(projects.workspaceId, workspaceId)];
  if (filters.projectId)
    projectConditions.push(eq(projects.id, filters.projectId));
  if (!filters.includeArchived)
    projectConditions.push(ne(projects.lifecycle, "archived"));
  const [projectRows, projectTotals] = await Promise.all([
    getDb()
      .select({
        id: projects.id,
        clientId: projects.clientId,
        clientName: clients.name,
        clientReference: clients.internalReference,
        key: projects.key,
        name: projects.name,
        summary: projects.summary,
        lifecycle: projects.lifecycle,
        leadEmail: users.email,
        startDate: projects.startDate,
        targetDate: projects.targetDate,
      })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .innerJoin(users, eq(users.id, projects.leadUserId))
      .where(and(...projectConditions))
      .orderBy(asc(projects.key), asc(projects.id))
      .limit(filters.projectId ? 1 : filters.pageSize)
      .offset(filters.projectId ? 0 : (filters.page - 1) * filters.pageSize),
    getDb()
      .select({ total: count() })
      .from(projects)
      .where(and(...projectConditions)),
  ]);
  if (filters.projectId && !projectRows[0]) throw notFound();
  const projectIds = projectRows.map((project) => project.id);
  const workConditions = [inArray(workItems.projectId, projectIds)];
  if (!filters.includeArchived) {
    workConditions.push(isNull(workItems.archivedAt));
  }
  let totalRecordPages = 1;
  let milestoneWindow = { offset: 0, limit: MAX_EXPORT_RECORDS + 1 };
  let cycleWindow = { offset: 0, limit: MAX_EXPORT_RECORDS + 1 };
  let workWindow = { offset: 0, limit: MAX_EXPORT_RECORDS + 1 };
  if (filters.projectId) {
    const [milestoneTotals, cycleTotals, workTotals] = await Promise.all([
      getDb()
        .select({ total: count() })
        .from(milestones)
        .where(eq(milestones.projectId, filters.projectId)),
      getDb()
        .select({ total: count() })
        .from(cycles)
        .where(eq(cycles.projectId, filters.projectId)),
      getDb()
        .select({ total: count() })
        .from(workItems)
        .where(and(...workConditions)),
    ]);
    const milestoneCount = milestoneTotals[0]?.total ?? 0;
    const cycleCount = cycleTotals[0]?.total ?? 0;
    const workCount = workTotals[0]?.total ?? 0;
    const payloadCount = milestoneCount + cycleCount + workCount;
    totalRecordPages = Math.max(
      1,
      Math.ceil(payloadCount / PROJECT_EXPORT_PAYLOAD_RECORDS),
    );
    if (filters.page > totalRecordPages) {
      throw new PlatformError(
        "export_page_not_found",
        404,
        `Project export page ${filters.page} does not exist. This project has ${totalRecordPages} export page${totalRecordPages === 1 ? "" : "s"}.`,
      );
    }
    const payloadOffset = (filters.page - 1) * PROJECT_EXPORT_PAYLOAD_RECORDS;
    milestoneWindow = exportSegmentWindow(0, milestoneCount, payloadOffset);
    cycleWindow = exportSegmentWindow(
      milestoneCount,
      cycleCount,
      payloadOffset,
    );
    workWindow = exportSegmentWindow(
      milestoneCount + cycleCount,
      workCount,
      payloadOffset,
    );
  }
  const [milestoneRows, cycleRows, workRows] = projectIds.length
    ? await Promise.all([
        getDb()
          .select()
          .from(milestones)
          .where(inArray(milestones.projectId, projectIds))
          .orderBy(
            asc(milestones.projectId),
            asc(milestones.sortOrder),
            asc(milestones.id),
          )
          .limit(milestoneWindow.limit)
          .offset(milestoneWindow.offset),
        getDb()
          .select()
          .from(cycles)
          .where(inArray(cycles.projectId, projectIds))
          .orderBy(asc(cycles.projectId), asc(cycles.sequence), asc(cycles.id))
          .limit(cycleWindow.limit)
          .offset(cycleWindow.offset),
        getDb()
          .select({
            id: workItems.id,
            projectId: workItems.projectId,
            number: workItems.number,
            parentId: workItems.parentId,
            milestoneId: workItems.milestoneId,
            cycleId: workItems.cycleId,
            title: workItems.title,
            description: workItems.description,
            acceptanceCriteria: workItems.acceptanceCriteria,
            status: workItems.status,
            priority: workItems.priority,
            purpose: workItems.purpose,
            assigneeEmail: users.email,
            estimatePoints: workItems.estimatePoints,
            targetDate: workItems.targetDate,
            archivedAt: workItems.archivedAt,
          })
          .from(workItems)
          .leftJoin(users, eq(users.id, workItems.assigneeUserId))
          .where(and(...workConditions))
          .orderBy(
            asc(workItems.projectId),
            asc(workItems.number),
            asc(workItems.id),
          )
          .limit(workWindow.limit)
          .offset(workWindow.offset),
      ])
    : [[], [], []];
  const clientCount = new Set(projectRows.map((project) => project.clientId))
    .size;
  const recordCount =
    clientCount +
    projectRows.length +
    milestoneRows.length +
    cycleRows.length +
    workRows.length;
  if (!filters.projectId && recordCount > MAX_EXPORT_RECORDS) {
    throw new PlatformError(
      "export_batch_too_large",
      413,
      `This export exceeds ${MAX_EXPORT_RECORDS} records. Export a single project or a smaller project page.`,
    );
  }
  if (recordCount > MAX_EXPORT_RECORDS) {
    throw new PlatformError(
      "export_batch_too_large",
      500,
      "The project export page exceeded its bounded record limit.",
    );
  }
  const workIds = workRows.map((work) => work.id);
  const [workLabelRows, sourceRows] = workIds.length
    ? await Promise.all([
        getDb()
          .select({
            workItemId: workItemLabels.workItemId,
            name: projectLabels.name,
          })
          .from(workItemLabels)
          .innerJoin(
            projectLabels,
            eq(projectLabels.id, workItemLabels.labelId),
          )
          .where(inArray(workItemLabels.workItemId, workIds))
          .orderBy(asc(projectLabels.name)),
        getDb()
          .select({
            targetWorkItemId: migrationSourceObjects.targetWorkItemId,
            sourceKind: migrationSourceObjects.sourceKind,
            sourceNamespace: migrationSourceObjects.sourceNamespace,
            sourceProjectKey: migrationSourceObjects.sourceProjectKey,
            sourceObjectKey: migrationSourceObjects.sourceObjectKey,
            sourceUrl: migrationSourceObjects.sourceUrl,
            sourceMetadata: migrationSourceObjects.sourceMetadata,
          })
          .from(migrationSourceObjects)
          .where(
            and(
              eq(migrationSourceObjects.workspaceId, workspaceId),
              eq(migrationSourceObjects.objectKind, "work_item"),
              inArray(migrationSourceObjects.targetWorkItemId, workIds),
            ),
          )
          .orderBy(
            asc(migrationSourceObjects.sourceKind),
            asc(migrationSourceObjects.sourceNamespace),
          ),
      ])
    : [[], []];
  const labelsByWork = groupValues(
    workLabelRows,
    (row) => row.workItemId,
    (row) => row.name,
  );
  const sourcesByWork = groupRows(
    sourceRows.filter((row): row is typeof row & { targetWorkItemId: string } =>
      Boolean(row.targetWorkItemId),
    ),
    (row) => row.targetWorkItemId,
  );
  const projectById = new Map(
    projectRows.map((project) => [project.id, project]),
  );
  const includedWorkIds = new Set(workIds);
  const missingParentIds = [
    ...new Set(
      workRows
        .map((work) => work.parentId)
        .filter(
          (parentId): parentId is string =>
            parentId !== null && !includedWorkIds.has(parentId),
        ),
    ),
  ];
  const parentRows = missingParentIds.length
    ? await getDb()
        .select({ id: workItems.id, number: workItems.number })
        .from(workItems)
        .where(inArray(workItems.id, missingParentIds))
    : [];
  const workById = new Map(
    [...workRows, ...parentRows].map((work) => [work.id, work]),
  );
  const header = exportHeader();
  const records: unknown[][] = [];
  for (const project of projectRows) {
    if (
      !records.some(
        (record) => record[1] === "client" && record[2] === project.clientId,
      )
    ) {
      records.push(
        exportRecord({
          recordType: "client",
          clientId: project.clientId,
          clientReference: project.clientReference,
          clientName: project.clientName,
        }),
      );
    }
    records.push(exportRecord({ recordType: "project", project }));
  }
  for (const milestone of milestoneRows) {
    records.push(
      exportRecord({
        recordType: "milestone",
        project: projectById.get(milestone.projectId),
        milestone,
      }),
    );
  }
  for (const cycle of cycleRows) {
    records.push(
      exportRecord({
        recordType: "cycle",
        project: projectById.get(cycle.projectId),
        cycle,
      }),
    );
  }
  for (const work of workRows) {
    const source = sourcesByWork.get(work.id)?.[0];
    const sourceMetadata = source?.sourceMetadata as
      | {
          issueType?: string | null;
          assigneeIdentityKey?: string | null;
          reporterIdentityKey?: string | null;
        }
      | undefined;
    records.push(
      exportRecord({
        recordType: "work_item",
        project: projectById.get(work.projectId),
        work,
        parentWork: work.parentId ? workById.get(work.parentId) : undefined,
        labels: labelsByWork.get(work.id) ?? [],
        source,
        sourceMetadata,
      }),
    );
  }
  const csv =
    [csvRecord(header), ...records.map(csvRecord)].join("\r\n") + "\r\n";
  await getDb().transaction(async (transaction) => {
    await requireWorkspaceAdmin(transaction, actor, workspaceId);
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "delivery_core.exported.v1",
      targetType: filters.projectId ? "project" : "workspace",
      targetId: filters.projectId ?? workspaceId,
      metadata: {
        exportScope: "core_delivery_not_legal_audit",
        page: String(filters.page),
        totalPages: String(totalRecordPages),
        recordCount: String(records.length),
      },
    });
  });
  const total = projectTotals[0]?.total ?? 0;
  return {
    csv,
    fileName: filters.projectId
      ? `scopedelta-delivery-core-${projectRows[0].key}-${new Date().toISOString().slice(0, 10)}-part-${filters.page}-of-${totalRecordPages}.csv`
      : `scopedelta-delivery-core-${new Date().toISOString().slice(0, 10)}-p${filters.page}.csv`,
    recordCount: records.length,
    page: filters.page,
    totalPages: filters.projectId
      ? totalRecordPages
      : Math.max(1, Math.ceil(total / filters.pageSize)),
    hasNextPage: filters.projectId
      ? filters.page < totalRecordPages
      : filters.page * filters.pageSize < total,
    scopeNotice:
      "Core delivery portability export; not a complete legal, commercial, engineering, QA, or audit archive.",
  };
}

function exportSegmentWindow(
  segmentStart: number,
  segmentCount: number,
  payloadOffset: number,
) {
  const pageEnd = payloadOffset + PROJECT_EXPORT_PAYLOAD_RECORDS;
  const segmentEnd = segmentStart + segmentCount;
  const overlapStart = Math.max(segmentStart, payloadOffset);
  const overlapEnd = Math.min(segmentEnd, pageEnd);
  return overlapEnd > overlapStart
    ? { offset: overlapStart - segmentStart, limit: overlapEnd - overlapStart }
    : { offset: 0, limit: 0 };
}

function exportHeader() {
  return [
    "export_scope",
    "record_type",
    "client_id",
    "client_reference",
    "client_name",
    "project_id",
    "project_key",
    "project_name",
    "project_summary",
    "project_lifecycle",
    "lead_reference",
    "project_start_date",
    "project_target_date",
    "milestone_ref",
    "milestone_name",
    "milestone_status",
    "milestone_target_date",
    "cycle_ref",
    "cycle_name",
    "cycle_lifecycle",
    "cycle_start_date",
    "cycle_end_date",
    "work_item_ref",
    "work_item_key",
    "parent_work_item_key",
    "title",
    "description",
    "acceptance_criteria",
    "status",
    "priority",
    "purpose",
    "assignee_reference",
    "estimate_points",
    "target_date",
    "labels",
    "source_kind",
    "source_namespace",
    "source_project_key",
    "source_object_key",
    "source_url",
    "source_issue_type",
    "source_assignee_reference",
    "source_reporter_reference",
  ];
}

type ExportRecordInput = {
  recordType: "client" | "project" | "milestone" | "cycle" | "work_item";
  clientId?: string;
  clientReference?: string | null;
  clientName?: string;
  project?: {
    id: string;
    clientId: string;
    clientReference: string | null;
    clientName: string;
    key: string;
    name: string;
    summary: string | null;
    lifecycle: string;
    leadEmail: string;
    startDate: string | null;
    targetDate: string | null;
  };
  milestone?: {
    id: string;
    name: string;
    status: string;
    targetDate: string | null;
  };
  cycle?: {
    id: string;
    name: string;
    lifecycle: string;
    startDate: string | null;
    endDate: string | null;
  };
  work?: {
    id: string;
    number: number;
    title: string;
    description: string | null;
    acceptanceCriteria: string | null;
    status: string;
    priority: string;
    purpose: string;
    assigneeEmail: string | null;
    estimatePoints: number | null;
    targetDate: string | null;
  };
  parentWork?: { number: number };
  labels?: string[];
  source?: {
    sourceKind: string;
    sourceNamespace: string;
    sourceProjectKey: string;
    sourceObjectKey: string;
    sourceUrl: string | null;
  };
  sourceMetadata?: {
    issueType?: string | null;
    assigneeIdentityKey?: string | null;
    reporterIdentityKey?: string | null;
  };
};

function exportRecord(input: ExportRecordInput) {
  const project = input.project;
  const milestone = input.milestone;
  const cycle = input.cycle;
  const work = input.work;
  const source = input.source;
  const metadata = input.sourceMetadata;
  return [
    "core_delivery_not_legal_audit",
    input.recordType,
    input.clientId ?? project?.clientId,
    input.clientReference ?? project?.clientReference,
    input.clientName ?? project?.clientName,
    project?.id,
    project?.key,
    project?.name,
    project?.summary,
    project?.lifecycle,
    project?.leadEmail,
    project?.startDate,
    project?.targetDate,
    milestone?.id,
    milestone?.name,
    milestone?.status,
    milestone?.targetDate,
    cycle?.id,
    cycle?.name,
    cycle?.lifecycle,
    cycle?.startDate,
    cycle?.endDate,
    work?.id,
    work && project ? `${project.key}-${work.number}` : null,
    input.parentWork && project
      ? `${project.key}-${input.parentWork.number}`
      : null,
    work?.title,
    work?.description,
    work?.acceptanceCriteria,
    work?.status,
    work?.priority,
    work?.purpose,
    work?.assigneeEmail,
    work?.estimatePoints,
    work?.targetDate,
    input.labels?.join("|"),
    source?.sourceKind,
    source?.sourceNamespace,
    source?.sourceProjectKey,
    source?.sourceObjectKey,
    source?.sourceUrl,
    metadata?.issueType,
    metadata?.assigneeIdentityKey,
    metadata?.reporterIdentityKey,
  ];
}

async function getCreatedProject(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  await requireWorkspaceAdmin(getDb(), actor, workspaceId);
  const rows = await getDb()
    .select({
      id: projects.id,
      key: projects.key,
      name: projects.name,
      summary: projects.summary,
      lifecycle: projects.lifecycle,
      startDate: projects.startDate,
      targetDate: projects.targetDate,
      clientId: clients.id,
      clientName: clients.name,
      leadUserId: users.id,
      leadName: users.name,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(users, eq(users.id, projects.leadUserId))
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function requireWorkspaceAdmin(
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
        eq(memberships.status, "active"),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  if (rows[0].role === "member") throw forbidden();
  return rows[0];
}

async function assertActiveClient(
  database: Executor,
  workspaceId: string,
  clientId: string,
) {
  const rows = await database
    .select({ lifecycle: clients.lifecycle })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .limit(1);
  if (!rows[0]) throw notFound();
  if (rows[0].lifecycle !== "active") {
    throw new PlatformError(
      "client_archived",
      409,
      "Choose an active client for the imported project.",
    );
  }
}

async function assertWorkspaceMember(
  database: Executor,
  workspaceId: string,
  userId: string,
) {
  const rows = await database
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
}

async function insertAudit(
  transaction: Transaction,
  actor: UserActor,
  workspaceId: string,
  event: {
    eventType: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, string | string[]>;
  },
) {
  await transaction.insert(auditEvents).values({
    id: randomUUID(),
    workspaceId,
    actorType: "human",
    actorId: actor.userId,
    ...event,
  });
}

function offsetDate(
  baseDate: string | null | undefined,
  offsetDays: number | null | undefined,
) {
  if (!baseDate || offsetDays == null) return null;
  const date = new Date(`${baseDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function sourceObjectIdentity(
  kind: "project" | "work_item",
  projectKey: string,
  objectKey: string,
) {
  return `${kind}\u0000${normalizeKey(projectKey)}\u0000${normalizeKey(objectKey)}`;
}

function sourceObjectLockKey(
  workspaceId: string,
  sourceKind: MigrationSourceKind,
  sourceNamespace: string,
  objectKind: "project" | "work_item",
  sourceProjectKey: string,
  sourceObjectKey: string,
) {
  return JSON.stringify([
    workspaceId,
    sourceKind,
    sourceNamespace,
    objectKind,
    normalizeKey(sourceProjectKey),
    normalizeKey(sourceObjectKey),
  ]);
}

function asNormalizedRow(value: Record<string, unknown>) {
  return value as NormalizedImportRow;
}

function platformCode(error: unknown, fallback: string) {
  if (error instanceof PlatformError) return error.code;
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return `database_${(error as { code: string }).code}`;
  }
  if (
    error &&
    typeof error === "object" &&
    "cause" in error &&
    (error as { cause?: unknown }).cause &&
    typeof (error as { cause: unknown }).cause === "object" &&
    "code" in ((error as { cause: object }).cause as object) &&
    typeof (error as { cause: { code?: unknown } }).cause.code === "string"
  ) {
    return `database_${(error as { cause: { code: string } }).cause.code}`;
  }
  return fallback;
}

function safeImportFailureMessage(error: unknown, fallback: string) {
  return error instanceof PlatformError ? error.message : fallback;
}

function logImportError(stage: "project" | "batch", error: unknown) {
  const structured =
    error && typeof error === "object"
      ? (error as {
          code?: unknown;
          constraint?: unknown;
          cause?: { code?: unknown; constraint?: unknown };
        })
      : {};
  console.error("migration_import_commit_failed", {
    stage,
    code: typeof structured.code === "string" ? structured.code : "unknown",
    constraint:
      typeof structured.constraint === "string"
        ? structured.constraint
        : "unknown",
    implementationError: error instanceof TypeError ? error.message : undefined,
    causeCode:
      typeof structured.cause?.code === "string"
        ? structured.cause.code
        : "unknown",
    causeConstraint:
      typeof structured.cause?.constraint === "string"
        ? structured.cause.constraint
        : "unknown",
  });
}

function isUniqueViolation(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function groupRows<T>(rows: T[], key: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows)
    grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

function groupValues<T>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => string,
) {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    grouped.set(key(row), [...(grouped.get(key(row)) ?? []), value(row)]);
  }
  return grouped;
}
