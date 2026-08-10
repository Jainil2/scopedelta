import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb, getPool } from "@/db";
import {
  clientCollaborationNotifications,
  clientCommercialPacketActions,
  clientDiscussionMessages,
  commercialDecisions,
  commercialImpactAssessments,
  commercialRequests,
  milestones,
  users,
} from "@/db/schema";
import {
  acceptClientInvitation,
  actOnClientAcceptanceTarget,
  actOnClientCommercialPacket,
  addClientProjectItem,
  createClientDiscussionMessage,
  createClientRequest,
  getClientProjectProjection,
  inviteClientParticipant,
  listClientNotifications,
  listClientProjects,
  markClientNotificationRead,
  publishClientAcceptanceTarget,
  publishClientCommercialPacket,
  retryClientNotificationEmail,
  revokeClientParticipant,
  updateClientProjectProfile,
  updateClientRequestState,
} from "@/server/client-collaboration";
import {
  createClient,
  createMilestone,
  createProject,
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

describe("client collaboration domain boundary", () => {
  beforeEach(async () => {
    await db.execute(
      sql`truncate table workspaces, users, action_rate_limits cascade`,
    );
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("accepts one matching verified identity, rotates pending invites, and preserves revoked attribution", async () => {
    const fixture = await createFixture();
    const client = await createUser("client@example.test", "Client Person");
    const first = await inviteClientParticipant(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        email: client.email,
        role: "collaborator",
        sendEmail: false,
      },
    );
    await expect(
      acceptClientInvitation(
        { ...client, email: "wrong@example.test" },
        tokenFrom(first.fragmentPath),
      ),
    ).rejects.toMatchObject({
      code: "client_invitation_email_mismatch",
      status: 403,
    });

    const replacement = await inviteClientParticipant(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        email: client.email,
        role: "approver",
        sendEmail: false,
      },
    );
    await expect(
      acceptClientInvitation(client, tokenFrom(first.fragmentPath)),
    ).rejects.toMatchObject({ code: "client_invitation_invalid" });
    await expect(
      acceptClientInvitation(client, tokenFrom(replacement.fragmentPath)),
    ).resolves.toEqual({ projectId: fixture.project.id });
    await expect(
      acceptClientInvitation(client, tokenFrom(replacement.fragmentPath)),
    ).rejects.toMatchObject({ code: "client_invitation_invalid" });

    const projects = await listClientProjects(client);
    expect(projects).toMatchObject([
      { id: fixture.project.id, role: "approver" },
    ]);
    const activeParticipantId = await participantId(
      fixture.project.id,
      client.userId,
    );
    const request = await createClientRequest(client, fixture.project.id, {
      idempotencyKey: randomUUID(),
      title: "Notification access check",
      requestText: "Keep this notification inside active client access.",
    });
    const notificationId = randomUUID();
    await db.insert(clientCollaborationNotifications).values({
      id: notificationId,
      workspaceId: fixture.workspace.id,
      projectId: fixture.project.id,
      recipientUserId: client.userId,
      recipientParticipantId: activeParticipantId,
      kind: "discussion_added",
      actorUserId: fixture.owner.userId,
      requestId: request.id,
      dedupeKey: `revocation:${notificationId}`,
      emailDeliveryState: "failed",
    });
    await expect(listClientNotifications(client)).resolves.toHaveLength(1);
    await expect(
      retryClientNotificationEmail(client, notificationId),
    ).resolves.toEqual({ dedupeKey: `revocation:${notificationId}` });
    await revokeClientParticipant(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      activeParticipantId,
    );
    await expect(
      getClientProjectProjection(client, fixture.project.id),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(listClientNotifications(client)).resolves.toEqual([]);
    await expect(
      markClientNotificationRead(client, notificationId),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      retryClientNotificationEmail(client, notificationId),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("records client request provenance, atomic clarification, derived attention, and external-only discussion", async () => {
    const fixture = await createFixture();
    const client = await createParticipant(
      fixture,
      "collaborator",
      "requester@example.test",
    );
    await updateClientProjectProfile(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      "A deliberately safe project summary.",
    );
    const requestKey = randomUUID();
    const created = await createClientRequest(client, fixture.project.id, {
      idempotencyKey: requestKey,
      title: "Add SSO",
      requestText: "Please include SAML sign-in.",
    });
    await expect(
      createClientRequest(client, fixture.project.id, {
        idempotencyKey: requestKey,
        title: "Add SSO",
        requestText: "Please include SAML sign-in.",
      }),
    ).resolves.toEqual(created);
    const stored = await db
      .select({
        participantId: commercialRequests.submittedByClientParticipantId,
      })
      .from(commercialRequests)
      .where(eq(commercialRequests.id, created.id));
    expect(stored[0]?.participantId).toBe(
      await participantId(fixture.project.id, client.userId),
    );

    await updateClientRequestState(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      created.id,
      {
        idempotencyKey: randomUUID(),
        state: "needs_clarification",
        prompt: "Which identity provider should be supported?",
      },
    );
    expect(
      (await getClientProjectProjection(client, fixture.project.id)).attention,
    ).toMatchObject([{ kind: "clarification", targetId: created.id }]);
    await createClientDiscussionMessage(client, fixture.project.id, {
      idempotencyKey: randomUUID(),
      target: "request",
      targetId: created.id,
      body: "Okta is the current provider.",
    });
    const projection = await getClientProjectProjection(
      client,
      fixture.project.id,
    );
    expect(projection.attention).toEqual([]);
    expect(projection.requests[0]).toMatchObject({
      state: "needs_clarification",
      needsReply: false,
    });
    expect(JSON.stringify(projection)).not.toMatch(
      /estimate|rationale|evidence|drift|audit|workItems|private note/i,
    );
    const sharedMessages = await db.select().from(clientDiscussionMessages);
    expect(sharedMessages).toHaveLength(2);
  });

  it("publishes only confirmed selected values and enforces collaborator and concurrent approver boundaries", async () => {
    const fixture = await createFixture();
    const collaborator = await createParticipant(
      fixture,
      "collaborator",
      "collaborator@example.test",
    );
    const firstApprover = await createParticipant(
      fixture,
      "approver",
      "approver-one@example.test",
    );
    const secondApprover = await createParticipant(
      fixture,
      "approver",
      "approver-two@example.test",
    );
    const { requestId, decisionId, impactId } = await seedDecision(
      fixture,
      "paid_change",
    );
    const packet = await publishClientCommercialPacket(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      requestId,
      {
        idempotencyKey: randomUUID(),
        decisionId,
        impactAssessmentId: impactId,
        title: "SSO change",
        requestSummary: "Add SAML sign-in.",
        treatmentSummary: "Handled as a paid change.",
        scopeSummary: null,
        assumptions: null,
        includeScheduleDeltaDays: true,
        includeTargetDate: false,
        includeMonetaryAmount: true,
        scopeItemRevisionIds: [],
      },
    );
    const visible = await getClientProjectProjection(
      firstApprover,
      fixture.project.id,
    );
    expect(visible.packets[0]).toMatchObject({
      requirement: "approval",
      scheduleDeltaDays: 3,
      monetaryAmount: "1200.00",
      currencyCode: "USD",
    });
    expect(JSON.stringify(visible.packets[0])).not.toContain("2400");
    await expect(
      actOnClientCommercialPacket(collaborator, fixture.project.id, packet.id, {
        idempotencyKey: randomUUID(),
        action: "approved",
        comment: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });

    const attempts = await Promise.allSettled([
      actOnClientCommercialPacket(
        firstApprover,
        fixture.project.id,
        packet.id,
        {
          idempotencyKey: randomUUID(),
          action: "approved",
          comment: null,
        },
      ),
      actOnClientCommercialPacket(
        secondApprover,
        fixture.project.id,
        packet.id,
        {
          idempotencyKey: randomUUID(),
          action: "rejected",
          comment: null,
        },
      ),
    ]);
    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    await expect(
      db
        .select()
        .from(clientCommercialPacketActions)
        .where(eq(clientCommercialPacketActions.packetId, packet.id)),
    ).resolves.toHaveLength(1);
  });

  it("makes superseded decisions and changed milestone sources stale without rewriting internal state", async () => {
    const fixture = await createFixture();
    const approver = await createParticipant(
      fixture,
      "approver",
      "acceptance@example.test",
    );
    const seeded = await seedDecision(fixture, "paid_change");
    const packet = await publishClientCommercialPacket(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      seeded.requestId,
      packetInput(seeded.decisionId, seeded.impactId),
    );
    await db
      .update(commercialDecisions)
      .set({ supersededAt: new Date() })
      .where(eq(commercialDecisions.id, seeded.decisionId));
    await expect(
      actOnClientCommercialPacket(approver, fixture.project.id, packet.id, {
        idempotencyKey: randomUUID(),
        action: "approved",
        comment: null,
      }),
    ).rejects.toMatchObject({ code: "client_packet_stale", status: 409 });

    const milestone = await createMilestone(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        name: "Launch",
        description: "Internal description must not be copied.",
        targetDate: "2026-09-01",
      },
    );
    await db
      .update(milestones)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(milestones.id, milestone.id));
    const item = await addClientProjectItem(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        target: "milestone",
        milestoneId: milestone.id,
        clientSummary: "Launch readiness and handover.",
        sortOrder: 0,
      },
    );
    const target = await publishClientAcceptanceTarget(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        projectItemId: item.id,
        snapshotTitle: "Launch handover",
        snapshotSummary: "Accept the published launch handover.",
        packetIds: [packet.id],
      },
    );
    await db
      .update(milestones)
      .set({ updatedAt: new Date(Date.now() + 1_000) })
      .where(eq(milestones.id, milestone.id));
    await expect(
      actOnClientAcceptanceTarget(approver, fixture.project.id, target.id, {
        idempotencyKey: randomUUID(),
        action: "accepted",
        comment: null,
      }),
    ).rejects.toMatchObject({ code: "client_acceptance_stale", status: 409 });
    const unchanged = await db
      .select({ status: milestones.status })
      .from(milestones)
      .where(eq(milestones.id, milestone.id));
    expect(unchanged[0]?.status).toBe("in_progress");
  });

  it("isolates projects and emits deduplicated content-free durable notifications", async () => {
    const first = await createFixture("FIRST");
    const second = await createFixture("SECOND", first.owner);
    const client = await createParticipant(
      first,
      "collaborator",
      "multi@example.test",
    );
    await createParticipant(second, "collaborator", client.email, client);
    expect(await listClientProjects(client)).toHaveLength(2);
    await expect(
      getClientProjectProjection(client, randomUUID()),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    const request = await createClientRequest(client, first.project.id, {
      idempotencyKey: randomUUID(),
      title: "First only",
      requestText: "This must stay in the first project.",
    });
    const firstProjection = await getClientProjectProjection(
      client,
      first.project.id,
    );
    const secondProjection = await getClientProjectProjection(
      client,
      second.project.id,
    );
    expect(firstProjection.requests[0]?.id).toBe(request.id);
    expect(secondProjection.requests).toEqual([]);
    const notifications = await db
      .select({
        dedupeKey: clientCollaborationNotifications.dedupeKey,
        requestId: clientCollaborationNotifications.requestId,
      })
      .from(clientCollaborationNotifications)
      .where(eq(clientCollaborationNotifications.requestId, request.id));
    expect(new Set(notifications.map(({ dedupeKey }) => dedupeKey)).size).toBe(
      notifications.length,
    );
    expect(JSON.stringify(notifications)).not.toContain("This must stay");
  });
});

async function createFixture(key = "CLIENT", existingOwner?: Actor) {
  const owner =
    existingOwner ??
    (await createUser(`${key.toLowerCase()}-owner@example.test`, "Owner"));
  const workspace = await createWorkspace(owner, { name: `${key} Workspace` });
  const client = await createClient(owner, workspace.id, {
    name: `${key} Client`,
    internalReference: null,
    summary: null,
  });
  const project = await createProject(owner, workspace.id, {
    clientId: client.id,
    key,
    name: `${key} Project`,
    summary: "Private internal summary",
    leadUserId: owner.userId,
    startDate: null,
    targetDate: null,
  });
  return { owner, workspace, project };
}

type Actor = { userId: string; email: string };

async function createUser(email: string, name: string): Promise<Actor> {
  const userId = randomUUID();
  await db
    .insert(users)
    .values({ id: userId, email, name, emailVerified: true });
  return { userId, email };
}

async function createParticipant(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  role: "collaborator" | "approver",
  email: string,
  existing?: Actor,
) {
  const actor = existing ?? (await createUser(email, email.split("@")[0]!));
  const invitation = await inviteClientParticipant(
    fixture.owner,
    fixture.workspace.id,
    fixture.project.id,
    {
      idempotencyKey: randomUUID(),
      email,
      role,
      sendEmail: false,
    },
  );
  await acceptClientInvitation(actor, tokenFrom(invitation.fragmentPath));
  return actor;
}

async function participantId(projectId: string, userId: string) {
  const rows = await db.execute<{ id: string }>(sql`
    select id from client_project_participants
    where project_id = ${projectId} and user_id = ${userId}
  `);
  return rows.rows[0]!.id;
}

function tokenFrom(fragmentPath: string) {
  return new URL(fragmentPath, "http://localhost").hash.slice("#token=".length);
}

async function seedDecision(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  disposition: "paid_change" | "covered",
) {
  const requestId = randomUUID();
  const decisionId = randomUUID();
  const impactId = randomUUID();
  await db.insert(commercialRequests).values({
    id: requestId,
    projectId: fixture.project.id,
    idempotencyKey: randomUUID(),
    title: "Internal request",
    requestText: "Internal capture",
    receivedAt: new Date(),
    createdByUserId: fixture.owner.userId,
  });
  await db.insert(commercialDecisions).values({
    id: decisionId,
    projectId: fixture.project.id,
    requestId,
    idempotencyKey: randomUUID(),
    disposition,
    coverageBasis: disposition === "covered" ? "baseline" : null,
    rationale: "Private internal rationale",
    confirmedAt: new Date(),
    createdByUserId: fixture.owner.userId,
  });
  await db.insert(commercialImpactAssessments).values({
    id: impactId,
    projectId: fixture.project.id,
    requestId,
    decisionId,
    idempotencyKey: randomUUID(),
    confidence: "confirmed",
    effortMinutes: 2_400,
    scheduleDeltaDays: 3,
    monetaryAmount: "1200.00",
    currencyCode: "USD",
    notes: "Private estimate note",
    createdByUserId: fixture.owner.userId,
  });
  return { requestId, decisionId, impactId };
}

function packetInput(decisionId: string, impactAssessmentId: string) {
  return {
    idempotencyKey: randomUUID(),
    decisionId,
    impactAssessmentId,
    title: "Change packet",
    requestSummary: "Safe request summary.",
    treatmentSummary: "Safe treatment summary.",
    scopeSummary: null,
    assumptions: null,
    includeScheduleDeltaDays: true,
    includeTargetDate: false,
    includeMonetaryAmount: true,
    scopeItemRevisionIds: [],
  };
}
