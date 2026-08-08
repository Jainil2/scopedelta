import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, getPool } from "@/db";
import {
  auditEvents,
  memberships,
  projectMemberships,
  users,
} from "@/db/schema";
import {
  addDependency,
  createClient,
  createMilestone,
  createProject,
  createWorkItem,
  getProject,
  getWorkItem,
  listWorkItems,
  updateMilestone,
  updateWorkItem,
} from "@/server/delivery";
import { createWorkspace } from "@/server/workspaces";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/scopedelta_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error(
    "Integration tests require a dedicated scopedelta_test database.",
  );
}

const db = getDb();

describe("delivery-core domain boundary", () => {
  beforeEach(async () => {
    await db.execute(sql`
      truncate table
        work_item_dependencies,
        work_item_labels,
        work_items,
        project_labels,
        milestones,
        project_memberships,
        projects,
        clients,
        audit_events,
        workspace_invitations,
        memberships,
        workspace_settings,
        workspaces,
        accounts,
        sessions,
        verifications,
        auth_rate_limits,
        action_rate_limits,
        users
      cascade
    `);
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("creates a client project without milestones and rejects duplicate workspace keys", async () => {
    const owner = await createUser("owner@example.test", "Owner");
    const workspace = await createWorkspace(owner, { name: "Northstar" });
    const client = await createClient(owner, workspace.id, {
      name: "Acme Labs",
      internalReference: "ACME",
      summary: "Delivery account",
    });
    const project = await createProject(owner, workspace.id, {
      clientId: client.id,
      key: "acme",
      name: "Portal rebuild",
      summary: null,
      leadUserId: owner.userId,
      startDate: null,
      targetDate: null,
    });
    await expect(
      getProject(owner, workspace.id, project.id),
    ).resolves.toMatchObject({
      key: "ACME",
      clientName: "Acme Labs",
      counts: [],
    });
    await expect(
      createProject(owner, workspace.id, {
        clientId: client.id,
        key: "ACME",
        name: "Duplicate key",
        summary: null,
        leadUserId: owner.userId,
        startDate: null,
        targetDate: null,
      }),
    ).rejects.toMatchObject({ code: "project_key_conflict", status: 409 });
  });

  it("returns indistinguishable not-found responses across tenant and project boundaries", async () => {
    const owner = await createUser("owner@example.test", "Owner");
    const outsider = await createUser("outsider@example.test", "Outsider");
    const workspace = await createWorkspace(owner, { name: "Private" });
    const outsiderWorkspace = await createWorkspace(outsider, {
      name: "Other tenant",
    });
    const client = await createClient(owner, workspace.id, {
      name: "Hidden client",
      internalReference: null,
      summary: null,
    });
    const project = await createProject(owner, workspace.id, {
      clientId: client.id,
      key: "HIDE",
      name: "Hidden project",
      summary: null,
      leadUserId: owner.userId,
      startDate: null,
      targetDate: null,
    });
    const entitlements = { assertAllowed: vi.fn() };

    await expect(
      getProject(outsider, workspace.id, project.id),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(
      getProject(outsider, outsiderWorkspace.id, project.id),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(
      getProject(owner, workspace.id, randomUUID()),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(
      createWorkItem(
        outsider,
        workspace.id,
        project.id,
        {
          title: "Guessed write",
          description: null,
          acceptanceCriteria: null,
          status: "backlog",
          priority: "none",
          assigneeUserId: null,
          estimatePoints: null,
          targetDate: null,
          milestoneId: null,
          parentId: null,
          labelIds: [],
        },
        entitlements,
      ),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    expect(entitlements.assertAllowed).not.toHaveBeenCalled();
  });

  it("revokes project access with workspace membership while retaining historical assignment", async () => {
    const owner = await createUser("owner@example.test", "Owner");
    const member = await createUser("member@example.test", "Member");
    const workspace = await createWorkspace(owner, { name: "Access" });
    await db.insert(memberships).values({
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: member.userId,
      role: "member",
    });
    const client = await createClient(owner, workspace.id, {
      name: "Access client",
      internalReference: null,
      summary: null,
    });
    const project = await createProject(owner, workspace.id, {
      clientId: client.id,
      key: "ACCESS",
      name: "Access project",
      summary: null,
      leadUserId: member.userId,
      startDate: null,
      targetDate: null,
    });
    const item = await createWorkItem(member, workspace.id, project.id, {
      title: "Historically assigned",
      description: null,
      acceptanceCriteria: null,
      status: "ready",
      priority: "high",
      assigneeUserId: member.userId,
      estimatePoints: 5,
      targetDate: null,
      milestoneId: null,
      parentId: null,
      labelIds: [],
    });

    await db
      .delete(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspace.id),
          eq(memberships.userId, member.userId),
        ),
      );

    await expect(
      getProject(member, workspace.id, project.id),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      updateWorkItem(owner, workspace.id, project.id, item.id, {
        title: "Historically assigned, still editable",
        assigneeUserId: member.userId,
      }),
    ).resolves.toMatchObject({ assigneeName: "Member" });
    await expect(
      getWorkItem(owner, workspace.id, project.id, item.id),
    ).resolves.toMatchObject({ assigneeName: "Member" });
    await expect(
      db
        .select()
        .from(projectMemberships)
        .where(eq(projectMemberships.userId, member.userId)),
    ).resolves.toHaveLength(0);
  });

  it("allocates concurrent identifiers uniquely and keeps backlog queries bounded", async () => {
    const { owner, workspace, project } = await createFixture();
    const results = await Promise.all(
      Array.from({ length: 125 }, (_, index) =>
        createWorkItem(owner, workspace.id, project.id, {
          title: `Work ${index}`,
          description: null,
          acceptanceCriteria: `Criterion ${index}`,
          status: "backlog",
          priority: "none",
          assigneeUserId: null,
          estimatePoints: null,
          targetDate: null,
          milestoneId: null,
          parentId: null,
          labelIds: [],
        }),
      ),
    );
    expect(new Set(results.map((item) => item.identifier)).size).toBe(125);

    const firstPage = await listWorkItems(owner, workspace.id, project.id, {
      page: 1,
      pageSize: 50,
    });
    const finalPage = await listWorkItems(owner, workspace.id, project.id, {
      page: 3,
      pageSize: 50,
    });
    expect(firstPage.items).toHaveLength(50);
    expect(firstPage.pageInfo).toMatchObject({ total: 125, hasNextPage: true });
    expect(finalPage.items).toHaveLength(25);
    expect(finalPage.pageInfo.hasNextPage).toBe(false);
  });

  it("preserves archived milestone references and rejects new assignment to them", async () => {
    const { owner, workspace, project } = await createFixture();
    const milestone = await createMilestone(owner, workspace.id, project.id, {
      name: "Launch",
      description: null,
      targetDate: null,
    });
    const existing = await createWorkItem(owner, workspace.id, project.id, {
      title: "Existing launch work",
      description: null,
      acceptanceCriteria: null,
      status: "backlog",
      priority: "medium",
      assigneeUserId: null,
      estimatePoints: null,
      targetDate: null,
      milestoneId: milestone.id,
      parentId: null,
      labelIds: [],
    });
    await updateMilestone(owner, workspace.id, project.id, milestone.id, {
      status: "archived",
    });

    await expect(
      getWorkItem(owner, workspace.id, project.id, existing.id),
    ).resolves.toMatchObject({ milestoneName: "Launch" });
    await expect(
      updateWorkItem(owner, workspace.id, project.id, existing.id, {
        title: "Existing launch work updated",
        milestoneId: milestone.id,
      }),
    ).resolves.toMatchObject({ milestoneName: "Launch" });
    await expect(
      createWorkItem(owner, workspace.id, project.id, {
        title: "New archived assignment",
        description: null,
        acceptanceCriteria: null,
        status: "backlog",
        priority: "none",
        assigneeUserId: null,
        estimatePoints: null,
        targetDate: null,
        milestoneId: milestone.id,
        parentId: null,
        labelIds: [],
      }),
    ).rejects.toMatchObject({ code: "milestone_archived" });
  });

  it("enforces one-level subtasks, terminal cancellation, dependency DAGs, and audit privacy", async () => {
    const { owner, workspace, project } = await createFixture();
    const parent = await createWorkItem(owner, workspace.id, project.id, {
      title: "Confidential parent title",
      description: "Private customer description",
      acceptanceCriteria: "Private acceptance text",
      status: "backlog",
      priority: "none",
      assigneeUserId: null,
      estimatePoints: null,
      targetDate: null,
      milestoneId: null,
      parentId: null,
      labelIds: [],
    });
    const child = await createWorkItem(owner, workspace.id, project.id, {
      title: "Child",
      description: null,
      acceptanceCriteria: null,
      status: "ready",
      priority: "low",
      assigneeUserId: null,
      estimatePoints: null,
      targetDate: null,
      milestoneId: null,
      parentId: parent.id,
      labelIds: [],
    });
    const other = await createWorkItem(owner, workspace.id, project.id, {
      title: "Other",
      description: null,
      acceptanceCriteria: null,
      status: "canceled",
      priority: "none",
      assigneeUserId: null,
      estimatePoints: null,
      targetDate: null,
      milestoneId: null,
      parentId: null,
      labelIds: [],
    });

    await expect(
      createWorkItem(owner, workspace.id, project.id, {
        title: "Nested child",
        description: null,
        acceptanceCriteria: null,
        status: "backlog",
        priority: "none",
        assigneeUserId: null,
        estimatePoints: null,
        targetDate: null,
        milestoneId: null,
        parentId: child.id,
        labelIds: [],
      }),
    ).rejects.toMatchObject({ code: "invalid_parent" });
    await expect(
      updateWorkItem(owner, workspace.id, project.id, parent.id, {
        archived: true,
      }),
    ).rejects.toMatchObject({ code: "active_subtasks" });
    await expect(
      updateWorkItem(owner, workspace.id, project.id, other.id, {
        parentId: other.id,
      }),
    ).rejects.toMatchObject({ code: "invalid_parent" });
    await expect(
      updateWorkItem(owner, workspace.id, project.id, parent.id, {
        parentId: other.id,
      }),
    ).rejects.toMatchObject({ code: "invalid_parent" });
    await expect(
      updateWorkItem(owner, workspace.id, project.id, other.id, {
        status: "ready",
      }),
    ).rejects.toMatchObject({ code: "terminal_status" });

    await addDependency(owner, workspace.id, project.id, parent.id, child.id);
    await addDependency(owner, workspace.id, project.id, child.id, other.id);
    await expect(
      addDependency(owner, workspace.id, project.id, other.id, parent.id),
    ).rejects.toMatchObject({ code: "dependency_cycle" });

    const serialized = JSON.stringify(
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.workspaceId, workspace.id)),
    );
    expect(serialized).not.toContain("Confidential parent title");
    expect(serialized).not.toContain("Private customer description");
    expect(serialized).not.toContain("Private acceptance text");
  });
});

async function createFixture() {
  const owner = await createUser("owner@example.test", "Owner");
  const workspace = await createWorkspace(owner, { name: "Delivery" });
  const client = await createClient(owner, workspace.id, {
    name: "Client",
    internalReference: null,
    summary: null,
  });
  const project = await createProject(owner, workspace.id, {
    clientId: client.id,
    key: "DELIV",
    name: "Delivery project",
    summary: null,
    leadUserId: owner.userId,
    startDate: null,
    targetDate: null,
  });
  return { owner, workspace, client, project };
}

async function createUser(email: string, name: string) {
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email,
    name,
    emailVerified: true,
  });
  return { userId, email };
}
