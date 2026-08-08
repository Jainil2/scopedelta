import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lt,
  max,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditEvents,
  clients,
  cycles,
  memberships,
  milestones,
  projectLabels,
  projectMemberships,
  projects,
  users,
  workItemDependencies,
  workItemLabels,
  workItems,
  type ClientLifecycle,
  type CycleLifecycle,
  type MilestoneStatus,
  type ProjectLifecycle,
  type WorkItemStatus,
} from "@/db/schema";
import type {
  CreateClientInput,
  CreateCycleInput,
  CreateLabelInput,
  CreateMilestoneInput,
  CreateProjectInput,
  CreateWorkItemInput,
  UpdateClientInput,
  UpdateCycleInput,
  UpdateMilestoneInput,
  UpdateProjectInput,
  UpdateWorkItemInput,
  CycleFilters,
  MyWorkFilters,
  WorkItemFilters,
} from "@/lib/delivery-validation";
import {
  communityEntitlementPolicy,
  type EntitlementPolicy,
} from "@/lib/entitlements";
import { forbidden, notFound, PlatformError } from "@/lib/platform-errors";
import { recordWorkItemAssignment } from "@/server/collaboration-events";
import type { UserActor } from "@/server/workspaces";

export type Database = ReturnType<typeof getDb>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

export const WORKFLOW = [
  { id: "backlog", label: "Backlog", category: "unstarted" },
  { id: "ready", label: "Ready", category: "unstarted" },
  { id: "in_progress", label: "In progress", category: "started" },
  { id: "in_review", label: "In review", category: "started" },
  { id: "done", label: "Done", category: "completed" },
  { id: "canceled", label: "Canceled", category: "canceled" },
] as const;

export async function listClients(
  actor: UserActor,
  workspaceId: string,
  page = 1,
  pageSize = 50,
) {
  await getWorkspaceAccess(getDb(), actor, workspaceId);
  const offset = (page - 1) * pageSize;
  const [rows, totals] = await Promise.all([
    getDb()
      .select()
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId))
      .orderBy(asc(clients.lifecycle), asc(clients.name), asc(clients.id))
      .limit(pageSize)
      .offset(offset),
    getDb()
      .select({ total: count() })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId)),
  ]);
  return pageResult(rows, page, pageSize, totals[0]?.total ?? 0);
}

export async function createClient(
  actor: UserActor,
  workspaceId: string,
  input: CreateClientInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const db = getDb();
  await getWorkspaceAccess(db, actor, workspaceId);
  await entitlements.assertAllowed("delivery.client.manage", {
    userId: actor.userId,
    workspaceId,
  });
  const id = randomUUID();
  await db.transaction(async (transaction) => {
    await getWorkspaceAccess(transaction, actor, workspaceId);
    await transaction.insert(clients).values({ id, workspaceId, ...input });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "client.created.v1",
      targetType: "client",
      targetId: id,
      metadata: {},
    });
  });
  return getClient(actor, workspaceId, id);
}

export async function getClient(
  actor: UserActor,
  workspaceId: string,
  clientId: string,
) {
  await getWorkspaceAccess(getDb(), actor, workspaceId);
  const rows = await getDb()
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function updateClient(
  actor: UserActor,
  workspaceId: string,
  clientId: string,
  input: UpdateClientInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const db = getDb();
  await getWorkspaceAccess(db, actor, workspaceId);
  await entitlements.assertAllowed("delivery.client.manage", {
    userId: actor.userId,
    workspaceId,
  });
  await db.transaction(async (transaction) => {
    const access = await getWorkspaceAccess(transaction, actor, workspaceId);
    const current = await transaction
      .select()
      .from(clients)
      .where(
        and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)),
      )
      .limit(1);
    if (!current[0]) throw notFound();
    if (
      input.lifecycle &&
      input.lifecycle !== current[0].lifecycle &&
      access.role === "member"
    ) {
      throw forbidden();
    }
    const lifecycle = input.lifecycle ?? current[0].lifecycle;
    await transaction
      .update(clients)
      .set({
        ...input,
        archivedAt:
          lifecycle === "archived"
            ? (current[0].archivedAt ?? new Date())
            : null,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, clientId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType:
        lifecycle !== current[0].lifecycle
          ? lifecycle === "archived"
            ? "client.archived.v1"
            : "client.restored.v1"
          : "client.updated.v1",
      targetType: "client",
      targetId: clientId,
      metadata: { changedFields: Object.keys(input) },
    });
  });
  return getClient(actor, workspaceId, clientId);
}

export async function listProjects(
  actor: UserActor,
  workspaceId: string,
  page = 1,
  pageSize = 50,
  search = "",
) {
  const access = await getWorkspaceAccess(getDb(), actor, workspaceId);
  const conditions = [eq(projects.workspaceId, workspaceId)];
  if (access.role === "member") {
    conditions.push(eq(projectMemberships.userId, actor.userId));
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(projects.key, pattern),
        ilike(projects.name, pattern),
        ilike(clients.name, pattern),
      )!,
    );
  }
  const query = getDb()
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
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(users, eq(users.id, projects.leadUserId));
  const scoped =
    access.role === "member"
      ? query.innerJoin(
          projectMemberships,
          eq(projectMemberships.projectId, projects.id),
        )
      : query;
  const rows = await scoped
    .where(and(...conditions))
    .orderBy(asc(projects.lifecycle), asc(projects.name), asc(projects.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const totalRows = await getDb()
    .select({ total: count() })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(
      projectMemberships,
      and(
        eq(projectMemberships.projectId, projects.id),
        eq(projectMemberships.userId, actor.userId),
      ),
    )
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        ...(access.role === "member"
          ? [eq(projectMemberships.userId, actor.userId)]
          : []),
        ...(search
          ? [
              or(
                ilike(projects.key, `%${search}%`),
                ilike(projects.name, `%${search}%`),
                ilike(clients.name, `%${search}%`),
              )!,
            ]
          : []),
      ),
    );
  return pageResult(rows, page, pageSize, totalRows[0]?.total ?? 0);
}

export async function createProject(
  actor: UserActor,
  workspaceId: string,
  input: CreateProjectInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const db = getDb();
  await getWorkspaceAccess(db, actor, workspaceId);
  await entitlements.assertAllowed("delivery.project.manage", {
    userId: actor.userId,
    workspaceId,
  });
  const id = randomUUID();
  const normalizedInput = { ...input, key: input.key.toUpperCase() };
  try {
    await db.transaction(async (transaction) => {
      await getWorkspaceAccess(transaction, actor, workspaceId);
      const client = await transaction
        .select({ id: clients.id, lifecycle: clients.lifecycle })
        .from(clients)
        .where(
          and(
            eq(clients.id, normalizedInput.clientId),
            eq(clients.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!client[0]) throw notFound();
      if (client[0].lifecycle === "archived") {
        throw conflict("client_archived", "Restore the client first.");
      }
      await assertWorkspaceMember(
        transaction,
        workspaceId,
        normalizedInput.leadUserId,
      );
      await transaction
        .insert(projects)
        .values({ id, workspaceId, ...normalizedInput });
      await transaction
        .insert(projectMemberships)
        .values(
          [...new Set([actor.userId, normalizedInput.leadUserId])].map(
            (userId) => ({
              projectId: id,
              workspaceId,
              userId,
              addedByUserId: actor.userId,
            }),
          ),
        )
        .onConflictDoNothing();
      await insertAudit(transaction, actor, workspaceId, {
        eventType: "project.created.v1",
        targetType: "project",
        targetId: id,
        metadata: {
          clientId: normalizedInput.clientId,
          leadUserId: normalizedInput.leadUserId,
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict(
        "project_key_conflict",
        "That project key is already used in this workspace.",
        { key: ["Choose a unique project key."] },
      );
    }
    throw error;
  }
  return getProject(actor, workspaceId, id);
}

export async function getProjectByKey(
  actor: UserActor,
  workspaceId: string,
  key: string,
) {
  const db = getDb();
  await getWorkspaceAccess(db, actor, workspaceId);
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.key, key)))
    .limit(1);
  if (!rows[0]) throw notFound();
  return getProject(actor, workspaceId, rows[0].id);
}

export async function getProject(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      clientId: clients.id,
      clientName: clients.name,
      key: projects.key,
      name: projects.name,
      summary: projects.summary,
      leadUserId: users.id,
      leadName: users.name,
      lifecycle: projects.lifecycle,
      startDate: projects.startDate,
      targetDate: projects.targetDate,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(users, eq(users.id, projects.leadUserId))
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  const counts = await getDb()
    .select({ status: workItems.status, total: count() })
    .from(workItems)
    .where(
      and(eq(workItems.projectId, projectId), isNull(workItems.archivedAt)),
    )
    .groupBy(workItems.status);
  return { ...rows[0], counts };
}

export async function updateProject(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: UpdateProjectInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const db = getDb();
  const access = await getProjectAccess(db, actor, workspaceId, projectId);
  assertProjectManager(access, actor.userId);
  await entitlements.assertAllowed("delivery.project.manage", {
    userId: actor.userId,
    workspaceId,
  });
  await db.transaction(async (transaction) => {
    const access = await getProjectAccess(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    assertProjectManager(access, actor.userId);
    if (input.leadUserId) {
      await assertProjectMember(transaction, projectId, input.leadUserId);
    }
    const current = await transaction
      .select({ lifecycle: projects.lifecycle })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!current[0]) throw notFound();
    const lifecycle = input.lifecycle ?? current[0].lifecycle;
    await transaction
      .update(projects)
      .set({
        ...input,
        completedAt:
          lifecycle === "completed"
            ? new Date()
            : lifecycle === "active"
              ? null
              : undefined,
        archivedAt:
          lifecycle === "archived"
            ? new Date()
            : lifecycle === "active"
              ? null
              : undefined,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType:
        lifecycle === current[0].lifecycle
          ? "project.updated.v1"
          : "project.lifecycle.updated.v1",
      targetType: "project",
      targetId: projectId,
      metadata: {
        changedFields: Object.keys(input),
        ...(lifecycle !== current[0].lifecycle
          ? { previousLifecycle: current[0].lifecycle, lifecycle }
          : {}),
      },
    });
  });
  return getProject(actor, workspaceId, projectId);
}

export async function listProjectMembers(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      workspaceRole: memberships.role,
      joinedAt: projectMemberships.createdAt,
    })
    .from(projectMemberships)
    .innerJoin(users, eq(users.id, projectMemberships.userId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.workspaceId, projectMemberships.workspaceId),
        eq(memberships.userId, projectMemberships.userId),
      ),
    )
    .where(eq(projectMemberships.projectId, projectId))
    .orderBy(asc(users.name));
  return {
    role: access.workspaceRole,
    canManage:
      access.workspaceRole !== "member" || access.leadUserId === actor.userId,
    members: rows,
  };
}

export async function addProjectMember(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  userId: string,
) {
  await getDb().transaction(async (transaction) => {
    const access = await getProjectAccess(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    assertProjectManager(access, actor.userId);
    await assertWorkspaceMember(transaction, workspaceId, userId);
    await transaction
      .insert(projectMemberships)
      .values({
        projectId,
        workspaceId,
        userId,
        addedByUserId: actor.userId,
      })
      .onConflictDoNothing();
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "project.membership.added.v1",
      targetType: "project_membership",
      targetId: projectId,
      metadata: { userId },
    });
  });
  return { projectId, userId };
}

export async function removeProjectMember(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  userId: string,
) {
  await getDb().transaction(async (transaction) => {
    const access = await getProjectAccess(
      transaction,
      actor,
      workspaceId,
      projectId,
    );
    assertProjectManager(access, actor.userId);
    const project = await transaction
      .select({ leadUserId: projects.leadUserId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (project[0]?.leadUserId === userId) {
      throw conflict(
        "project_lead_required",
        "Assign another project lead before removing this member.",
      );
    }
    const removed = await transaction
      .delete(projectMemberships)
      .where(
        and(
          eq(projectMemberships.projectId, projectId),
          eq(projectMemberships.userId, userId),
        ),
      )
      .returning({ userId: projectMemberships.userId });
    if (!removed[0]) throw notFound();
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "project.membership.removed.v1",
      targetType: "project_membership",
      targetId: projectId,
      metadata: { userId },
    });
  });
  return { projectId, userId };
}

export async function listMilestones(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  return getDb()
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .orderBy(
      asc(milestones.status),
      asc(milestones.sortOrder),
      asc(milestones.id),
    )
    .limit(100);
}

export async function createMilestone(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateMilestoneInput,
) {
  const id = randomUUID();
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const order = await transaction
      .select({ value: max(milestones.sortOrder) })
      .from(milestones)
      .where(eq(milestones.projectId, projectId));
    await transaction.insert(milestones).values({
      id,
      projectId,
      ...input,
      sortOrder: (order[0]?.value ?? -1) + 1,
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "milestone.created.v1",
      targetType: "milestone",
      targetId: id,
      metadata: { projectId },
    });
  });
  return getMilestone(actor, workspaceId, projectId, id);
}

export async function updateMilestone(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  milestoneId: string,
  input: UpdateMilestoneInput,
) {
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const current = await transaction
      .select({ status: milestones.status })
      .from(milestones)
      .where(
        and(
          eq(milestones.id, milestoneId),
          eq(milestones.projectId, projectId),
        ),
      )
      .limit(1);
    if (!current[0]) throw notFound();
    const status = input.status ?? current[0].status;
    await transaction
      .update(milestones)
      .set({
        ...input,
        archivedAt:
          status === "archived"
            ? new Date()
            : current[0].status === "archived"
              ? null
              : undefined,
        updatedAt: new Date(),
      })
      .where(eq(milestones.id, milestoneId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType:
        status === current[0].status
          ? "milestone.updated.v1"
          : "milestone.status.updated.v1",
      targetType: "milestone",
      targetId: milestoneId,
      metadata: {
        changedFields: Object.keys(input),
        ...(status !== current[0].status
          ? { previousStatus: current[0].status, status }
          : {}),
      },
    });
  });
  return getMilestone(actor, workspaceId, projectId, milestoneId);
}

export async function listCycles(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  filters: CycleFilters = { page: 1, pageSize: 50 },
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const conditions = [eq(cycles.projectId, projectId)];
  if (filters.lifecycle)
    conditions.push(eq(cycles.lifecycle, filters.lifecycle));
  else conditions.push(inArray(cycles.lifecycle, ["planned", "active"]));
  const [rows, totals] = await Promise.all([
    getDb()
      .select()
      .from(cycles)
      .where(and(...conditions))
      .orderBy(desc(cycles.sequence), asc(cycles.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    getDb()
      .select({ total: count() })
      .from(cycles)
      .where(and(...conditions)),
  ]);
  return pageResult(
    rows,
    filters.page,
    filters.pageSize,
    totals[0]?.total ?? 0,
  );
}

export async function createCycle(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateCycleInput,
) {
  assertCycleDates(input.startDate, input.endDate);
  const id = randomUUID();
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    await transaction
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    const latest = await transaction
      .select({ sequence: max(cycles.sequence) })
      .from(cycles)
      .where(eq(cycles.projectId, projectId));
    await transaction.insert(cycles).values({
      id,
      projectId,
      sequence: (latest[0]?.sequence ?? 0) + 1,
      ...input,
    });
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "cycle.created.v1",
      targetType: "cycle",
      targetId: id,
      metadata: { projectId },
    });
  });
  return getCycle(actor, workspaceId, projectId, id);
}

export async function updateCycle(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  cycleId: string,
  input: UpdateCycleInput,
) {
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const current = await transaction
      .select()
      .from(cycles)
      .where(and(eq(cycles.id, cycleId), eq(cycles.projectId, projectId)))
      .limit(1);
    if (!current[0]) throw notFound();
    const startDate = input.startDate ?? current[0].startDate;
    const endDate = input.endDate ?? current[0].endDate;
    assertCycleDates(startDate, endDate);
    const lifecycle = input.lifecycle ?? current[0].lifecycle;
    if (
      current[0].lifecycle === "archived" &&
      lifecycle !== "archived" &&
      lifecycle !== "planned"
    ) {
      throw conflict(
        "cycle_restore_state",
        "Restore an archived cycle to planned before changing its lifecycle.",
      );
    }
    await transaction
      .update(cycles)
      .set({
        ...input,
        completedAt:
          lifecycle === "completed"
            ? (current[0].completedAt ?? new Date())
            : lifecycle === "planned" || lifecycle === "active"
              ? null
              : undefined,
        archivedAt:
          lifecycle === "archived"
            ? (current[0].archivedAt ?? new Date())
            : null,
        updatedAt: new Date(),
      })
      .where(eq(cycles.id, cycleId));
    await insertAudit(transaction, actor, workspaceId, {
      eventType:
        lifecycle === current[0].lifecycle
          ? "cycle.updated.v1"
          : "cycle.lifecycle.updated.v1",
      targetType: "cycle",
      targetId: cycleId,
      metadata: {
        changedFields: Object.keys(input),
        ...(lifecycle !== current[0].lifecycle
          ? { previousLifecycle: current[0].lifecycle, lifecycle }
          : {}),
      },
    });
  });
  return getCycle(actor, workspaceId, projectId, cycleId);
}

export async function listProjectLabels(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  return getDb()
    .select()
    .from(projectLabels)
    .where(eq(projectLabels.projectId, projectId))
    .orderBy(asc(projectLabels.name))
    .limit(100);
}

export async function createProjectLabel(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateLabelInput,
) {
  const id = randomUUID();
  try {
    await getDb().transaction(async (transaction) => {
      await assertWritableProject(transaction, actor, workspaceId, projectId);
      await transaction
        .insert(projectLabels)
        .values({ id, projectId, ...input });
      await insertAudit(transaction, actor, workspaceId, {
        eventType: "project.label.created.v1",
        targetType: "project_label",
        targetId: id,
        metadata: { projectId },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("label_conflict", "That label already exists.");
    }
    throw error;
  }
  return { id, projectId, ...input };
}

export async function listWorkItems(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  filters: WorkItemFilters,
) {
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const conditions = [
    eq(workItems.projectId, projectId),
    isNull(workItems.archivedAt),
  ];
  if (filters.status) conditions.push(eq(workItems.status, filters.status));
  if (filters.priority)
    conditions.push(eq(workItems.priority, filters.priority));
  if (filters.assigneeUserId)
    conditions.push(eq(workItems.assigneeUserId, filters.assigneeUserId));
  if (filters.milestoneId)
    conditions.push(eq(workItems.milestoneId, filters.milestoneId));
  if (filters.cycleId) conditions.push(eq(workItems.cycleId, filters.cycleId));
  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(
      or(
        ilike(workItems.title, pattern),
        sql`${workItems.number}::text ilike ${pattern}`,
        sql`${access.key} || '-' || ${workItems.number}::text ilike ${pattern}`,
      )!,
    );
  }

  const base = getDb()
    .select({
      id: workItems.id,
      number: workItems.number,
      parentId: workItems.parentId,
      title: workItems.title,
      description: workItems.description,
      acceptanceCriteria: workItems.acceptanceCriteria,
      status: workItems.status,
      priority: workItems.priority,
      estimatePoints: workItems.estimatePoints,
      targetDate: workItems.targetDate,
      sortOrder: workItems.sortOrder,
      assigneeUserId: users.id,
      assigneeName: users.name,
      milestoneId: milestones.id,
      milestoneName: milestones.name,
      cycleId: cycles.id,
      cycleName: cycles.name,
      cycleLifecycle: cycles.lifecycle,
      updatedAt: workItems.updatedAt,
    })
    .from(workItems)
    .leftJoin(users, eq(users.id, workItems.assigneeUserId))
    .leftJoin(milestones, eq(milestones.id, workItems.milestoneId))
    .leftJoin(cycles, eq(cycles.id, workItems.cycleId));
  const scoped = filters.labelId
    ? base.innerJoin(
        workItemLabels,
        and(
          eq(workItemLabels.workItemId, workItems.id),
          eq(workItemLabels.labelId, filters.labelId),
        ),
      )
    : base;
  const rows = await scoped
    .where(and(...conditions))
    .orderBy(
      sql`array_position(array['backlog','ready','in_progress','in_review','done','canceled']::work_item_status[], ${workItems.status})`,
      asc(workItems.sortOrder),
      asc(workItems.number),
    )
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);
  const ids = rows.map((row) => row.id);
  const labels = ids.length
    ? await getDb()
        .select({
          workItemId: workItemLabels.workItemId,
          id: projectLabels.id,
          name: projectLabels.name,
          color: projectLabels.color,
        })
        .from(workItemLabels)
        .innerJoin(projectLabels, eq(projectLabels.id, workItemLabels.labelId))
        .where(inArray(workItemLabels.workItemId, ids))
        .orderBy(asc(projectLabels.name))
    : [];
  const totalRows = await getDb()
    .select({ total: count() })
    .from(workItems)
    .leftJoin(
      workItemLabels,
      and(
        eq(workItemLabels.workItemId, workItems.id),
        ...(filters.labelId
          ? [eq(workItemLabels.labelId, filters.labelId)]
          : [sql`false`]),
      ),
    )
    .where(
      and(
        ...conditions,
        ...(filters.labelId
          ? [eq(workItemLabels.labelId, filters.labelId)]
          : []),
      ),
    );
  const projectKey = await awaitProjectKey(projectId);
  const withLabels = rows.map((row) => ({
    ...row,
    identifier: `${projectKey}-${row.number}`,
    labels: labels.filter((label) => label.workItemId === row.id),
  }));
  return pageResult(
    withLabels,
    filters.page,
    filters.pageSize,
    totalRows[0]?.total ?? 0,
  );
}

export async function listMyWork(
  actor: UserActor,
  workspaceId: string,
  filters: MyWorkFilters,
) {
  const access = await getWorkspaceAccess(getDb(), actor, workspaceId);
  const conditions = [
    eq(projects.workspaceId, workspaceId),
    eq(projects.lifecycle, "active" as const),
    eq(clients.lifecycle, "active" as const),
    eq(workItems.assigneeUserId, actor.userId),
    isNull(workItems.archivedAt),
  ];
  if (filters.status) conditions.push(eq(workItems.status, filters.status));
  else conditions.push(notInArray(workItems.status, ["done", "canceled"]));
  if (filters.priority)
    conditions.push(eq(workItems.priority, filters.priority));
  if (filters.milestoneId)
    conditions.push(eq(workItems.milestoneId, filters.milestoneId));
  if (filters.cycleId) conditions.push(eq(workItems.cycleId, filters.cycleId));
  if (filters.projectKey) conditions.push(eq(projects.key, filters.projectKey));
  if (access.role === "member")
    conditions.push(eq(projectMemberships.userId, actor.userId));
  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(
      or(
        ilike(workItems.title, pattern),
        ilike(projects.key, pattern),
        ilike(projects.name, pattern),
        ilike(clients.name, pattern),
        sql`${workItems.number}::text ilike ${pattern}`,
        sql`${projects.key} || '-' || ${workItems.number}::text ilike ${pattern}`,
      )!,
    );
  }

  const base = getDb()
    .select({
      id: workItems.id,
      number: workItems.number,
      parentId: workItems.parentId,
      title: workItems.title,
      status: workItems.status,
      priority: workItems.priority,
      targetDate: workItems.targetDate,
      estimatePoints: workItems.estimatePoints,
      projectId: projects.id,
      projectKey: projects.key,
      projectName: projects.name,
      clientName: clients.name,
      assigneeUserId: users.id,
      assigneeName: users.name,
      milestoneId: milestones.id,
      milestoneName: milestones.name,
      cycleId: cycles.id,
      cycleName: cycles.name,
      cycleLifecycle: cycles.lifecycle,
      updatedAt: workItems.updatedAt,
    })
    .from(workItems)
    .innerJoin(projects, eq(projects.id, workItems.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(users, eq(users.id, workItems.assigneeUserId))
    .leftJoin(milestones, eq(milestones.id, workItems.milestoneId))
    .leftJoin(cycles, eq(cycles.id, workItems.cycleId));
  const accessible =
    access.role === "member"
      ? base.innerJoin(
          projectMemberships,
          and(
            eq(projectMemberships.projectId, projects.id),
            eq(projectMemberships.userId, actor.userId),
          ),
        )
      : base;
  const scoped = filters.labelId
    ? accessible.innerJoin(
        workItemLabels,
        and(
          eq(workItemLabels.workItemId, workItems.id),
          eq(workItemLabels.labelId, filters.labelId),
        ),
      )
    : accessible;
  const rows = await scoped
    .where(and(...conditions))
    .orderBy(
      asc(workItems.targetDate),
      desc(workItems.priority),
      asc(projects.key),
      asc(workItems.number),
    )
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);
  const ids = rows.map((row) => row.id);
  const labels = ids.length
    ? await getDb()
        .select({
          workItemId: workItemLabels.workItemId,
          id: projectLabels.id,
          name: projectLabels.name,
          color: projectLabels.color,
        })
        .from(workItemLabels)
        .innerJoin(projectLabels, eq(projectLabels.id, workItemLabels.labelId))
        .where(inArray(workItemLabels.workItemId, ids))
        .orderBy(asc(projectLabels.name))
    : [];
  const totalRows = await getDb()
    .select({ total: count() })
    .from(workItems)
    .innerJoin(projects, eq(projects.id, workItems.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(
      projectMemberships,
      and(
        eq(projectMemberships.projectId, projects.id),
        eq(projectMemberships.userId, actor.userId),
      ),
    )
    .leftJoin(
      workItemLabels,
      and(
        eq(workItemLabels.workItemId, workItems.id),
        ...(filters.labelId
          ? [eq(workItemLabels.labelId, filters.labelId)]
          : [sql`false`]),
      ),
    )
    .where(
      and(
        ...conditions,
        ...(filters.labelId
          ? [eq(workItemLabels.labelId, filters.labelId)]
          : []),
      ),
    );
  return pageResult(
    rows.map((row) => ({
      ...row,
      identifier: `${row.projectKey}-${row.number}`,
      labels: labels.filter((label) => label.workItemId === row.id),
    })),
    filters.page,
    filters.pageSize,
    totalRows[0]?.total ?? 0,
  );
}

export async function listMyWorkFacets(actor: UserActor, workspaceId: string) {
  const access = await getWorkspaceAccess(getDb(), actor, workspaceId);
  const conditions = [
    eq(projects.workspaceId, workspaceId),
    eq(projects.lifecycle, "active" as const),
    eq(clients.lifecycle, "active" as const),
    eq(workItems.assigneeUserId, actor.userId),
    isNull(workItems.archivedAt),
    ...(access.role === "member"
      ? [eq(projectMemberships.userId, actor.userId)]
      : []),
  ];
  const accessibleWork = () =>
    getDb()
      .selectDistinct({
        projectId: projects.id,
        projectKey: projects.key,
        projectName: projects.name,
        clientName: clients.name,
      })
      .from(workItems)
      .innerJoin(projects, eq(projects.id, workItems.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(
        projectMemberships,
        and(
          eq(projectMemberships.projectId, projects.id),
          eq(projectMemberships.userId, actor.userId),
        ),
      );
  const [projectRows, milestoneRows, cycleRows, labelRows] = await Promise.all([
    accessibleWork()
      .where(and(...conditions))
      .orderBy(asc(projects.key))
      .limit(100),
    getDb()
      .selectDistinct({
        id: milestones.id,
        name: milestones.name,
        projectKey: projects.key,
      })
      .from(workItems)
      .innerJoin(projects, eq(projects.id, workItems.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .innerJoin(milestones, eq(milestones.id, workItems.milestoneId))
      .leftJoin(
        projectMemberships,
        and(
          eq(projectMemberships.projectId, projects.id),
          eq(projectMemberships.userId, actor.userId),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(projects.key), asc(milestones.name))
      .limit(100),
    getDb()
      .selectDistinct({
        id: cycles.id,
        name: cycles.name,
        projectKey: projects.key,
      })
      .from(workItems)
      .innerJoin(projects, eq(projects.id, workItems.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .innerJoin(cycles, eq(cycles.id, workItems.cycleId))
      .leftJoin(
        projectMemberships,
        and(
          eq(projectMemberships.projectId, projects.id),
          eq(projectMemberships.userId, actor.userId),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(projects.key), asc(cycles.name))
      .limit(100),
    getDb()
      .selectDistinct({
        id: projectLabels.id,
        name: projectLabels.name,
        projectKey: projects.key,
      })
      .from(workItems)
      .innerJoin(projects, eq(projects.id, workItems.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .innerJoin(workItemLabels, eq(workItemLabels.workItemId, workItems.id))
      .innerJoin(projectLabels, eq(projectLabels.id, workItemLabels.labelId))
      .leftJoin(
        projectMemberships,
        and(
          eq(projectMemberships.projectId, projects.id),
          eq(projectMemberships.userId, actor.userId),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(projects.key), asc(projectLabels.name))
      .limit(100),
  ]);
  return {
    projects: projectRows,
    milestones: milestoneRows,
    cycles: cycleRows,
    labels: labelRows,
  };
}

export async function createWorkItem(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateWorkItemInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const db = getDb();
  await getProjectAccess(db, actor, workspaceId, projectId);
  await entitlements.assertAllowed("delivery.work.manage", {
    userId: actor.userId,
    workspaceId,
  });
  const id = randomUUID();
  await db.transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    await validateWorkReferences(transaction, projectId, input);
    const allocation = await transaction
      .update(projects)
      .set({
        nextWorkItemNumber: sql`${projects.nextWorkItemNumber} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning({
        number: sql<number>`${projects.nextWorkItemNumber} - 1`,
      });
    if (!allocation[0]) throw notFound();
    const order = await nextWorkOrder(transaction, projectId, input.status);
    const { labelIds, ...values } = input;
    await transaction.insert(workItems).values({
      id,
      projectId,
      number: allocation[0].number,
      sortOrder: order,
      ...values,
    });
    await replaceLabels(transaction, projectId, id, labelIds);
    const eventId = await insertAudit(transaction, actor, workspaceId, {
      eventType: "work_item.created.v1",
      targetType: "work_item",
      targetId: id,
      metadata: { projectId, status: input.status },
    });
    if (input.assigneeUserId) {
      await recordWorkItemAssignment(transaction, {
        workspaceId,
        projectId,
        workItemId: id,
        assigneeUserId: input.assigneeUserId,
        actorUserId: actor.userId,
        eventId,
      });
    }
  });
  return getWorkItem(actor, workspaceId, projectId, id);
}

export async function getWorkItem(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({
      id: workItems.id,
      number: workItems.number,
      parentId: workItems.parentId,
      title: workItems.title,
      description: workItems.description,
      acceptanceCriteria: workItems.acceptanceCriteria,
      status: workItems.status,
      priority: workItems.priority,
      assigneeUserId: users.id,
      assigneeName: users.name,
      estimatePoints: workItems.estimatePoints,
      targetDate: workItems.targetDate,
      milestoneId: milestones.id,
      milestoneName: milestones.name,
      cycleId: cycles.id,
      cycleName: cycles.name,
      cycleLifecycle: cycles.lifecycle,
      sortOrder: workItems.sortOrder,
      archivedAt: workItems.archivedAt,
      createdAt: workItems.createdAt,
      updatedAt: workItems.updatedAt,
    })
    .from(workItems)
    .leftJoin(users, eq(users.id, workItems.assigneeUserId))
    .leftJoin(milestones, eq(milestones.id, workItems.milestoneId))
    .leftJoin(cycles, eq(cycles.id, workItems.cycleId))
    .where(
      and(eq(workItems.id, workItemId), eq(workItems.projectId, projectId)),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  const labels = await getDb()
    .select({
      id: projectLabels.id,
      name: projectLabels.name,
      color: projectLabels.color,
    })
    .from(workItemLabels)
    .innerJoin(projectLabels, eq(projectLabels.id, workItemLabels.labelId))
    .where(eq(workItemLabels.workItemId, workItemId))
    .orderBy(asc(projectLabels.name));
  const key = await awaitProjectKey(projectId);
  return {
    ...rows[0],
    identifier: `${key}-${rows[0].number}`,
    labels,
  };
}

export async function updateWorkItem(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  input: UpdateWorkItemInput,
) {
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const current = await transaction
      .select()
      .from(workItems)
      .where(
        and(eq(workItems.id, workItemId), eq(workItems.projectId, projectId)),
      )
      .limit(1);
    if (!current[0]) throw notFound();
    if (
      current[0].status === "canceled" &&
      input.status &&
      input.status !== "canceled"
    ) {
      throw conflict("terminal_status", "Canceled work cannot be reopened.");
    }
    if (input.parentId === workItemId) {
      throw conflict("invalid_parent", "Work cannot be its own parent.");
    }
    if (input.parentId && input.parentId !== current[0].parentId) {
      const children = await transaction
        .select({ total: count() })
        .from(workItems)
        .where(eq(workItems.parentId, workItemId));
      if ((children[0]?.total ?? 0) > 0) {
        throw conflict(
          "invalid_parent",
          "A parent with subtasks cannot become a subtask.",
        );
      }
    }
    await validateWorkReferences(transaction, projectId, {
      ...(input.assigneeUserId !== undefined &&
      input.assigneeUserId !== current[0].assigneeUserId
        ? { assigneeUserId: input.assigneeUserId }
        : {}),
      ...(input.milestoneId !== undefined &&
      input.milestoneId !== current[0].milestoneId
        ? { milestoneId: input.milestoneId }
        : {}),
      ...(input.cycleId !== undefined && input.cycleId !== current[0].cycleId
        ? { cycleId: input.cycleId }
        : {}),
      ...(input.parentId !== undefined && input.parentId !== current[0].parentId
        ? { parentId: input.parentId }
        : {}),
    });
    if (input.archived && !current[0].archivedAt) {
      const childRows = await transaction
        .select({ total: count() })
        .from(workItems)
        .where(
          and(eq(workItems.parentId, workItemId), isNull(workItems.archivedAt)),
        );
      if ((childRows[0]?.total ?? 0) > 0) {
        throw conflict(
          "active_subtasks",
          "Archive active subtasks before archiving their parent.",
        );
      }
    }
    if (input.archived === false && current[0].parentId) {
      const parent = await transaction
        .select({ archivedAt: workItems.archivedAt })
        .from(workItems)
        .where(eq(workItems.id, current[0].parentId))
        .limit(1);
      if (parent[0]?.archivedAt) {
        throw conflict("parent_archived", "Restore the parent first.");
      }
    }
    const { labelIds, archived, ...values } = input;
    const statusChanged = values.status && values.status !== current[0].status;
    const sortOrder = statusChanged
      ? await nextWorkOrder(transaction, projectId, values.status!)
      : undefined;
    await transaction
      .update(workItems)
      .set({
        ...values,
        ...(sortOrder === undefined ? {} : { sortOrder }),
        ...(archived === undefined
          ? {}
          : { archivedAt: archived ? new Date() : null }),
        updatedAt: new Date(),
      })
      .where(eq(workItems.id, workItemId));
    if (labelIds)
      await replaceLabels(transaction, projectId, workItemId, labelIds);
    const events: Array<Parameters<typeof insertAudit>[3]> = [];
    if (statusChanged) {
      events.push({
        eventType: "work_item.status.updated.v1",
        targetType: "work_item",
        targetId: workItemId,
        metadata: { previousStatus: current[0].status, status: values.status! },
      });
    }
    if (
      values.assigneeUserId !== undefined &&
      values.assigneeUserId !== current[0].assigneeUserId
    ) {
      events.push({
        eventType: "work_item.assignee.updated.v1",
        targetType: "work_item",
        targetId: workItemId,
        metadata: {
          previousAssigneeUserId: current[0].assigneeUserId ?? "",
          assigneeUserId: values.assigneeUserId ?? "",
        },
      });
    }
    if (
      values.milestoneId !== undefined &&
      values.milestoneId !== current[0].milestoneId
    ) {
      events.push({
        eventType: "work_item.milestone.updated.v1",
        targetType: "work_item",
        targetId: workItemId,
        metadata: {
          previousMilestoneId: current[0].milestoneId ?? "",
          milestoneId: values.milestoneId ?? "",
        },
      });
    }
    if (values.cycleId !== undefined && values.cycleId !== current[0].cycleId) {
      events.push({
        eventType: "work_item.cycle.updated.v1",
        targetType: "work_item",
        targetId: workItemId,
        metadata: {
          previousCycleId: current[0].cycleId ?? "",
          cycleId: values.cycleId ?? "",
        },
      });
    }
    if (archived !== undefined && Boolean(current[0].archivedAt) !== archived) {
      events.push({
        eventType: archived ? "work_item.archived.v1" : "work_item.restored.v1",
        targetType: "work_item",
        targetId: workItemId,
        metadata: {},
      });
    }
    if (!events.length) {
      events.push({
        eventType: "work_item.updated.v1",
        targetType: "work_item",
        targetId: workItemId,
        metadata: { changedFields: Object.keys(input) },
      });
    }
    await insertWorkItemAudits(transaction, actor, workspaceId, projectId, {
      workItemId,
      assigneeUserId: values.assigneeUserId,
      events,
    });
  });
  return getWorkItem(actor, workspaceId, projectId, workItemId);
}

export async function reorderWorkItem(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
  direction: "up" | "down",
) {
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    await transaction
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    const current = await transaction
      .select({ status: workItems.status, sortOrder: workItems.sortOrder })
      .from(workItems)
      .where(
        and(
          eq(workItems.id, workItemId),
          eq(workItems.projectId, projectId),
          isNull(workItems.archivedAt),
        ),
      )
      .limit(1);
    if (!current[0]) throw notFound();
    const neighbor = await transaction
      .select({ id: workItems.id, sortOrder: workItems.sortOrder })
      .from(workItems)
      .where(
        and(
          eq(workItems.projectId, projectId),
          eq(workItems.status, current[0].status),
          isNull(workItems.archivedAt),
          direction === "up"
            ? lt(workItems.sortOrder, current[0].sortOrder)
            : gt(workItems.sortOrder, current[0].sortOrder),
        ),
      )
      .orderBy(
        direction === "up"
          ? desc(workItems.sortOrder)
          : asc(workItems.sortOrder),
      )
      .limit(1);
    if (!neighbor[0]) return;
    await transaction
      .update(workItems)
      .set({ sortOrder: neighbor[0].sortOrder, updatedAt: new Date() })
      .where(eq(workItems.id, workItemId));
    await transaction
      .update(workItems)
      .set({ sortOrder: current[0].sortOrder, updatedAt: new Date() })
      .where(eq(workItems.id, neighbor[0].id));
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "work_item.reordered.v1",
      targetType: "work_item",
      targetId: workItemId,
      metadata: { direction },
    });
  });
  return { id: workItemId, direction };
}

export async function addDependency(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  blockerWorkItemId: string,
  blockedWorkItemId: string,
) {
  if (blockerWorkItemId === blockedWorkItemId) {
    throw conflict("dependency_self", "Work cannot block itself.");
  }
  const id = randomUUID();
  try {
    await getDb().transaction(async (transaction) => {
      await assertWritableProject(transaction, actor, workspaceId, projectId);
      await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
      const items = await transaction
        .select({ id: workItems.id, archivedAt: workItems.archivedAt })
        .from(workItems)
        .where(
          and(
            eq(workItems.projectId, projectId),
            inArray(workItems.id, [blockerWorkItemId, blockedWorkItemId]),
          ),
        );
      if (items.length !== 2) throw notFound();
      if (items.some((item) => item.archivedAt)) {
        throw conflict(
          "dependency_archived",
          "Archived work cannot receive new dependencies.",
        );
      }
      const cycle = await transaction.execute<{ id: string }>(sql`
        with recursive reachable(id) as (
          select ${workItemDependencies.blockedWorkItemId}
          from ${workItemDependencies}
          where ${workItemDependencies.projectId} = ${projectId}
            and ${workItemDependencies.blockerWorkItemId} = ${blockedWorkItemId}
          union
          select dependency.${sql.identifier("blocked_work_item_id")}
          from ${workItemDependencies} dependency
          inner join reachable on dependency.${sql.identifier("blocker_work_item_id")} = reachable.id
          where dependency.${sql.identifier("project_id")} = ${projectId}
        )
        select id from reachable where id = ${blockerWorkItemId} limit 1
      `);
      if (cycle.rows[0]) {
        throw conflict(
          "dependency_cycle",
          "That dependency would create a cycle.",
        );
      }
      await transaction.insert(workItemDependencies).values({
        id,
        projectId,
        blockerWorkItemId,
        blockedWorkItemId,
        createdByUserId: actor.userId,
      });
      await insertAudit(transaction, actor, workspaceId, {
        eventType: "work_item.dependency.added.v1",
        targetType: "work_item_dependency",
        targetId: id,
        metadata: { blockerWorkItemId, blockedWorkItemId },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("dependency_conflict", "That dependency already exists.");
    }
    throw error;
  }
  return { id, projectId, blockerWorkItemId, blockedWorkItemId };
}

export async function listDependencies(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const blocker = getDb()
    .$with("blocker")
    .as(
      getDb()
        .select({
          id: workItems.id,
          number: workItems.number,
          title: workItems.title,
        })
        .from(workItems)
        .where(eq(workItems.projectId, projectId)),
    );
  const blocked = getDb()
    .$with("blocked")
    .as(
      getDb()
        .select({
          id: workItems.id,
          number: workItems.number,
          title: workItems.title,
        })
        .from(workItems)
        .where(eq(workItems.projectId, projectId)),
    );
  const key = await awaitProjectKey(projectId);
  const rows = await getDb()
    .with(blocker, blocked)
    .select({
      id: workItemDependencies.id,
      blockerWorkItemId: workItemDependencies.blockerWorkItemId,
      blockerNumber: blocker.number,
      blockerTitle: blocker.title,
      blockedWorkItemId: workItemDependencies.blockedWorkItemId,
      blockedNumber: blocked.number,
      blockedTitle: blocked.title,
    })
    .from(workItemDependencies)
    .innerJoin(blocker, eq(blocker.id, workItemDependencies.blockerWorkItemId))
    .innerJoin(blocked, eq(blocked.id, workItemDependencies.blockedWorkItemId))
    .where(eq(workItemDependencies.projectId, projectId))
    .orderBy(asc(blocker.number), asc(blocked.number))
    .limit(200);
  return rows.map((row) => ({
    ...row,
    blockerIdentifier: `${key}-${row.blockerNumber}`,
    blockedIdentifier: `${key}-${row.blockedNumber}`,
  }));
}

export async function removeDependency(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  dependencyId: string,
) {
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const removed = await transaction
      .delete(workItemDependencies)
      .where(
        and(
          eq(workItemDependencies.id, dependencyId),
          eq(workItemDependencies.projectId, projectId),
        ),
      )
      .returning({ id: workItemDependencies.id });
    if (!removed[0]) throw notFound();
    await insertAudit(transaction, actor, workspaceId, {
      eventType: "work_item.dependency.removed.v1",
      targetType: "work_item_dependency",
      targetId: dependencyId,
      metadata: {},
    });
  });
  return { id: dependencyId };
}

async function getMilestone(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  milestoneId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select()
    .from(milestones)
    .where(
      and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function getCycle(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  cycleId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select()
    .from(cycles)
    .where(and(eq(cycles.id, cycleId), eq(cycles.projectId, projectId)))
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function getWorkspaceAccess(
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
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function getProjectAccess(
  database: Executor,
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  const workspace = await getWorkspaceAccess(database, actor, workspaceId);
  const rows = await database
    .select({
      key: projects.key,
      leadUserId: projects.leadUserId,
      lifecycle: projects.lifecycle,
    })
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  if (workspace.role === "member") {
    const projectMember = await database
      .select({ userId: projectMemberships.userId })
      .from(projectMemberships)
      .where(
        and(
          eq(projectMemberships.projectId, projectId),
          eq(projectMemberships.userId, actor.userId),
        ),
      )
      .limit(1);
    if (!projectMember[0]) throw notFound();
  }
  return {
    workspaceRole: workspace.role,
    key: rows[0].key,
    leadUserId: rows[0].leadUserId,
    lifecycle: rows[0].lifecycle,
  };
}

export async function assertWritableProject(
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
  if (access.lifecycle !== "active") {
    throw conflict(
      "project_read_only",
      "Restore the project before changing it.",
    );
  }
  return access;
}

function assertProjectManager(
  access: {
    workspaceRole: "owner" | "admin" | "member";
    leadUserId: string;
  },
  actorUserId: string,
) {
  if (access.workspaceRole === "member" && access.leadUserId !== actorUserId) {
    throw forbidden();
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
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
}

async function assertProjectMember(
  database: Executor,
  projectId: string,
  userId: string,
) {
  const rows = await database
    .select({ userId: projectMemberships.userId })
    .from(projectMemberships)
    .where(
      and(
        eq(projectMemberships.projectId, projectId),
        eq(projectMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    throw conflict(
      "project_membership_required",
      "The assignee or lead must be a project member.",
    );
  }
}

async function validateWorkReferences(
  database: Executor,
  projectId: string,
  input: Partial<CreateWorkItemInput>,
) {
  if (input.assigneeUserId) {
    await assertProjectMember(database, projectId, input.assigneeUserId);
  }
  if (input.milestoneId) {
    const rows = await database
      .select({ status: milestones.status })
      .from(milestones)
      .where(
        and(
          eq(milestones.id, input.milestoneId),
          eq(milestones.projectId, projectId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw notFound();
    if (rows[0].status === "archived") {
      throw conflict("milestone_archived", "Choose an active milestone.");
    }
  }
  if (input.cycleId) {
    const rows = await database
      .select({ lifecycle: cycles.lifecycle })
      .from(cycles)
      .where(and(eq(cycles.id, input.cycleId), eq(cycles.projectId, projectId)))
      .limit(1);
    if (!rows[0]) throw notFound();
    if (rows[0].lifecycle !== "planned" && rows[0].lifecycle !== "active") {
      throw conflict(
        "cycle_not_plannable",
        "Choose a planned or active cycle.",
      );
    }
  }
  if (input.parentId) {
    const rows = await database
      .select({
        parentId: workItems.parentId,
        archivedAt: workItems.archivedAt,
      })
      .from(workItems)
      .where(
        and(
          eq(workItems.id, input.parentId),
          eq(workItems.projectId, projectId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw notFound();
    if (rows[0].parentId || rows[0].archivedAt) {
      throw conflict(
        "invalid_parent",
        "Subtasks can only belong to an active top-level work item.",
      );
    }
  }
}

async function replaceLabels(
  transaction: Transaction,
  projectId: string,
  workItemId: string,
  labelIds: string[],
) {
  await transaction
    .delete(workItemLabels)
    .where(eq(workItemLabels.workItemId, workItemId));
  const uniqueIds = [...new Set(labelIds)];
  if (!uniqueIds.length) return;
  const valid = await transaction
    .select({ id: projectLabels.id })
    .from(projectLabels)
    .where(
      and(
        eq(projectLabels.projectId, projectId),
        inArray(projectLabels.id, uniqueIds),
      ),
    );
  if (valid.length !== uniqueIds.length) throw notFound();
  await transaction
    .insert(workItemLabels)
    .values(uniqueIds.map((labelId) => ({ workItemId, projectId, labelId })));
}

async function nextWorkOrder(
  transaction: Transaction,
  projectId: string,
  status: WorkItemStatus,
) {
  const rows = await transaction
    .select({ value: max(workItems.sortOrder) })
    .from(workItems)
    .where(
      and(eq(workItems.projectId, projectId), eq(workItems.status, status)),
    );
  return (rows[0]?.value ?? -1) + 1;
}

async function awaitProjectKey(projectId: string) {
  const rows = await getDb()
    .select({ key: projects.key })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0].key;
}

export async function insertAudit(
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
  const id = randomUUID();
  await transaction.insert(auditEvents).values({
    id,
    workspaceId,
    actorType: "human",
    actorId: actor.userId,
    ...event,
  });
  return id;
}

async function insertWorkItemAudits(
  transaction: Transaction,
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: {
    workItemId: string;
    assigneeUserId?: string | null;
    events: Array<Parameters<typeof insertAudit>[3]>;
  },
) {
  for (const event of input.events) {
    const eventId = await insertAudit(transaction, actor, workspaceId, event);
    if (
      event.eventType === "work_item.assignee.updated.v1" &&
      input.assigneeUserId
    ) {
      await recordWorkItemAssignment(transaction, {
        workspaceId,
        projectId,
        workItemId: input.workItemId,
        assigneeUserId: input.assigneeUserId,
        actorUserId: actor.userId,
        eventId,
      });
    }
  }
}

function pageResult<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number,
) {
  return {
    items,
    pageInfo: {
      page,
      pageSize,
      total,
      hasNextPage: page * pageSize < total,
    },
  };
}

function conflict(
  code: string,
  message: string,
  fieldErrors?: Record<string, string[]>,
) {
  return new PlatformError(code, 409, message, fieldErrors);
}

function assertCycleDates(startDate: string, endDate: string) {
  if (startDate > endDate) {
    throw new PlatformError(
      "validation_error",
      400,
      "Check the submitted fields and try again.",
      { endDate: ["End date must be on or after the start date."] },
    );
  }
}

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { cause?: { code?: string } };
  return candidate.cause?.code === "23505";
}

export type DeliveryClientLifecycle = ClientLifecycle;
export type DeliveryProjectLifecycle = ProjectLifecycle;
export type DeliveryMilestoneStatus = MilestoneStatus;
export type DeliveryCycleLifecycle = CycleLifecycle;
