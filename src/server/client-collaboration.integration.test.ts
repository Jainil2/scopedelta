import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb, getPool } from "@/db";
import {
  auditEvents,
  clientAcceptanceActions,
  clientAcceptanceTargets,
  clientCollaborationNotifications,
  clientCommercialPacketActions,
  clientCommercialPackets,
  clientDiscussionMessages,
  clientProjectInvitations,
  clientProjectItems,
  clientProjectParticipants,
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
  listInternalClientNotifications,
  listClientProjects,
  markClientNotificationRead,
  publishClientAcceptanceTarget,
  publishClientCommercialPacket,
  reissueClientInvitation,
  retryClientNotificationEmail,
  revokeClientParticipant,
  updateClientParticipant,
  updateClientProjectProfile,
  updateClientRequestState,
} from "@/server/client-collaboration";
import {
  createClient,
  createMilestone,
  createProject,
  updateProject,
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

  it("recovers a lost invitation-reissue response without reviving the old token", async () => {
    const fixture = await createFixture();
    const client = await createUser("reissue@example.test", "Reissue Client");
    const original = await inviteClientParticipant(
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
    const reissueKey = randomUUID();
    const replacement = await reissueClientInvitation(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      original.id,
      { idempotencyKey: reissueKey, sendEmail: false },
    );
    const recovered = await reissueClientInvitation(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      original.id,
      { idempotencyKey: reissueKey, sendEmail: false },
    );
    expect(recovered.id).toBe(replacement.id);
    expect(recovered.fragmentPath).not.toBe(replacement.fragmentPath);
    await expect(
      acceptClientInvitation(client, tokenFrom(original.fragmentPath)),
    ).rejects.toMatchObject({ code: "client_invitation_invalid" });
    await expect(
      acceptClientInvitation(client, tokenFrom(replacement.fragmentPath)),
    ).rejects.toMatchObject({ code: "client_invitation_invalid" });
    const beforeAcceptance = await db
      .select({
        id: clientProjectInvitations.id,
        state: clientProjectInvitations.state,
      })
      .from(clientProjectInvitations)
      .where(eq(clientProjectInvitations.projectId, fixture.project.id));
    expect(beforeAcceptance.filter(({ state }) => state === "pending")).toEqual(
      [expect.objectContaining({ id: recovered.id })],
    );
    await expect(
      acceptClientInvitation(client, tokenFrom(recovered.fragmentPath)),
    ).resolves.toEqual({ projectId: fixture.project.id });
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

  it("keeps clarification retries behind the canonical SC-006B state and audit path", async () => {
    const fixture = await createFixture();
    const client = await createParticipant(
      fixture,
      "collaborator",
      "state@example.test",
    );
    const request = await createClientRequest(client, fixture.project.id, {
      idempotencyKey: randomUUID(),
      title: "Clarify identity provider",
      requestText: "Which provider should the project use?",
    });
    const clarificationKey = randomUUID();
    await updateClientRequestState(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      request.id,
      {
        idempotencyKey: clarificationKey,
        state: "needs_clarification",
        prompt: "Please name the provider.",
      },
    );
    await updateClientRequestState(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      request.id,
      { idempotencyKey: randomUUID(), state: "open" },
    );
    await updateClientRequestState(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      request.id,
      {
        idempotencyKey: clarificationKey,
        state: "needs_clarification",
        prompt: "Please name the provider.",
      },
    );
    const stored = await db
      .select({ state: commercialRequests.state })
      .from(commercialRequests)
      .where(eq(commercialRequests.id, request.id));
    expect(stored[0]?.state).toBe("open");
    const messages = await db
      .select({ id: clientDiscussionMessages.id })
      .from(clientDiscussionMessages)
      .where(eq(clientDiscussionMessages.requestId, request.id));
    expect(messages).toHaveLength(1);
    const stateAudits = await db
      .select({ metadata: auditEvents.metadata })
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "commercial.request.state.updated.v1"));
    expect(stateAudits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            previousState: "open",
            state: "needs_clarification",
          }),
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({
            previousState: "needs_clarification",
            state: "open",
          }),
        }),
      ]),
    );

    const decided = await seedDecision(fixture, "covered");
    await expect(
      updateClientRequestState(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        decided.requestId,
        { idempotencyKey: randomUUID(), state: "withdrawn" },
      ),
    ).rejects.toMatchObject({ code: "request_has_effective_decision" });
  });

  it("applies the SC-006B project request capacity to client-native capture", async () => {
    const fixture = await createFixture();
    const client = await createParticipant(
      fixture,
      "collaborator",
      "capacity@example.test",
    );
    await db.insert(commercialRequests).values(
      Array.from({ length: 1_000 }, (_, index) => ({
        id: randomUUID(),
        projectId: fixture.project.id,
        idempotencyKey: randomUUID(),
        title: `Capacity ${index}`,
        requestText: "Capacity boundary fixture.",
        receivedAt: new Date(),
        createdByUserId: fixture.owner.userId,
      })),
    );
    await expect(
      createClientRequest(client, fixture.project.id, {
        idempotencyKey: randomUUID(),
        title: "One too many",
        requestText: "This request must be rejected at the shared boundary.",
      }),
    ).rejects.toMatchObject({ code: "commercial_request_limit", status: 409 });
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
        includeScheduleDeltaDays: false,
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
      scheduleDeltaDays: null,
      targetDate: null,
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

  it("keeps archived client projects readable but rejects every client write path", async () => {
    const fixture = await createFixture();
    const client = await createParticipant(
      fixture,
      "collaborator",
      "archive@example.test",
    );
    const request = await createClientRequest(client, fixture.project.id, {
      idempotencyKey: randomUUID(),
      title: "Before archive",
      requestText: "This request remains visible as history.",
    });
    await updateProject(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { lifecycle: "archived" },
    );
    await expect(
      getClientProjectProjection(client, fixture.project.id),
    ).resolves.toMatchObject({ requests: [{ id: request.id }] });
    await expect(
      createClientRequest(client, fixture.project.id, {
        idempotencyKey: randomUUID(),
        title: "After archive",
        requestText: "This must not be stored.",
      }),
    ).rejects.toMatchObject({ code: "project_read_only", status: 409 });
    await expect(
      createClientDiscussionMessage(client, fixture.project.id, {
        idempotencyKey: randomUUID(),
        target: "request",
        targetId: request.id,
        body: "Archived projects must not accept new discussion.",
      }),
    ).rejects.toMatchObject({ code: "project_read_only", status: 409 });
  });

  it("serializes approver actions behind concurrent downgrade and revocation", async () => {
    const fixture = await createFixture();
    const approver = await createParticipant(
      fixture,
      "approver",
      "race-approver@example.test",
    );
    const participant = await participantId(
      fixture.project.id,
      approver.userId,
    );
    const seeded = await seedDecision(fixture, "paid_change");
    const packet = await publishClientCommercialPacket(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      seeded.requestId,
      packetInput(seeded.decisionId, seeded.impactId),
    );
    const downgradeLocked = deferred();
    const releaseDowngrade = deferred();
    const downgrade = db.transaction(async (transaction) => {
      await transaction
        .update(clientProjectParticipants)
        .set({ role: "collaborator", updatedAt: new Date() })
        .where(eq(clientProjectParticipants.id, participant));
      downgradeLocked.resolve();
      await releaseDowngrade.promise;
    });
    await downgradeLocked.promise;
    const packetAction = actOnClientCommercialPacket(
      approver,
      fixture.project.id,
      packet.id,
      {
        idempotencyKey: randomUUID(),
        action: "approved",
        comment: null,
      },
    );
    releaseDowngrade.resolve();
    await downgrade;
    await expect(packetAction).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      db
        .select()
        .from(clientCommercialPacketActions)
        .where(eq(clientCommercialPacketActions.packetId, packet.id)),
    ).resolves.toHaveLength(0);

    await updateClientParticipant(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      participant,
      "approver",
    );
    const milestone = await createMilestone(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        name: "Race milestone",
        description: null,
        targetDate: null,
      },
    );
    const item = await addClientProjectItem(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        target: "milestone",
        milestoneId: milestone.id,
        clientSummary: "Race-safe acceptance.",
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
        snapshotTitle: "Race-safe target",
        snapshotSummary: "Revocation must win before acceptance commits.",
        packetIds: [],
      },
    );
    const revokeLocked = deferred();
    const releaseRevoke = deferred();
    const revoke = db.transaction(async (transaction) => {
      await transaction
        .update(clientProjectParticipants)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(clientProjectParticipants.id, participant));
      revokeLocked.resolve();
      await releaseRevoke.promise;
    });
    await revokeLocked.promise;
    const acceptanceAction = actOnClientAcceptanceTarget(
      approver,
      fixture.project.id,
      target.id,
      {
        idempotencyKey: randomUUID(),
        action: "accepted",
        comment: null,
      },
    );
    releaseRevoke.resolve();
    await revoke;
    await expect(acceptanceAction).rejects.toMatchObject({ code: "not_found" });
    await expect(
      db
        .select()
        .from(clientAcceptanceActions)
        .where(eq(clientAcceptanceActions.acceptanceTargetId, target.id)),
    ).resolves.toHaveLength(0);
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

  it("serializes packet actions with concurrent decision and packet successors", async () => {
    const fixture = await createFixture();
    const approver = await createParticipant(
      fixture,
      "approver",
      "packet-stale-race@example.test",
    );
    const first = await seedDecision(fixture, "paid_change");
    const firstPacket = await publishClientCommercialPacket(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      first.requestId,
      packetInput(first.decisionId, first.impactId),
    );
    const decisionLocked = deferred();
    const releaseDecision = deferred();
    const supersedeDecision = db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select id from commercial_requests where id = ${first.requestId} for update`,
      );
      await transaction
        .update(commercialDecisions)
        .set({ supersededAt: new Date() })
        .where(eq(commercialDecisions.id, first.decisionId));
      decisionLocked.resolve();
      await releaseDecision.promise;
    });
    await decisionLocked.promise;
    const decisionRaceAction = actOnClientCommercialPacket(
      approver,
      fixture.project.id,
      firstPacket.id,
      {
        idempotencyKey: randomUUID(),
        action: "approved",
        comment: null,
      },
    );
    releaseDecision.resolve();
    await supersedeDecision;
    await expect(decisionRaceAction).rejects.toMatchObject({
      code: "client_packet_stale",
      status: 409,
    });

    const second = await seedDecision(fixture, "paid_change");
    const secondPacket = await publishClientCommercialPacket(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      second.requestId,
      packetInput(second.decisionId, second.impactId),
    );
    const packetLocked = deferred();
    const releasePacket = deferred();
    const successorId = randomUUID();
    const publishSuccessor = db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select id from commercial_requests where id = ${second.requestId} for update`,
      );
      const rows = await transaction
        .select()
        .from(clientCommercialPackets)
        .where(eq(clientCommercialPackets.id, secondPacket.id));
      const current = rows[0]!;
      const changedAt = new Date();
      await transaction
        .update(clientCommercialPackets)
        .set({ supersededAt: changedAt })
        .where(eq(clientCommercialPackets.id, secondPacket.id));
      await transaction.insert(clientCommercialPackets).values({
        ...current,
        id: successorId,
        idempotencyKey: randomUUID(),
        versionNumber: current.versionNumber + 1,
        supersedesPacketId: current.id,
        supersededAt: null,
        publishedAt: changedAt,
      });
      packetLocked.resolve();
      await releasePacket.promise;
    });
    await packetLocked.promise;
    const packetRaceAction = actOnClientCommercialPacket(
      approver,
      fixture.project.id,
      secondPacket.id,
      {
        idempotencyKey: randomUUID(),
        action: "rejected",
        comment: null,
      },
    );
    releasePacket.resolve();
    await publishSuccessor;
    const stalePacketError = await packetRaceAction.catch((error: unknown) =>
      Promise.resolve(error),
    );
    expect(stalePacketError).toMatchObject({ code: "client_packet_stale" });
    expect((stalePacketError as Error).message).toContain(successorId);
    await expect(
      db.select().from(clientCommercialPacketActions),
    ).resolves.toHaveLength(0);
  });

  it("serializes acceptance with milestone changes, hidden items, and target successors", async () => {
    const fixture = await createFixture();
    const approver = await createParticipant(
      fixture,
      "approver",
      "acceptance-stale-race@example.test",
    );
    const milestone = await createMilestone(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { name: "Concurrent launch", description: null, targetDate: null },
    );
    const item = await addClientProjectItem(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        target: "milestone",
        milestoneId: milestone.id,
        clientSummary: "Concurrent launch evidence.",
        sortOrder: 0,
      },
    );
    const firstTarget = await publishClientAcceptanceTarget(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      acceptanceInput(item.id, "Concurrent launch v1"),
    );
    const milestoneLocked = deferred();
    const releaseMilestone = deferred();
    const changeMilestone = db.transaction(async (transaction) => {
      await transaction
        .update(milestones)
        .set({ updatedAt: new Date(Date.now() + 1_000) })
        .where(eq(milestones.id, milestone.id));
      milestoneLocked.resolve();
      await releaseMilestone.promise;
    });
    await milestoneLocked.promise;
    const milestoneRaceAction = actOnClientAcceptanceTarget(
      approver,
      fixture.project.id,
      firstTarget.id,
      {
        idempotencyKey: randomUUID(),
        action: "accepted",
        comment: null,
      },
    );
    releaseMilestone.resolve();
    await changeMilestone;
    await expect(milestoneRaceAction).rejects.toMatchObject({
      code: "client_acceptance_stale",
    });

    const secondTarget = await publishClientAcceptanceTarget(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      acceptanceInput(item.id, "Concurrent launch v2"),
    );
    const targetLocked = deferred();
    const releaseTarget = deferred();
    const successorId = randomUUID();
    const publishSuccessor = db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select id from client_project_items where id = ${item.id} for update`,
      );
      const rows = await transaction
        .select()
        .from(clientAcceptanceTargets)
        .where(eq(clientAcceptanceTargets.id, secondTarget.id));
      const current = rows[0]!;
      const changedAt = new Date();
      await transaction
        .update(clientAcceptanceTargets)
        .set({ supersededAt: changedAt })
        .where(eq(clientAcceptanceTargets.id, secondTarget.id));
      await transaction.insert(clientAcceptanceTargets).values({
        ...current,
        id: successorId,
        idempotencyKey: randomUUID(),
        versionNumber: current.versionNumber + 1,
        supersedesTargetId: current.id,
        supersededAt: null,
        publishedAt: changedAt,
      });
      targetLocked.resolve();
      await releaseTarget.promise;
    });
    await targetLocked.promise;
    const targetRaceAction = actOnClientAcceptanceTarget(
      approver,
      fixture.project.id,
      secondTarget.id,
      {
        idempotencyKey: randomUUID(),
        action: "needs_changes",
        comment: null,
      },
    );
    releaseTarget.resolve();
    await publishSuccessor;
    const staleTargetError = await targetRaceAction.catch((error: unknown) =>
      Promise.resolve(error),
    );
    expect(staleTargetError).toMatchObject({
      code: "client_acceptance_stale",
    });
    expect((staleTargetError as Error).message).toContain(successorId);

    const hiddenMilestone = await createMilestone(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { name: "Hidden launch", description: null, targetDate: null },
    );
    const hiddenItem = await addClientProjectItem(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        target: "milestone",
        milestoneId: hiddenMilestone.id,
        clientSummary: "Visibility must remain exact.",
        sortOrder: 1,
      },
    );
    const hiddenTarget = await publishClientAcceptanceTarget(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      acceptanceInput(hiddenItem.id, "Visible before hide"),
    );
    const itemLocked = deferred();
    const releaseItem = deferred();
    const hideItem = db.transaction(async (transaction) => {
      await transaction
        .update(clientProjectItems)
        .set({ hiddenAt: new Date(), updatedAt: new Date() })
        .where(eq(clientProjectItems.id, hiddenItem.id));
      itemLocked.resolve();
      await releaseItem.promise;
    });
    await itemLocked.promise;
    const hiddenRaceAction = actOnClientAcceptanceTarget(
      approver,
      fixture.project.id,
      hiddenTarget.id,
      {
        idempotencyKey: randomUUID(),
        action: "accepted",
        comment: null,
      },
    );
    releaseItem.resolve();
    await hideItem;
    await expect(hiddenRaceAction).rejects.toMatchObject({
      code: "client_acceptance_stale",
    });
    await expect(
      db.select().from(clientAcceptanceActions),
    ).resolves.toHaveLength(0);
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
    const internalInbox = await listInternalClientNotifications(
      first.owner,
      first.workspace.id,
    );
    expect(internalInbox).toMatchObject([
      {
        kind: "request_submitted",
        projectId: first.project.id,
        requestId: request.id,
        readAt: null,
      },
    ]);
    await markClientNotificationRead(
      first.owner,
      internalInbox[0]!.id,
      first.workspace.id,
    );
    const readInbox = await listInternalClientNotifications(
      first.owner,
      first.workspace.id,
    );
    expect(readInbox[0]?.readAt).toBeInstanceOf(Date);
  });

  it("keeps older actionable attention visible while client history stays bounded", async () => {
    const fixture = await createFixture("HISTORY");
    const client = await createParticipant(
      fixture,
      "collaborator",
      "history@example.test",
    );
    const clientParticipantId = await participantId(
      fixture.project.id,
      client.userId,
    );
    const requestRows = Array.from({ length: 30 }, (_, index) => ({
      id: randomUUID(),
      projectId: fixture.project.id,
      idempotencyKey: randomUUID(),
      title: `History request ${index}`,
      requestText: `Safe request body ${index}`,
      state: index === 0 ? ("needs_clarification" as const) : ("open" as const),
      submittedByClientParticipantId: clientParticipantId,
      receivedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      createdByUserId: client.userId,
    }));
    await db.insert(commercialRequests).values(requestRows);
    await db.insert(clientDiscussionMessages).values(
      requestRows.map((request, index) => ({
        projectId: fixture.project.id,
        target: "request" as const,
        requestId: request.id,
        authorUserId: index === 0 ? fixture.owner.userId : client.userId,
        authorParticipantId: index === 0 ? null : clientParticipantId,
        idempotencyKey: randomUUID(),
        body: `Reachable discussion ${index}`,
        createdAt: new Date(Date.UTC(2026, 0, 2, 0, index)),
      })),
    );

    const defaultPage = await getClientProjectProjection(
      client,
      fixture.project.id,
    );
    expect(defaultPage.requests).toHaveLength(25);
    expect(defaultPage.discussion).toHaveLength(25);
    expect(defaultPage.history).toMatchObject({
      page: 1,
      pageSize: 25,
      hasNewer: false,
      hasOlder: true,
      hasMore: { requests: true, discussion: true },
    });
    expect(
      defaultPage.requests.some(({ title }) => title === "History request 0"),
    ).toBe(false);
    expect(defaultPage.attention).toContainEqual({
      kind: "clarification",
      targetId: requestRows[0]!.id,
      label: "Reply to History request 0",
      historyPage: 2,
    });

    const olderPage = await getClientProjectProjection(
      client,
      fixture.project.id,
      { page: 2, pageSize: 25 },
    );
    expect(olderPage.requests).toHaveLength(5);
    expect(olderPage.discussion).toHaveLength(5);
    expect(olderPage.requests.map(({ title }) => title)).toContain(
      "History request 0",
    );
    expect(olderPage.discussion.map(({ body }) => body)).toContain(
      "Reachable discussion 0",
    );
    expect(olderPage.attention).toContainEqual({
      kind: "clarification",
      targetId: requestRows[0]!.id,
      label: "Reply to History request 0",
      historyPage: 2,
    });
    expect(olderPage.history).toMatchObject({
      page: 2,
      hasNewer: true,
      hasOlder: false,
    });
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

function acceptanceInput(projectItemId: string, snapshotTitle: string) {
  return {
    idempotencyKey: randomUUID(),
    projectItemId,
    snapshotTitle,
    snapshotSummary: `${snapshotTitle} summary.`,
    packetIds: [],
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
