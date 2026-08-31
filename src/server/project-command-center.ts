import {
  and,
  asc,
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
  cycles,
  memberships,
  milestones,
  projectMemberships,
  users,
  workItems,
  type WorkspaceRole,
} from "@/db/schema";
import { getCommercialDriftSnapshotForProject } from "@/server/commercial";
import {
  listWorkspaceMembers,
  type UserActor,
  type WorkspaceSummary,
} from "@/server/workspaces";

type ProjectIdentity = {
  id: string;
  key: string;
  leadUserId: string;
  workspaceRole: WorkspaceRole;
  canManage: boolean;
};

/**
 * Builds the overview read model after the cached project loader has resolved
 * project access. These projection queries never re-authorize the project.
 */
export async function getProjectCommandCenter(
  actor: UserActor,
  workspace: WorkspaceSummary,
  project: ProjectIdentity,
) {
  const db = getDb();
  const canManage = project.canManage;
  const attentionConditions = and(
    eq(workItems.projectId, project.id),
    eq(workItems.assigneeUserId, actor.userId),
    isNull(workItems.archivedAt),
    notInArray(workItems.status, ["done", "canceled"]),
  );
  const [
    milestoneRows,
    projectMemberRows,
    workspaceDirectory,
    cycleRows,
    attentionRows,
    attentionTotals,
    commercial,
  ] = await Promise.all([
    db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, project.id))
      .orderBy(
        asc(milestones.status),
        asc(milestones.sortOrder),
        asc(milestones.id),
      )
      .limit(100),
    db
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
          eq(memberships.status, "active"),
        ),
      )
      .where(eq(projectMemberships.projectId, project.id))
      .orderBy(asc(users.name)),
    canManage
      ? listWorkspaceMembers(actor, workspace.id, {
          status: "active",
          pageSize: 25,
        })
      : Promise.resolve({
          members: [],
          memberPage: { number: 1, size: 25, total: 0, pages: 1 },
        }),
    db
      .select()
      .from(cycles)
      .where(
        and(
          eq(cycles.projectId, project.id),
          inArray(cycles.lifecycle, ["planned", "active"]),
        ),
      )
      .orderBy(
        sql`case when ${cycles.lifecycle} = 'active' then 0 else 1 end`,
        desc(cycles.sequence),
        asc(cycles.id),
      )
      .limit(1),
    db
      .select({
        id: workItems.id,
        number: workItems.number,
        title: workItems.title,
        status: workItems.status,
        priority: workItems.priority,
        targetDate: workItems.targetDate,
      })
      .from(workItems)
      .where(attentionConditions)
      .orderBy(
        asc(workItems.targetDate),
        desc(workItems.priority),
        asc(workItems.number),
      )
      .limit(5),
    db.select({ total: count() }).from(workItems).where(attentionConditions),
    canManage
      ? getCommercialDriftSnapshotForProject(project.id, 5)
      : Promise.resolve(null),
  ]);
  const attentionTotal = attentionTotals[0]?.total ?? 0;

  return {
    canManage,
    milestones: milestoneRows,
    projectDirectory: {
      role: project.workspaceRole,
      canManage,
      members: projectMemberRows,
    },
    workspaceDirectory,
    cycles: cycleRows,
    attention: {
      items: attentionRows.map((item) => ({
        ...item,
        identifier: `${project.key}-${item.number}`,
      })),
      pageInfo: {
        page: 1,
        pageSize: 5,
        total: attentionTotal,
        hasNextPage: attentionTotal > 5,
      },
    },
    commercial,
  };
}
