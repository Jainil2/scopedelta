import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb, getPool } from "@/db";
import {
  auditEvents,
  memberships,
  notifications,
  projectMemberships,
  users,
  workItemCommentRevisions,
  workItemComments,
} from "@/db/schema";
import {
  createComment,
  createProjectNote,
  deleteComment,
  listCommentHistory,
  listComments,
  listNotifications,
  updateComment,
  updateNotifications,
  updateSubscription,
} from "@/server/collaboration";
import {
  createClient,
  createProject,
  createWorkItem,
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

describe("SC-005C collaboration boundary", () => {
  beforeEach(async () => {
    await db.execute(sql`
      truncate table
        notifications,
        work_item_subscriptions,
        project_note_mentions,
        project_notes,
        work_item_comment_mentions,
        work_item_comment_revisions,
        work_item_comments,
        work_item_dependencies,
        work_item_labels,
        work_items,
        cycles,
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

  it("creates idempotent threaded comments, validates mentions, and deduplicates notifications", async () => {
    const { owner, member, outsider, workspace, project, item } =
      await createFixture();
    const requestId = randomUUID();
    const body = `Please review @[Imposter](user:${member.userId})`;
    const first = await createComment(
      owner,
      workspace.id,
      project.id,
      item.id,
      {
        requestId,
        body,
        parentCommentId: null,
      },
    );
    const retried = await createComment(
      owner,
      workspace.id,
      project.id,
      item.id,
      {
        requestId,
        body,
        parentCommentId: null,
      },
    );
    expect(retried.id).toBe(first.id);

    const reply = await createComment(
      member,
      workspace.id,
      project.id,
      item.id,
      {
        requestId: randomUUID(),
        body: "Reviewed.",
        parentCommentId: first.id,
      },
    );
    await expect(
      createComment(owner, workspace.id, project.id, item.id, {
        requestId: randomUUID(),
        body: "Nested reply",
        parentCommentId: reply.id,
      }),
    ).rejects.toMatchObject({ code: "reply_depth", status: 409 });
    await expect(
      createComment(owner, workspace.id, project.id, item.id, {
        requestId: randomUUID(),
        body: `Hidden @[Outsider](user:${outsider.userId})`,
      }),
    ).rejects.toMatchObject({ code: "invalid_mention", status: 400 });
    await expect(
      listComments(outsider, workspace.id, project.id, item.id),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });

    const inbox = await listNotifications(member, workspace.id, {
      page: 1,
      pageSize: 50,
    });
    expect(first.body).toBe(`Please review @[Member](user:${member.userId})`);
    expect(
      inbox.data.filter((notification) => notification.kind === "mention"),
    ).toHaveLength(1);
    expect(
      await db
        .select({ total: sql<number>`count(*)::int` })
        .from(notifications),
    ).toEqual([{ total: 3 }]);
  });

  it("keeps comment bodies out of audits and enforces author-only edit and soft-delete history", async () => {
    const { owner, member, workspace, project, item } = await createFixture();
    const secret = "Customer credential rotation is scheduled";
    const comment = await createComment(
      owner,
      workspace.id,
      project.id,
      item.id,
      {
        requestId: randomUUID(),
        body: secret,
      },
    );
    await expect(
      updateComment(member, workspace.id, project.id, item.id, comment.id, {
        body: "tamper",
      }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      updateComment(owner, workspace.id, project.id, randomUUID(), comment.id, {
        body: "guessed path",
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    const updated = await updateComment(
      owner,
      workspace.id,
      project.id,
      item.id,
      comment.id,
      {
        body: "Credential rotation completed",
      },
    );
    expect(updated.version).toBe(2);
    await expect(
      updateComment(owner, workspace.id, project.id, item.id, comment.id, {
        body: "Credential rotation completed",
      }),
    ).resolves.toMatchObject({ version: 2 });
    await deleteComment(owner, workspace.id, project.id, item.id, comment.id);
    const history = await listCommentHistory(
      owner,
      workspace.id,
      project.id,
      item.id,
      comment.id,
    );
    expect(history.data.map((revision) => revision.body)).toEqual([
      "Credential rotation completed",
      secret,
    ]);
    const stored = await db
      .select()
      .from(workItemComments)
      .where(eq(workItemComments.id, comment.id));
    expect(stored[0]).toMatchObject({ body: null });
    expect(stored[0]?.deletedAt).toBeInstanceOf(Date);
    expect(await db.select().from(workItemCommentRevisions)).toHaveLength(2);
    const audits = await db
      .select({ metadata: auditEvents.metadata })
      .from(auditEvents);
    expect(JSON.stringify(audits)).not.toContain(secret);
    expect(JSON.stringify(audits)).not.toContain(
      "Credential rotation completed",
    );
  });

  it("hides stale notifications and collaboration after project access is removed", async () => {
    const { owner, member, workspace, project, item } = await createFixture();
    await createComment(owner, workspace.id, project.id, item.id, {
      requestId: randomUUID(),
      body: `Access check @[Member](user:${member.userId})`,
    });
    const beforeRemoval = await listNotifications(member, workspace.id, {
      page: 1,
      pageSize: 50,
    });
    expect(beforeRemoval.page.total).toBe(2);
    await db
      .delete(projectMemberships)
      .where(
        and(
          eq(projectMemberships.projectId, project.id),
          eq(projectMemberships.userId, member.userId),
        ),
      );
    expect(
      (await listNotifications(member, workspace.id, { page: 1, pageSize: 50 }))
        .page.total,
    ).toBe(0);
    await expect(
      updateNotifications(
        member,
        workspace.id,
        beforeRemoval.data.map((notification) => notification.id),
        true,
      ),
    ).resolves.toEqual({ data: [] });
    await expect(
      listComments(member, workspace.id, project.id, item.id),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("auto-watches assignees, respects explicit mute for discussion, and bounds volume pages", async () => {
    const { owner, member, workspace, project, item } =
      await createFixture(false);
    await updateSubscription(member, workspace.id, project.id, item.id, false);
    await updateWorkItem(owner, workspace.id, project.id, item.id, {
      assigneeUserId: member.userId,
    });
    await createComment(owner, workspace.id, project.id, item.id, {
      requestId: randomUUID(),
      body: "Assignment context",
    });
    const inbox = await listNotifications(member, workspace.id, {
      page: 1,
      pageSize: 50,
    });
    expect(inbox.data.map((notification) => notification.kind)).toEqual([
      "work_item_assigned",
    ]);

    await db.insert(workItemComments).values(
      Array.from({ length: 55 }, (_, index) => ({
        id: randomUUID(),
        projectId: project.id,
        workItemId: item.id,
        authorUserId: owner.userId,
        requestId: randomUUID(),
        body: `Seeded collaboration event ${index + 1}`,
      })),
    );
    const page = await listComments(
      owner,
      workspace.id,
      project.id,
      item.id,
      1,
      50,
    );
    expect(page.data).toHaveLength(50);
    expect(page.page).toMatchObject({ total: 56, pages: 2, size: 50 });

    await expect(
      createProjectNote(owner, workspace.id, project.id, {
        requestId: randomUUID(),
        title: "Delivery constraint",
        body: "Internal context only",
      }),
    ).resolves.toMatchObject({ title: "Delivery constraint" });
  });
});

async function createFixture(assignMember = true) {
  const owner = await createUser("owner@example.test", "Owner");
  const member = await createUser("member@example.test", "Member");
  const outsider = await createUser("outsider@example.test", "Outsider");
  const workspace = await createWorkspace(owner, { name: "Collaboration" });
  await db.insert(memberships).values([
    {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: member.userId,
      role: "member",
    },
    {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: outsider.userId,
      role: "member",
    },
  ]);
  const client = await createClient(owner, workspace.id, {
    name: "Client",
    internalReference: null,
    summary: null,
  });
  const project = await createProject(owner, workspace.id, {
    clientId: client.id,
    key: "COLLAB",
    name: "Collaboration project",
    summary: null,
    leadUserId: owner.userId,
    startDate: null,
    targetDate: null,
  });
  await db.insert(projectMemberships).values({
    projectId: project.id,
    workspaceId: workspace.id,
    userId: member.userId,
    addedByUserId: owner.userId,
  });
  const item = await createWorkItem(owner, workspace.id, project.id, {
    title: "Collaborative work",
    description: null,
    acceptanceCriteria: null,
    status: "in_progress",
    priority: "high",
    assigneeUserId: assignMember ? member.userId : null,
    estimatePoints: 5,
    targetDate: null,
    milestoneId: null,
    parentId: null,
    labelIds: [],
  });
  return { owner, member, outsider, workspace, project, item };
}

async function createUser(email: string, name: string) {
  const userId = randomUUID();
  await db
    .insert(users)
    .values({ id: userId, email, name, emailVerified: true });
  return { userId, email };
}
