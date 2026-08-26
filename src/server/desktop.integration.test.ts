import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb, getPool } from "@/db";
import {
  clientCollaborationNotifications,
  memberships,
  notifications,
  projectMemberships,
  users,
} from "@/db/schema";
import {
  acceptClientInvitation,
  createClientRequest,
  inviteClientParticipant,
  revokeClientParticipant,
} from "@/server/client-collaboration";
import { createClient, createProject } from "@/server/delivery";
import { listDesktopNotifications } from "@/server/desktop";
import { createWorkspace } from "@/server/workspaces";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/scopedelta_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error(
    "Integration tests require a dedicated scopedelta_test database.",
  );
}

const db = getDb();

describe("DX-001 desktop notification authorization", () => {
  beforeEach(async () => {
    await db.execute(
      sql`truncate table workspaces, users, action_rate_limits cascade`,
    );
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("paginates privacy-safe workspace events and enforces project membership and suspension", async () => {
    const owner = await createUser("owner@example.test", "Owner");
    const member = await createUser("member@example.test", "Member");
    const unassigned = await createUser(
      "unassigned@example.test",
      "Unassigned",
    );
    const workspace = await createWorkspace(owner, { name: "Desktop" });
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
        userId: unassigned.userId,
        role: "member",
      },
    ]);
    const client = await createClient(owner, workspace.id, {
      name: "Private client name",
      internalReference: null,
      summary: "Private client summary",
    });
    const project = await createProject(owner, workspace.id, {
      clientId: client.id,
      key: "DX",
      name: "Private project name",
      summary: "Private project summary",
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

    const memberBaseline = await listDesktopNotifications(member, undefined, 2);
    const unassignedBaseline = await listDesktopNotifications(
      unassigned,
      undefined,
      2,
    );
    const baseTime = new Date("2026-08-26T10:00:00.000Z");
    await db.insert(notifications).values(
      [0, 1, 2].flatMap((offset) => [
        {
          id: randomUUID(),
          workspaceId: workspace.id,
          userId: member.userId,
          kind: "comment_added" as const,
          actorUserId: owner.userId,
          projectId: project.id,
          dedupeKey: `member:${offset}`,
          createdAt: new Date(baseTime.getTime() + offset * 1000),
        },
        {
          id: randomUUID(),
          workspaceId: workspace.id,
          userId: unassigned.userId,
          kind: "mention" as const,
          actorUserId: owner.userId,
          projectId: project.id,
          dedupeKey: `unassigned:${offset}`,
          createdAt: new Date(baseTime.getTime() + offset * 1000),
        },
      ]),
    );

    const firstPage = await listDesktopNotifications(
      member,
      memberBaseline.cursor,
      2,
    );
    expect(firstPage.events).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(Object.keys(firstPage.events[0]!).sort()).toEqual([
      "category",
      "createdAt",
      "id",
      "path",
    ]);
    expect(JSON.stringify(firstPage)).not.toContain("Private");
    expect(firstPage.events[0]).toMatchObject({
      category: "work_item_activity",
      path: `/app/${workspace.slug}/projects/DX`,
    });

    const secondPage = await listDesktopNotifications(
      member,
      firstPage.cursor,
      2,
    );
    expect(secondPage.events).toHaveLength(1);
    expect(secondPage.hasMore).toBe(false);

    const hidden = await listDesktopNotifications(
      unassigned,
      unassignedBaseline.cursor,
      10,
    );
    expect(hidden.events).toEqual([]);

    await db.execute(sql`
      update memberships
      set status = 'suspended', suspended_at = now(), suspended_by_user_id = ${owner.userId}
      where workspace_id = ${workspace.id} and user_id = ${member.userId}
    `);
    await db.insert(notifications).values({
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: member.userId,
      kind: "mention",
      actorUserId: owner.userId,
      projectId: project.id,
      dedupeKey: "member:suspended",
      createdAt: new Date(baseTime.getTime() + 10_000),
    });
    const suspended = await listDesktopNotifications(
      member,
      secondPage.cursor,
      10,
    );
    expect(suspended.events).toEqual([]);
  });

  it("includes active client participants and stops at revocation", async () => {
    const owner = await createUser("agency@example.test", "Agency Owner");
    const participant = await createUser(
      "participant@example.test",
      "Client Participant",
    );
    const workspace = await createWorkspace(owner, { name: "Portal" });
    const client = await createClient(owner, workspace.id, {
      name: "Confidential client",
      internalReference: null,
      summary: null,
    });
    const project = await createProject(owner, workspace.id, {
      clientId: client.id,
      key: "PORTAL",
      name: "Confidential project",
      summary: null,
      leadUserId: owner.userId,
      startDate: null,
      targetDate: null,
    });
    const invitation = await inviteClientParticipant(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        email: participant.email,
        role: "collaborator",
        sendEmail: false,
      },
    );
    await acceptClientInvitation(
      participant,
      new URL(invitation.fragmentPath, "http://localhost").hash.slice(
        "#token=".length,
      ),
    );
    const participantRows = await db.execute<{ id: string }>(sql`
      select id from client_project_participants
      where project_id = ${project.id} and user_id = ${participant.userId}
    `);
    const participantId = participantRows.rows[0]!.id;
    const request = await createClientRequest(participant, project.id, {
      idempotencyKey: randomUUID(),
      title: "Commercial title must not leave the server",
      requestText: "Commercial body must not leave the server",
    });
    const baseline = await listDesktopNotifications(participant, undefined, 10);
    await db.insert(clientCollaborationNotifications).values({
      id: randomUUID(),
      workspaceId: workspace.id,
      projectId: project.id,
      recipientUserId: participant.userId,
      recipientParticipantId: participantId,
      kind: "discussion_added",
      actorUserId: owner.userId,
      requestId: request.id,
      dedupeKey: "desktop:client:active",
    });

    const active = await listDesktopNotifications(
      participant,
      baseline.cursor,
      10,
    );
    expect(active.events).toEqual([
      expect.objectContaining({
        category: "client_activity",
        path: `/client/projects/${project.id}`,
      }),
    ]);
    expect(JSON.stringify(active)).not.toMatch(
      /Commercial|Confidential|Client Participant/,
    );

    await revokeClientParticipant(
      owner,
      workspace.id,
      project.id,
      participantId,
    );
    await db.insert(clientCollaborationNotifications).values({
      id: randomUUID(),
      workspaceId: workspace.id,
      projectId: project.id,
      recipientUserId: participant.userId,
      recipientParticipantId: participantId,
      kind: "discussion_added",
      actorUserId: owner.userId,
      requestId: request.id,
      dedupeKey: "desktop:client:revoked",
    });
    const revoked = await listDesktopNotifications(
      participant,
      active.cursor,
      10,
    );
    expect(revoked.events).toEqual([]);
  });
});

type Actor = { userId: string; email: string };

async function createUser(email: string, name: string): Promise<Actor> {
  const userId = randomUUID();
  await db
    .insert(users)
    .values({ id: userId, email, name, emailVerified: true });
  return { userId, email };
}
