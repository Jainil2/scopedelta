import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditEvents,
  clientAcceptanceActions,
  clientAcceptanceTargetPackets,
  clientAcceptanceTargets,
  clientCollaborationNotifications,
  clientCommercialPacketActions,
  clientCommercialPackets,
  clientCommercialPacketScopeReferences,
  clientDiscussionMessages,
  clientProjectInvitations,
  clientProjectItems,
  clientProjectParticipants,
  clientProjectProfiles,
  commercialDecisions,
  commercialImpactAssessments,
  commercialRequests,
  commercialScopeItemRevisions,
  memberships,
  milestones,
  projects,
  users,
  type ClientNotificationKind,
  type ClientParticipantRole,
} from "@/db/schema";
import type {
  ActOnClientAcceptanceInput,
  ActOnClientPacketInput,
  CreateClientDiscussionInput,
  CreateClientInvitationInput,
  CreateClientProjectItemInput,
  CreateClientRequestInput,
  PublishClientAcceptanceInput,
  PublishClientPacketInput,
} from "@/lib/client-collaboration-validation";
import {
  packetRequirementForDisposition,
  type ClientProjectProjection,
} from "@/lib/client-project-projection";
import { forbidden, notFound, PlatformError } from "@/lib/platform-errors";
import { consumeActionLimit } from "@/server/action-rate-limit";
import {
  assertCommercialRequestCapacity,
  lockCommercialRequestProject,
  transitionCommercialRequestState,
} from "@/server/commercial-change-control";
import {
  assertProjectManager,
  assertWritableProject,
  getProjectAccess,
  type Executor,
  type Transaction,
} from "@/server/delivery";
import type { UserActor } from "@/server/workspaces";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

type ClientAccess = {
  participantId: string;
  projectId: string;
  workspaceId: string;
  role: ClientParticipantRole;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function assertClientManager(
  database: Executor,
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  const access = await assertWritableProject(
    database,
    actor,
    workspaceId,
    projectId,
  );
  assertProjectManager(access, actor.userId);
  return access;
}

export async function getClientAccess(
  database: Executor,
  actor: UserActor,
  projectId: string,
): Promise<ClientAccess> {
  const rows = await database
    .select({
      participantId: clientProjectParticipants.id,
      projectId: clientProjectParticipants.projectId,
      workspaceId: projects.workspaceId,
      role: clientProjectParticipants.role,
    })
    .from(clientProjectParticipants)
    .innerJoin(projects, eq(projects.id, clientProjectParticipants.projectId))
    .where(
      and(
        eq(clientProjectParticipants.projectId, projectId),
        eq(clientProjectParticipants.userId, actor.userId),
        isNull(clientProjectParticipants.revokedAt),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

async function getClientWriteAccess(
  transaction: Transaction,
  actor: UserActor,
  projectId: string,
): Promise<ClientAccess> {
  const rows = await transaction
    .select({
      participantId: clientProjectParticipants.id,
      projectId: clientProjectParticipants.projectId,
      workspaceId: projects.workspaceId,
      role: clientProjectParticipants.role,
      lifecycle: projects.lifecycle,
    })
    .from(clientProjectParticipants)
    .innerJoin(projects, eq(projects.id, clientProjectParticipants.projectId))
    .where(
      and(
        eq(clientProjectParticipants.projectId, projectId),
        eq(clientProjectParticipants.userId, actor.userId),
        isNull(clientProjectParticipants.revokedAt),
      ),
    )
    .for("update")
    .limit(1);
  if (!rows[0]) throw notFound();
  if (rows[0].lifecycle !== "active") {
    throw new PlatformError(
      "project_read_only",
      409,
      "This project is read-only and no longer accepts client changes.",
    );
  }
  return rows[0];
}

async function auditClientEvent(
  transaction: Transaction,
  workspaceId: string,
  actorUserId: string,
  eventType: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, string | string[]> = {},
) {
  await transaction.insert(auditEvents).values({
    id: randomUUID(),
    workspaceId,
    actorType: "human",
    actorId: actorUserId,
    eventType,
    targetType,
    targetId,
    metadata,
  });
}

async function notifyInternalManagers(
  transaction: Transaction,
  input: {
    workspaceId: string;
    projectId: string;
    actorUserId: string;
    actorParticipantId?: string;
    kind: ClientNotificationKind;
    dedupeKey: string;
    requestId?: string;
    packetId?: string;
    acceptanceTargetId?: string;
  },
) {
  const recipients = await transaction
    .select({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(projects, eq(projects.workspaceId, memberships.workspaceId))
    .where(
      and(
        eq(projects.id, input.projectId),
        or(
          inArray(memberships.role, ["owner", "admin"]),
          eq(memberships.userId, projects.leadUserId),
        ),
      ),
    );
  if (!recipients.length) return;
  await transaction
    .insert(clientCollaborationNotifications)
    .values(
      recipients.map(({ userId }) => ({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        recipientUserId: userId,
        kind: input.kind,
        actorUserId: input.actorUserId,
        actorParticipantId: input.actorParticipantId,
        requestId: input.requestId,
        packetId: input.packetId,
        acceptanceTargetId: input.acceptanceTargetId,
        dedupeKey: input.dedupeKey,
      })),
    )
    .onConflictDoNothing();
}

async function notifyClientParticipants(
  transaction: Transaction,
  input: {
    workspaceId: string;
    projectId: string;
    actorUserId: string;
    kind: ClientNotificationKind;
    dedupeKey: string;
    requestId?: string;
    packetId?: string;
    acceptanceTargetId?: string;
  },
) {
  const recipients = await transaction
    .select({
      userId: clientProjectParticipants.userId,
      participantId: clientProjectParticipants.id,
    })
    .from(clientProjectParticipants)
    .where(
      and(
        eq(clientProjectParticipants.projectId, input.projectId),
        isNull(clientProjectParticipants.revokedAt),
      ),
    );
  if (!recipients.length) return;
  await transaction
    .insert(clientCollaborationNotifications)
    .values(
      recipients.map(({ userId, participantId }) => ({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        recipientUserId: userId,
        recipientParticipantId: participantId,
        kind: input.kind,
        actorUserId: input.actorUserId,
        requestId: input.requestId,
        packetId: input.packetId,
        acceptanceTargetId: input.acceptanceTargetId,
        dedupeKey: input.dedupeKey,
      })),
    )
    .onConflictDoNothing();
}

export async function listClientProjects(actor: UserActor) {
  return getDb()
    .select({
      id: projects.id,
      name: projects.name,
      role: clientProjectParticipants.role,
      workspaceId: projects.workspaceId,
    })
    .from(clientProjectParticipants)
    .innerJoin(projects, eq(projects.id, clientProjectParticipants.projectId))
    .where(
      and(
        eq(clientProjectParticipants.userId, actor.userId),
        isNull(clientProjectParticipants.revokedAt),
      ),
    )
    .orderBy(asc(projects.name), asc(projects.id));
}

export async function listClientParticipants(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  const participants = await getDb()
    .select({
      id: clientProjectParticipants.id,
      name: users.name,
      email: users.email,
      role: clientProjectParticipants.role,
      activatedAt: clientProjectParticipants.activatedAt,
      revokedAt: clientProjectParticipants.revokedAt,
    })
    .from(clientProjectParticipants)
    .innerJoin(users, eq(users.id, clientProjectParticipants.userId))
    .where(eq(clientProjectParticipants.projectId, projectId))
    .orderBy(asc(users.name), asc(clientProjectParticipants.id));
  const invitations = await getDb()
    .select({
      id: clientProjectInvitations.id,
      email: clientProjectInvitations.email,
      role: clientProjectInvitations.role,
      state: clientProjectInvitations.state,
      expiresAt: clientProjectInvitations.expiresAt,
      emailDeliveryState: clientProjectInvitations.emailDeliveryState,
    })
    .from(clientProjectInvitations)
    .where(eq(clientProjectInvitations.projectId, projectId))
    .orderBy(desc(clientProjectInvitations.createdAt));
  return { participants, invitations };
}

export async function inviteClientParticipant(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateClientInvitationInput,
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  await consumeActionLimit(
    `client-invite:${projectId}:${actor.userId}`,
    10,
    60 * 60,
  );
  const priorAttempt = await getDb()
    .select({
      id: clientProjectInvitations.id,
      email: clientProjectInvitations.email,
      role: clientProjectInvitations.role,
      state: clientProjectInvitations.state,
    })
    .from(clientProjectInvitations)
    .where(
      and(
        eq(clientProjectInvitations.projectId, projectId),
        eq(clientProjectInvitations.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (priorAttempt[0] && priorAttempt[0].state !== "pending") {
    throw new PlatformError(
      "client_invitation_not_pending",
      409,
      "This invitation is no longer pending. Create a fresh invitation.",
    );
  }
  if (
    priorAttempt[0] &&
    (priorAttempt[0].email !== input.email ||
      priorAttempt[0].role !== input.role)
  ) {
    throw new PlatformError(
      "idempotency_conflict",
      409,
      "This idempotency key was already used with different invitation details.",
    );
  }
  const existing = await getDb()
    .select({ id: clientProjectParticipants.id })
    .from(clientProjectParticipants)
    .innerJoin(users, eq(users.id, clientProjectParticipants.userId))
    .where(
      and(
        eq(clientProjectParticipants.projectId, projectId),
        sql`lower(${users.email}) = ${input.email}`,
        isNull(clientProjectParticipants.revokedAt),
      ),
    )
    .limit(1);
  if (existing[0]) {
    throw new PlatformError(
      "already_a_client_participant",
      409,
      "This person already has client access to the project.",
    );
  }
  const projectRows = await getDb()
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!projectRows[0]) throw notFound();
  const token = randomBytes(32).toString("base64url");
  const invitationId = priorAttempt[0]?.id ?? randomUUID();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  await getDb().transaction(async (transaction) => {
    const prior = await transaction
      .select({ id: clientProjectInvitations.id })
      .from(clientProjectInvitations)
      .where(
        and(
          eq(clientProjectInvitations.projectId, projectId),
          eq(clientProjectInvitations.state, "pending"),
          sql`lower(${clientProjectInvitations.email}) = ${input.email}`,
          ne(clientProjectInvitations.id, invitationId),
        ),
      );
    if (prior.length) {
      await transaction
        .update(clientProjectInvitations)
        .set({
          state: "revoked",
          tokenHash: null,
          revokedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          inArray(
            clientProjectInvitations.id,
            prior.map(({ id }) => id),
          ),
        );
    }
    if (priorAttempt[0]) {
      await transaction
        .update(clientProjectInvitations)
        .set({
          tokenHash: hashToken(token),
          expiresAt,
          emailDeliveryState: input.sendEmail ? "pending" : "not_requested",
          updatedAt: new Date(),
        })
        .where(eq(clientProjectInvitations.id, invitationId));
    } else {
      await transaction.insert(clientProjectInvitations).values({
        id: invitationId,
        projectId,
        idempotencyKey: input.idempotencyKey,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        expiresAt,
        invitedByUserId: actor.userId,
        emailDeliveryState: input.sendEmail ? "pending" : "not_requested",
      });
    }
    await auditClientEvent(
      transaction,
      workspaceId,
      actor.userId,
      "client.invitation.created.v1",
      "client_project_invitation",
      invitationId,
      { projectId, role: input.role },
    );
  });
  return {
    id: invitationId,
    email: input.email,
    role: input.role,
    expiresAt,
    fragmentPath: `/client/invitations/accept#token=${encodeURIComponent(token)}`,
    delivery: input.sendEmail
      ? { to: input.email, token, projectName: projectRows[0].name }
      : null,
  };
}

export async function revokeClientInvitation(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  invitationId: string,
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  const updated = await getDb()
    .update(clientProjectInvitations)
    .set({
      state: "revoked",
      tokenHash: null,
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(clientProjectInvitations.id, invitationId),
        eq(clientProjectInvitations.projectId, projectId),
        eq(clientProjectInvitations.state, "pending"),
      ),
    )
    .returning({ id: clientProjectInvitations.id });
  if (!updated[0]) throw notFound();
  return { id: updated[0].id, state: "revoked" as const };
}

export async function reissueClientInvitation(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  invitationId: string,
  input: { idempotencyKey: string; sendEmail: boolean },
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  const sourceRows = await getDb()
    .select({
      id: clientProjectInvitations.id,
      email: clientProjectInvitations.email,
      role: clientProjectInvitations.role,
      state: clientProjectInvitations.state,
    })
    .from(clientProjectInvitations)
    .where(
      and(
        eq(clientProjectInvitations.id, invitationId),
        eq(clientProjectInvitations.projectId, projectId),
      ),
    )
    .limit(1);
  const source = sourceRows[0];
  if (!source) throw notFound();
  const replacementRows = await getDb()
    .select({
      id: clientProjectInvitations.id,
      email: clientProjectInvitations.email,
      role: clientProjectInvitations.role,
      state: clientProjectInvitations.state,
    })
    .from(clientProjectInvitations)
    .where(
      and(
        eq(clientProjectInvitations.projectId, projectId),
        eq(clientProjectInvitations.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  const replacement = replacementRows[0];
  if (replacement) {
    if (
      replacement.id === source.id ||
      replacement.email !== source.email ||
      replacement.role !== source.role
    ) {
      throw new PlatformError(
        "idempotency_conflict",
        409,
        "This idempotency key belongs to a different invitation operation.",
      );
    }
    if (replacement.state !== "pending") {
      throw new PlatformError(
        "client_invitation_not_pending",
        409,
        "The replacement invitation is no longer pending.",
      );
    }
  } else if (source.state !== "pending") {
    throw notFound();
  }
  return inviteClientParticipant(actor, workspaceId, projectId, {
    idempotencyKey: input.idempotencyKey,
    email: source.email,
    role: source.role,
    sendEmail: input.sendEmail,
  });
}

export async function verifyClientInvitationToken(token: string) {
  const invitation = await getDb()
    .select({ id: clientProjectInvitations.id })
    .from(clientProjectInvitations)
    .where(
      and(
        eq(clientProjectInvitations.tokenHash, hashToken(token)),
        eq(clientProjectInvitations.state, "pending"),
        sql`${clientProjectInvitations.expiresAt} > now()`,
      ),
    )
    .limit(1);
  if (!invitation[0]) {
    throw new PlatformError(
      "client_invitation_invalid",
      400,
      "This client invitation is invalid or has expired.",
    );
  }
}

export async function acceptClientInvitation(actor: UserActor, token: string) {
  return getDb().transaction(async (transaction) => {
    const rows = await transaction
      .select({
        id: clientProjectInvitations.id,
        projectId: clientProjectInvitations.projectId,
        email: clientProjectInvitations.email,
        role: clientProjectInvitations.role,
        workspaceId: projects.workspaceId,
        lifecycle: projects.lifecycle,
      })
      .from(clientProjectInvitations)
      .innerJoin(projects, eq(projects.id, clientProjectInvitations.projectId))
      .where(
        and(
          eq(clientProjectInvitations.tokenHash, hashToken(token)),
          eq(clientProjectInvitations.state, "pending"),
          sql`${clientProjectInvitations.expiresAt} > now()`,
        ),
      )
      .for("update")
      .limit(1);
    const invitation = rows[0];
    if (!invitation) {
      throw new PlatformError(
        "client_invitation_invalid",
        400,
        "This client invitation is invalid or has expired.",
      );
    }
    if (invitation.email !== actor.email.trim().toLowerCase()) {
      throw new PlatformError(
        "client_invitation_email_mismatch",
        403,
        "Sign in with the email address that received this invitation.",
      );
    }
    if (invitation.lifecycle !== "active") {
      throw new PlatformError(
        "project_read_only",
        409,
        "This project is read-only and cannot accept new client access.",
      );
    }
    const existing = await transaction
      .select({ id: clientProjectParticipants.id })
      .from(clientProjectParticipants)
      .where(
        and(
          eq(clientProjectParticipants.projectId, invitation.projectId),
          eq(clientProjectParticipants.userId, actor.userId),
        ),
      )
      .limit(1);
    let participantId = existing[0]?.id;
    if (participantId) {
      await transaction
        .update(clientProjectParticipants)
        .set({
          role: invitation.role,
          revokedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(clientProjectParticipants.id, participantId));
    } else {
      participantId = randomUUID();
      await transaction.insert(clientProjectParticipants).values({
        id: participantId,
        projectId: invitation.projectId,
        userId: actor.userId,
        invitedEmail: invitation.email,
        role: invitation.role,
        createdByUserId: actor.userId,
      });
    }
    const claimed = await transaction
      .update(clientProjectInvitations)
      .set({
        state: "accepted",
        tokenHash: null,
        acceptedParticipantId: participantId,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientProjectInvitations.id, invitation.id),
          eq(clientProjectInvitations.state, "pending"),
        ),
      )
      .returning({ id: clientProjectInvitations.id });
    if (!claimed[0]) {
      throw new PlatformError(
        "client_invitation_invalid",
        400,
        "This client invitation is invalid or has expired.",
      );
    }
    await auditClientEvent(
      transaction,
      invitation.workspaceId,
      actor.userId,
      "client.invitation.accepted.v1",
      "client_project_participant",
      participantId,
      { projectId: invitation.projectId, role: invitation.role },
    );
    return { projectId: invitation.projectId };
  });
}

export async function updateClientParticipant(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  participantId: string,
  role: ClientParticipantRole,
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  const updated = await getDb()
    .update(clientProjectParticipants)
    .set({ role, updatedAt: new Date() })
    .where(
      and(
        eq(clientProjectParticipants.id, participantId),
        eq(clientProjectParticipants.projectId, projectId),
        isNull(clientProjectParticipants.revokedAt),
      ),
    )
    .returning({ id: clientProjectParticipants.id });
  if (!updated[0]) throw notFound();
  return { id: participantId, role };
}

export async function revokeClientParticipant(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  participantId: string,
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  const updated = await getDb()
    .update(clientProjectParticipants)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(clientProjectParticipants.id, participantId),
        eq(clientProjectParticipants.projectId, projectId),
        isNull(clientProjectParticipants.revokedAt),
      ),
    )
    .returning({ id: clientProjectParticipants.id });
  if (!updated[0]) throw notFound();
  return { id: participantId, revoked: true };
}

export async function updateClientProjectProfile(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  summary: string,
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .insert(clientProjectProfiles)
    .values({ projectId, summary, updatedByUserId: actor.userId })
    .onConflictDoUpdate({
      target: clientProjectProfiles.projectId,
      set: { summary, updatedByUserId: actor.userId, updatedAt: new Date() },
    })
    .returning({ summary: clientProjectProfiles.summary });
  return rows[0]!;
}

export async function addClientProjectItem(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateClientProjectItemInput,
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  const existing = await getDb()
    .select({ id: clientProjectItems.id })
    .from(clientProjectItems)
    .where(
      and(
        eq(clientProjectItems.projectId, projectId),
        eq(clientProjectItems.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];
  const targetId =
    input.target === "milestone"
      ? input.milestoneId
      : input.scopeItemRevisionId;
  const source =
    input.target === "milestone"
      ? await getDb()
          .select({ id: milestones.id })
          .from(milestones)
          .where(
            and(
              eq(milestones.id, targetId),
              eq(milestones.projectId, projectId),
            ),
          )
          .limit(1)
      : await getDb()
          .select({ id: commercialScopeItemRevisions.id })
          .from(commercialScopeItemRevisions)
          .where(
            and(
              eq(commercialScopeItemRevisions.id, targetId),
              eq(commercialScopeItemRevisions.projectId, projectId),
            ),
          )
          .limit(1);
  if (!source[0]) throw notFound();
  const id = randomUUID();
  await getDb()
    .insert(clientProjectItems)
    .values({
      id,
      projectId,
      idempotencyKey: input.idempotencyKey,
      target: input.target,
      milestoneId: input.target === "milestone" ? input.milestoneId : null,
      scopeItemRevisionId:
        input.target === "deliverable" ? input.scopeItemRevisionId : null,
      clientSummary: input.clientSummary,
      sortOrder: input.sortOrder,
      createdByUserId: actor.userId,
    });
  return { id };
}

export async function hideClientProjectItem(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  itemId: string,
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .update(clientProjectItems)
    .set({ hiddenAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(clientProjectItems.id, itemId),
        eq(clientProjectItems.projectId, projectId),
        isNull(clientProjectItems.hiddenAt),
      ),
    )
    .returning({ id: clientProjectItems.id });
  if (!rows[0]) throw notFound();
  return { id: itemId, hidden: true };
}

export async function createClientRequest(
  actor: UserActor,
  projectId: string,
  input: CreateClientRequestInput,
) {
  const access = await getClientAccess(getDb(), actor, projectId);
  await consumeActionLimit(
    `client-request:${access.participantId}`,
    20,
    60 * 60,
  );
  const requestId = await getDb().transaction(async (transaction) => {
    const liveAccess = await getClientWriteAccess(
      transaction,
      actor,
      projectId,
    );
    await lockCommercialRequestProject(transaction, projectId);
    const existing = await transaction
      .select({ id: commercialRequests.id })
      .from(commercialRequests)
      .where(
        and(
          eq(commercialRequests.projectId, projectId),
          eq(commercialRequests.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0].id;
    await assertCommercialRequestCapacity(transaction, projectId);
    const id = randomUUID();
    await transaction.insert(commercialRequests).values({
      id,
      projectId,
      idempotencyKey: input.idempotencyKey,
      state: "open",
      title: input.title,
      requestText: input.requestText,
      externalRequester: actor.email,
      submittedByClientParticipantId: liveAccess.participantId,
      receivedAt: new Date(),
      createdByUserId: actor.userId,
    });
    await notifyInternalManagers(transaction, {
      workspaceId: liveAccess.workspaceId,
      projectId,
      actorUserId: actor.userId,
      actorParticipantId: liveAccess.participantId,
      kind: "request_submitted",
      requestId: id,
      dedupeKey: `client-request:${id}`,
    });
    await auditClientEvent(
      transaction,
      liveAccess.workspaceId,
      actor.userId,
      "client.request.submitted.v1",
      "commercial_request",
      id,
      { projectId },
    );
    return id;
  });
  return { id: requestId, state: "open" as const };
}

export async function updateClientRequestState(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  requestId: string,
  input:
    | { idempotencyKey: string; state: "needs_clarification"; prompt: string }
    | {
        idempotencyKey: string;
        state: "open" | "withdrawn";
      },
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  return getDb().transaction(async (transaction) => {
    await assertClientManager(transaction, actor, workspaceId, projectId);
    if (input.state === "needs_clarification") {
      const retry = await transaction
        .select({
          id: clientDiscussionMessages.id,
          projectId: clientDiscussionMessages.projectId,
          requestId: clientDiscussionMessages.requestId,
          target: clientDiscussionMessages.target,
          body: clientDiscussionMessages.body,
        })
        .from(clientDiscussionMessages)
        .where(
          and(
            eq(clientDiscussionMessages.authorUserId, actor.userId),
            eq(clientDiscussionMessages.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (retry[0]) {
        if (
          retry[0].projectId !== projectId ||
          retry[0].requestId !== requestId ||
          retry[0].target !== "request" ||
          retry[0].body !== input.prompt
        ) {
          throw new PlatformError(
            "idempotency_conflict",
            409,
            "This idempotency key was already used for another client message.",
          );
        }
        return { id: requestId, state: input.state };
      }
    }
    await transitionCommercialRequestState(
      transaction,
      actor,
      workspaceId,
      projectId,
      requestId,
      input.state,
    );
    if (input.state === "needs_clarification") {
      const messageId = randomUUID();
      await transaction
        .insert(clientDiscussionMessages)
        .values({
          id: messageId,
          projectId,
          target: "request",
          requestId,
          authorUserId: actor.userId,
          idempotencyKey: input.idempotencyKey,
          body: input.prompt,
        })
        .onConflictDoNothing();
      await notifyClientParticipants(transaction, {
        workspaceId,
        projectId,
        actorUserId: actor.userId,
        kind: "clarification_needed",
        requestId,
        dedupeKey: `clarification:${requestId}:${input.idempotencyKey}`,
      });
    }
    return { id: requestId, state: input.state };
  });
}

function discussionTargetColumns(input: CreateClientDiscussionInput) {
  return {
    requestId: input.target === "request" ? input.targetId : undefined,
    packetId: input.target === "packet" ? input.targetId : undefined,
    acceptanceTargetId:
      input.target === "acceptance_target" ? input.targetId : undefined,
  };
}

async function assertDiscussionTarget(
  database: Executor,
  projectId: string,
  input: CreateClientDiscussionInput,
) {
  let found: Array<{ id: string }>;
  if (input.target === "request") {
    found = await database
      .select({ id: commercialRequests.id })
      .from(commercialRequests)
      .where(
        and(
          eq(commercialRequests.id, input.targetId),
          eq(commercialRequests.projectId, projectId),
          sql`${commercialRequests.submittedByClientParticipantId} is not null`,
        ),
      )
      .limit(1);
  } else if (input.target === "packet") {
    found = await database
      .select({ id: clientCommercialPackets.id })
      .from(clientCommercialPackets)
      .where(
        and(
          eq(clientCommercialPackets.id, input.targetId),
          eq(clientCommercialPackets.projectId, projectId),
        ),
      )
      .limit(1);
  } else {
    found = await database
      .select({ id: clientAcceptanceTargets.id })
      .from(clientAcceptanceTargets)
      .where(
        and(
          eq(clientAcceptanceTargets.id, input.targetId),
          eq(clientAcceptanceTargets.projectId, projectId),
        ),
      )
      .limit(1);
  }
  if (!found[0]) throw notFound();
}

export async function createClientDiscussionMessage(
  actor: UserActor,
  projectId: string,
  input: CreateClientDiscussionInput,
) {
  const access = await getClientAccess(getDb(), actor, projectId);
  await consumeActionLimit(
    `client-discussion:${access.participantId}`,
    60,
    60 * 60,
  );
  return getDb().transaction(async (transaction) => {
    const liveAccess = await getClientWriteAccess(
      transaction,
      actor,
      projectId,
    );
    await assertDiscussionTarget(transaction, projectId, input);
    const existing = await transaction
      .select({ id: clientDiscussionMessages.id })
      .from(clientDiscussionMessages)
      .where(
        and(
          eq(clientDiscussionMessages.authorUserId, actor.userId),
          eq(clientDiscussionMessages.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];
    const id = randomUUID();
    await transaction.insert(clientDiscussionMessages).values({
      id,
      projectId,
      target: input.target,
      ...discussionTargetColumns(input),
      authorUserId: actor.userId,
      authorParticipantId: liveAccess.participantId,
      idempotencyKey: input.idempotencyKey,
      body: input.body,
    });
    await notifyInternalManagers(transaction, {
      workspaceId: liveAccess.workspaceId,
      projectId,
      actorUserId: actor.userId,
      actorParticipantId: liveAccess.participantId,
      kind: "discussion_added",
      ...discussionTargetColumns(input),
      dedupeKey: `client-discussion:${id}`,
    });
    return { id };
  });
}

export async function createInternalClientDiscussionMessage(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateClientDiscussionInput,
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  return getDb().transaction(async (transaction) => {
    await assertClientManager(transaction, actor, workspaceId, projectId);
    await assertDiscussionTarget(transaction, projectId, input);
    const existing = await transaction
      .select({ id: clientDiscussionMessages.id })
      .from(clientDiscussionMessages)
      .where(
        and(
          eq(clientDiscussionMessages.authorUserId, actor.userId),
          eq(clientDiscussionMessages.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];
    const id = randomUUID();
    await transaction.insert(clientDiscussionMessages).values({
      id,
      projectId,
      target: input.target,
      ...discussionTargetColumns(input),
      authorUserId: actor.userId,
      idempotencyKey: input.idempotencyKey,
      body: input.body,
    });
    await notifyClientParticipants(transaction, {
      workspaceId,
      projectId,
      actorUserId: actor.userId,
      kind: "discussion_added",
      ...discussionTargetColumns(input),
      dedupeKey: `team-discussion:${id}`,
    });
    return { id };
  });
}

type ClientSafeImpact = {
  scheduleDeltaDays: number | null;
  targetDate: string | null;
  monetaryAmount: string | null;
  currencyCode: string | null;
};

async function loadConfirmedClientImpact(
  transaction: Transaction,
  projectId: string,
  requestId: string,
  input: PublishClientPacketInput,
): Promise<ClientSafeImpact | null> {
  if (!input.impactAssessmentId) {
    if (
      input.includeScheduleDeltaDays ||
      input.includeTargetDate ||
      input.includeMonetaryAmount
    ) {
      throw new PlatformError(
        "confirmed_impact_required",
        409,
        "Select a confirmed impact assessment before publishing those values.",
      );
    }
    return null;
  }
  const rows = await transaction
    .select({
      scheduleDeltaDays: commercialImpactAssessments.scheduleDeltaDays,
      targetDate: commercialImpactAssessments.targetDate,
      monetaryAmount: commercialImpactAssessments.monetaryAmount,
      currencyCode: commercialImpactAssessments.currencyCode,
    })
    .from(commercialImpactAssessments)
    .where(
      and(
        eq(commercialImpactAssessments.id, input.impactAssessmentId),
        eq(commercialImpactAssessments.projectId, projectId),
        eq(commercialImpactAssessments.requestId, requestId),
        eq(commercialImpactAssessments.decisionId, input.decisionId),
        eq(commercialImpactAssessments.confidence, "confirmed"),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    throw new PlatformError(
      "confirmed_impact_required",
      409,
      "Select a confirmed impact assessment before publishing those values.",
    );
  }
  return rows[0];
}

async function assertClientScopeRevisions(
  transaction: Transaction,
  projectId: string,
  scopeIds: string[],
) {
  if (!scopeIds.length) return;
  const valid = await transaction
    .select({ id: commercialScopeItemRevisions.id })
    .from(commercialScopeItemRevisions)
    .where(
      and(
        eq(commercialScopeItemRevisions.projectId, projectId),
        inArray(commercialScopeItemRevisions.id, scopeIds),
      ),
    );
  if (valid.length !== scopeIds.length) throw notFound();
}

export async function publishClientCommercialPacket(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  requestId: string,
  input: PublishClientPacketInput,
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  return getDb().transaction(async (transaction) => {
    await assertClientManager(transaction, actor, workspaceId, projectId);
    await transaction.execute(
      sql`select id from ${commercialRequests} where id = ${requestId} and project_id = ${projectId} for update`,
    );
    const decisionRows = await transaction
      .select({
        id: commercialDecisions.id,
        disposition: commercialDecisions.disposition,
      })
      .from(commercialDecisions)
      .where(
        and(
          eq(commercialDecisions.id, input.decisionId),
          eq(commercialDecisions.projectId, projectId),
          eq(commercialDecisions.requestId, requestId),
          isNull(commercialDecisions.supersededAt),
        ),
      )
      .limit(1);
    const decision = decisionRows[0];
    if (!decision) {
      throw new PlatformError(
        "client_packet_stale_decision",
        409,
        "The internal decision changed. Preview the current decision before publishing.",
      );
    }
    const existing = await transaction
      .select({ id: clientCommercialPackets.id })
      .from(clientCommercialPackets)
      .where(
        and(
          eq(clientCommercialPackets.requestId, requestId),
          eq(clientCommercialPackets.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const impact = await loadConfirmedClientImpact(
      transaction,
      projectId,
      requestId,
      input,
    );
    const scopeIds = [...new Set(input.scopeItemRevisionIds)];
    await assertClientScopeRevisions(transaction, projectId, scopeIds);
    const current = await transaction
      .select({
        id: clientCommercialPackets.id,
        version: clientCommercialPackets.versionNumber,
      })
      .from(clientCommercialPackets)
      .where(
        and(
          eq(clientCommercialPackets.requestId, requestId),
          isNull(clientCommercialPackets.supersededAt),
        ),
      )
      .limit(1);
    const id = randomUUID();
    const version = (current[0]?.version ?? 0) + 1;
    if (current[0]) {
      await transaction
        .update(clientCommercialPackets)
        .set({ supersededAt: new Date() })
        .where(eq(clientCommercialPackets.id, current[0].id));
    }
    await transaction.insert(clientCommercialPackets).values({
      id,
      projectId,
      requestId,
      decisionId: input.decisionId,
      impactAssessmentId: input.impactAssessmentId,
      idempotencyKey: input.idempotencyKey,
      versionNumber: version,
      supersedesPacketId: current[0]?.id,
      requirement: packetRequirementForDisposition(decision.disposition),
      title: input.title,
      requestSummary: input.requestSummary,
      treatmentSummary: input.treatmentSummary,
      scopeSummary: input.scopeSummary,
      assumptions: input.assumptions,
      scheduleDeltaDays: input.includeScheduleDeltaDays
        ? impact?.scheduleDeltaDays
        : null,
      targetDate: input.includeTargetDate ? impact?.targetDate : null,
      monetaryAmount: input.includeMonetaryAmount
        ? impact?.monetaryAmount
        : null,
      currencyCode: input.includeMonetaryAmount ? impact?.currencyCode : null,
      publishedByUserId: actor.userId,
    });
    if (scopeIds.length) {
      await transaction.insert(clientCommercialPacketScopeReferences).values(
        scopeIds.map((scopeItemRevisionId) => ({
          packetId: id,
          projectId,
          scopeItemRevisionId,
        })),
      );
    }
    await notifyClientParticipants(transaction, {
      workspaceId,
      projectId,
      actorUserId: actor.userId,
      kind: "packet_published",
      requestId,
      packetId: id,
      dedupeKey: `packet:${id}`,
    });
    await auditClientEvent(
      transaction,
      workspaceId,
      actor.userId,
      "client.packet.published.v1",
      "client_commercial_packet",
      id,
      { projectId, requestId, decisionId: input.decisionId },
    );
    return { id, version };
  });
}

function staleVersion(
  code: "client_packet_stale" | "client_acceptance_stale",
  currentId?: string,
) {
  return new PlatformError(
    code,
    409,
    currentId
      ? `This version is no longer actionable. Open the current version (${currentId}).`
      : "This version is no longer actionable.",
  );
}

export async function actOnClientCommercialPacket(
  actor: UserActor,
  projectId: string,
  packetId: string,
  input: ActOnClientPacketInput,
) {
  const access = await getClientAccess(getDb(), actor, projectId);
  await consumeActionLimit(
    `client-packet-action:${access.participantId}`,
    30,
    60 * 60,
  );
  return getDb().transaction(async (transaction) => {
    const liveAccess = await getClientWriteAccess(
      transaction,
      actor,
      projectId,
    );
    const packetSource = await transaction
      .select({ requestId: clientCommercialPackets.requestId })
      .from(clientCommercialPackets)
      .where(
        and(
          eq(clientCommercialPackets.id, packetId),
          eq(clientCommercialPackets.projectId, projectId),
        ),
      )
      .limit(1);
    if (!packetSource[0]) throw notFound();
    await transaction.execute(
      sql`select id from ${commercialRequests} where id = ${packetSource[0].requestId} and project_id = ${projectId} for update`,
    );
    await transaction.execute(
      sql`select id from ${clientCommercialPackets} where id = ${packetId} and project_id = ${projectId} for update`,
    );
    const rows = await transaction
      .select({
        id: clientCommercialPackets.id,
        requestId: clientCommercialPackets.requestId,
        decisionId: clientCommercialPackets.decisionId,
        requirement: clientCommercialPackets.requirement,
        supersededAt: clientCommercialPackets.supersededAt,
      })
      .from(clientCommercialPackets)
      .where(
        and(
          eq(clientCommercialPackets.id, packetId),
          eq(clientCommercialPackets.projectId, projectId),
        ),
      )
      .limit(1);
    const packet = rows[0];
    if (!packet) throw notFound();
    const retry = await transaction
      .select({
        id: clientCommercialPacketActions.id,
        action: clientCommercialPacketActions.action,
        comment: clientCommercialPacketActions.comment,
        actedAt: clientCommercialPacketActions.actedAt,
      })
      .from(clientCommercialPacketActions)
      .where(
        and(
          eq(clientCommercialPacketActions.packetId, packetId),
          eq(
            clientCommercialPacketActions.idempotencyKey,
            input.idempotencyKey,
          ),
        ),
      )
      .limit(1);
    if (retry[0]) return retry[0];
    const current = await transaction
      .select({ id: clientCommercialPackets.id })
      .from(clientCommercialPackets)
      .where(
        and(
          eq(clientCommercialPackets.requestId, packet.requestId),
          isNull(clientCommercialPackets.supersededAt),
        ),
      )
      .limit(1);
    const decision = await transaction
      .select({ id: commercialDecisions.id })
      .from(commercialDecisions)
      .where(
        and(
          eq(commercialDecisions.id, packet.decisionId),
          isNull(commercialDecisions.supersededAt),
        ),
      )
      .for("update")
      .limit(1);
    if (packet.supersededAt || current[0]?.id !== packetId || !decision[0]) {
      throw staleVersion("client_packet_stale", current[0]?.id);
    }
    if (
      input.action !== "clarification_requested" &&
      (liveAccess.role !== "approver" || packet.requirement !== "approval")
    ) {
      throw forbidden();
    }
    if (
      packet.requirement === "informational" &&
      input.action !== "clarification_requested"
    ) {
      throw new PlatformError(
        "client_packet_informational",
        409,
        "This packet is informational and does not require approval.",
      );
    }
    const prior = await transaction
      .select({ id: clientCommercialPacketActions.id })
      .from(clientCommercialPacketActions)
      .where(eq(clientCommercialPacketActions.packetId, packetId))
      .limit(1);
    if (prior[0]) {
      throw new PlatformError(
        "client_packet_already_actioned",
        409,
        "Another approver already acted on this packet.",
      );
    }
    const id = randomUUID();
    await transaction.insert(clientCommercialPacketActions).values({
      id,
      projectId,
      packetId,
      participantId: liveAccess.participantId,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      comment: input.comment,
    });
    await notifyInternalManagers(transaction, {
      workspaceId: liveAccess.workspaceId,
      projectId,
      actorUserId: actor.userId,
      actorParticipantId: liveAccess.participantId,
      kind: "packet_actioned",
      requestId: packet.requestId,
      packetId,
      dedupeKey: `packet-action:${id}`,
    });
    await auditClientEvent(
      transaction,
      liveAccess.workspaceId,
      actor.userId,
      "client.packet.actioned.v1",
      "client_commercial_packet_action",
      id,
      { projectId, packetId, action: input.action },
    );
    return {
      id,
      action: input.action,
      comment: input.comment,
      actedAt: new Date(),
    };
  });
}

export async function publishClientAcceptanceTarget(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: PublishClientAcceptanceInput,
) {
  await assertClientManager(getDb(), actor, workspaceId, projectId);
  return getDb().transaction(async (transaction) => {
    await assertClientManager(transaction, actor, workspaceId, projectId);
    await transaction.execute(
      sql`select id from ${clientProjectItems} where id = ${input.projectItemId} and project_id = ${projectId} for update`,
    );
    const items = await transaction
      .select({
        id: clientProjectItems.id,
        target: clientProjectItems.target,
        milestoneId: clientProjectItems.milestoneId,
        scopeItemRevisionId: clientProjectItems.scopeItemRevisionId,
        clientSummary: clientProjectItems.clientSummary,
        hiddenAt: clientProjectItems.hiddenAt,
        milestoneStatus: milestones.status,
        milestoneTargetDate: milestones.targetDate,
        milestoneUpdatedAt: milestones.updatedAt,
        revisionTitle: commercialScopeItemRevisions.title,
      })
      .from(clientProjectItems)
      .leftJoin(milestones, eq(milestones.id, clientProjectItems.milestoneId))
      .leftJoin(
        commercialScopeItemRevisions,
        eq(
          commercialScopeItemRevisions.id,
          clientProjectItems.scopeItemRevisionId,
        ),
      )
      .where(
        and(
          eq(clientProjectItems.id, input.projectItemId),
          eq(clientProjectItems.projectId, projectId),
        ),
      )
      .limit(1);
    const item = items[0];
    if (!item || item.hiddenAt) throw notFound();
    const existing = await transaction
      .select({ id: clientAcceptanceTargets.id })
      .from(clientAcceptanceTargets)
      .where(
        and(
          eq(clientAcceptanceTargets.projectItemId, input.projectItemId),
          eq(clientAcceptanceTargets.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];
    const packetIds = [...new Set(input.packetIds)];
    if (packetIds.length) {
      const packetRows = await transaction
        .select({ id: clientCommercialPackets.id })
        .from(clientCommercialPackets)
        .where(
          and(
            eq(clientCommercialPackets.projectId, projectId),
            inArray(clientCommercialPackets.id, packetIds),
          ),
        );
      if (packetRows.length !== packetIds.length) throw notFound();
    }
    const current = await transaction
      .select({
        id: clientAcceptanceTargets.id,
        version: clientAcceptanceTargets.versionNumber,
      })
      .from(clientAcceptanceTargets)
      .where(
        and(
          eq(clientAcceptanceTargets.projectItemId, input.projectItemId),
          isNull(clientAcceptanceTargets.supersededAt),
        ),
      )
      .limit(1);
    if (current[0]) {
      await transaction
        .update(clientAcceptanceTargets)
        .set({ supersededAt: new Date() })
        .where(eq(clientAcceptanceTargets.id, current[0].id));
    }
    const id = randomUUID();
    const version = (current[0]?.version ?? 0) + 1;
    await transaction.insert(clientAcceptanceTargets).values({
      id,
      projectId,
      projectItemId: input.projectItemId,
      idempotencyKey: input.idempotencyKey,
      versionNumber: version,
      supersedesTargetId: current[0]?.id,
      snapshotTitle: input.snapshotTitle,
      snapshotSummary: input.snapshotSummary,
      snapshotStatus:
        item.target === "milestone" ? item.milestoneStatus : "deliverable",
      snapshotTargetDate:
        item.target === "milestone" ? item.milestoneTargetDate : null,
      milestoneSourceUpdatedAt:
        item.target === "milestone" ? item.milestoneUpdatedAt : null,
      publishedByUserId: actor.userId,
    });
    if (packetIds.length) {
      await transaction.insert(clientAcceptanceTargetPackets).values(
        packetIds.map((packetId) => ({
          acceptanceTargetId: id,
          projectId,
          packetId,
        })),
      );
    }
    await notifyClientParticipants(transaction, {
      workspaceId,
      projectId,
      actorUserId: actor.userId,
      kind: "acceptance_published",
      acceptanceTargetId: id,
      dedupeKey: `acceptance:${id}`,
    });
    await auditClientEvent(
      transaction,
      workspaceId,
      actor.userId,
      "client.acceptance.published.v1",
      "client_acceptance_target",
      id,
      { projectId, projectItemId: input.projectItemId },
    );
    return { id, version };
  });
}

export async function actOnClientAcceptanceTarget(
  actor: UserActor,
  projectId: string,
  targetId: string,
  input: ActOnClientAcceptanceInput,
) {
  const access = await getClientAccess(getDb(), actor, projectId);
  await consumeActionLimit(
    `client-acceptance-action:${access.participantId}`,
    30,
    60 * 60,
  );
  return getDb().transaction(async (transaction) => {
    const liveAccess = await getClientWriteAccess(
      transaction,
      actor,
      projectId,
    );
    if (liveAccess.role !== "approver") throw forbidden();
    const targetSource = await transaction
      .select({
        projectItemId: clientAcceptanceTargets.projectItemId,
        milestoneId: clientProjectItems.milestoneId,
      })
      .from(clientAcceptanceTargets)
      .innerJoin(
        clientProjectItems,
        eq(clientProjectItems.id, clientAcceptanceTargets.projectItemId),
      )
      .where(
        and(
          eq(clientAcceptanceTargets.id, targetId),
          eq(clientAcceptanceTargets.projectId, projectId),
        ),
      )
      .limit(1);
    if (!targetSource[0]) throw notFound();
    await transaction.execute(
      sql`select id from ${clientProjectItems} where id = ${targetSource[0].projectItemId} and project_id = ${projectId} for update`,
    );
    if (targetSource[0].milestoneId) {
      await transaction.execute(
        sql`select id from ${milestones} where id = ${targetSource[0].milestoneId} and project_id = ${projectId} for update`,
      );
    }
    await transaction.execute(
      sql`select id from ${clientAcceptanceTargets} where id = ${targetId} and project_id = ${projectId} for update`,
    );
    const rows = await transaction
      .select({
        id: clientAcceptanceTargets.id,
        projectItemId: clientAcceptanceTargets.projectItemId,
        supersededAt: clientAcceptanceTargets.supersededAt,
        milestoneSourceUpdatedAt:
          clientAcceptanceTargets.milestoneSourceUpdatedAt,
        milestoneId: clientProjectItems.milestoneId,
        hiddenAt: clientProjectItems.hiddenAt,
      })
      .from(clientAcceptanceTargets)
      .innerJoin(
        clientProjectItems,
        eq(clientProjectItems.id, clientAcceptanceTargets.projectItemId),
      )
      .where(
        and(
          eq(clientAcceptanceTargets.id, targetId),
          eq(clientAcceptanceTargets.projectId, projectId),
        ),
      )
      .limit(1);
    const target = rows[0];
    if (!target) throw notFound();
    const retry = await transaction
      .select({
        id: clientAcceptanceActions.id,
        action: clientAcceptanceActions.action,
        comment: clientAcceptanceActions.comment,
        actedAt: clientAcceptanceActions.actedAt,
      })
      .from(clientAcceptanceActions)
      .where(
        and(
          eq(clientAcceptanceActions.acceptanceTargetId, targetId),
          eq(clientAcceptanceActions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (retry[0]) return retry[0];
    const current = await transaction
      .select({ id: clientAcceptanceTargets.id })
      .from(clientAcceptanceTargets)
      .where(
        and(
          eq(clientAcceptanceTargets.projectItemId, target.projectItemId),
          isNull(clientAcceptanceTargets.supersededAt),
        ),
      )
      .limit(1);
    let milestoneFresh = true;
    if (target.milestoneId && target.milestoneSourceUpdatedAt) {
      const source = await transaction
        .select({ updatedAt: milestones.updatedAt })
        .from(milestones)
        .where(
          and(
            eq(milestones.id, target.milestoneId),
            eq(milestones.projectId, projectId),
          ),
        )
        .limit(1);
      milestoneFresh =
        source[0]?.updatedAt.getTime() ===
        target.milestoneSourceUpdatedAt.getTime();
    }
    if (
      target.supersededAt ||
      target.hiddenAt ||
      current[0]?.id !== targetId ||
      !milestoneFresh
    ) {
      throw staleVersion("client_acceptance_stale", current[0]?.id);
    }
    const prior = await transaction
      .select({ id: clientAcceptanceActions.id })
      .from(clientAcceptanceActions)
      .where(eq(clientAcceptanceActions.acceptanceTargetId, targetId))
      .limit(1);
    if (prior[0]) {
      throw new PlatformError(
        "client_acceptance_already_actioned",
        409,
        "Another approver already acted on this acceptance target.",
      );
    }
    const id = randomUUID();
    await transaction.insert(clientAcceptanceActions).values({
      id,
      projectId,
      acceptanceTargetId: targetId,
      participantId: liveAccess.participantId,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      comment: input.comment,
    });
    await notifyInternalManagers(transaction, {
      workspaceId: liveAccess.workspaceId,
      projectId,
      actorUserId: actor.userId,
      actorParticipantId: liveAccess.participantId,
      kind: "acceptance_actioned",
      acceptanceTargetId: targetId,
      dedupeKey: `acceptance-action:${id}`,
    });
    await auditClientEvent(
      transaction,
      liveAccess.workspaceId,
      actor.userId,
      "client.acceptance.actioned.v1",
      "client_acceptance_action",
      id,
      { projectId, acceptanceTargetId: targetId, action: input.action },
    );
    return {
      id,
      action: input.action,
      comment: input.comment,
      actedAt: new Date(),
    };
  });
}

export async function listClientNotifications(
  actor: UserActor,
  page = 1,
  pageSize = 25,
) {
  const rows = await getDb()
    .select({
      id: clientCollaborationNotifications.id,
      projectId: clientCollaborationNotifications.projectId,
      projectName: projects.name,
      kind: clientCollaborationNotifications.kind,
      requestId: clientCollaborationNotifications.requestId,
      packetId: clientCollaborationNotifications.packetId,
      acceptanceTargetId: clientCollaborationNotifications.acceptanceTargetId,
      readAt: clientCollaborationNotifications.readAt,
      emailDeliveryState: clientCollaborationNotifications.emailDeliveryState,
      createdAt: clientCollaborationNotifications.createdAt,
    })
    .from(clientCollaborationNotifications)
    .innerJoin(
      clientProjectParticipants,
      eq(
        clientProjectParticipants.id,
        clientCollaborationNotifications.recipientParticipantId,
      ),
    )
    .innerJoin(
      projects,
      eq(projects.id, clientCollaborationNotifications.projectId),
    )
    .where(
      and(
        eq(clientCollaborationNotifications.recipientUserId, actor.userId),
        isNull(clientProjectParticipants.revokedAt),
      ),
    )
    .orderBy(desc(clientCollaborationNotifications.createdAt))
    .limit(Math.min(pageSize, 100))
    .offset((page - 1) * Math.min(pageSize, 100));
  return rows;
}

export async function listInternalClientNotifications(
  actor: UserActor,
  workspaceId: string,
  page = 1,
  pageSize = 25,
) {
  const access = await getDb()
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, actor.userId),
      ),
    )
    .limit(1);
  if (!access[0]) throw notFound();
  return getDb()
    .select({
      id: clientCollaborationNotifications.id,
      projectId: clientCollaborationNotifications.projectId,
      projectKey: projects.key,
      projectName: projects.name,
      kind: clientCollaborationNotifications.kind,
      actorName: users.name,
      requestId: clientCollaborationNotifications.requestId,
      packetId: clientCollaborationNotifications.packetId,
      acceptanceTargetId: clientCollaborationNotifications.acceptanceTargetId,
      readAt: clientCollaborationNotifications.readAt,
      createdAt: clientCollaborationNotifications.createdAt,
    })
    .from(clientCollaborationNotifications)
    .innerJoin(
      projects,
      eq(projects.id, clientCollaborationNotifications.projectId),
    )
    .leftJoin(users, eq(users.id, clientCollaborationNotifications.actorUserId))
    .where(
      and(
        eq(clientCollaborationNotifications.workspaceId, workspaceId),
        eq(clientCollaborationNotifications.recipientUserId, actor.userId),
        isNull(clientCollaborationNotifications.recipientParticipantId),
      ),
    )
    .orderBy(desc(clientCollaborationNotifications.createdAt))
    .limit(Math.min(pageSize, 100))
    .offset((page - 1) * Math.min(pageSize, 100));
}

export async function markClientNotificationRead(
  actor: UserActor,
  notificationId: string,
  workspaceId?: string,
) {
  const rows = await getDb()
    .update(clientCollaborationNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(clientCollaborationNotifications.id, notificationId),
        eq(clientCollaborationNotifications.recipientUserId, actor.userId),
        workspaceId
          ? eq(clientCollaborationNotifications.workspaceId, workspaceId)
          : undefined,
        or(
          isNull(clientCollaborationNotifications.recipientParticipantId),
          sql`exists (
            select 1
            from ${clientProjectParticipants}
            where ${clientProjectParticipants.id} = ${clientCollaborationNotifications.recipientParticipantId}
              and ${clientProjectParticipants.revokedAt} is null
          )`,
        ),
      ),
    )
    .returning({ id: clientCollaborationNotifications.id });
  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function retryClientNotificationEmail(
  actor: UserActor,
  notificationId: string,
) {
  const rows = await getDb()
    .select({ dedupeKey: clientCollaborationNotifications.dedupeKey })
    .from(clientCollaborationNotifications)
    .leftJoin(
      clientProjectParticipants,
      eq(
        clientProjectParticipants.id,
        clientCollaborationNotifications.recipientParticipantId,
      ),
    )
    .where(
      and(
        eq(clientCollaborationNotifications.id, notificationId),
        eq(clientCollaborationNotifications.recipientUserId, actor.userId),
        eq(clientCollaborationNotifications.emailDeliveryState, "failed"),
        or(
          isNull(clientCollaborationNotifications.recipientParticipantId),
          isNull(clientProjectParticipants.revokedAt),
        ),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  return rows[0];
}

function deriveClientAttention(
  requests: ClientProjectProjection["requests"],
  packets: ClientProjectProjection["packets"],
  acceptanceTargets: ClientProjectProjection["acceptanceTargets"],
) {
  const attention: ClientProjectProjection["attention"] = [];
  for (const request of requests) {
    if (request.needsReply) {
      attention.push({
        kind: "clarification",
        targetId: request.id,
        label: `Reply to ${request.title}`,
      });
    }
  }
  for (const packet of packets) {
    if (packet.actionable && packet.requirement === "approval") {
      attention.push({
        kind: "packet",
        targetId: packet.id,
        label: `Review ${packet.title}`,
      });
    }
  }
  for (const target of acceptanceTargets) {
    if (target.actionable) {
      attention.push({
        kind: "acceptance",
        targetId: target.id,
        label: `Accept ${target.title}`,
      });
    }
  }
  return attention;
}

async function buildClientProjection(
  projectId: string,
  participant: { id: string; role: ClientParticipantRole } | null,
  historyPage: { page: number; pageSize: number },
): Promise<ClientProjectProjection> {
  const db = getDb();
  const historyLimit = historyPage.pageSize + 1;
  const historyOffset = (historyPage.page - 1) * historyPage.pageSize;
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      summary: clientProjectProfiles.summary,
    })
    .from(projects)
    .leftJoin(
      clientProjectProfiles,
      eq(clientProjectProfiles.projectId, projects.id),
    )
    .where(eq(projects.id, projectId))
    .limit(1);
  const project = projectRows[0];
  if (!project) throw notFound();

  const [itemRows, requestRows, packetRows, acceptanceRows, discussionRows] =
    await Promise.all([
      db
        .select({
          id: clientProjectItems.id,
          target: clientProjectItems.target,
          summary: clientProjectItems.clientSummary,
          milestoneTitle: milestones.name,
          milestoneStatus: milestones.status,
          milestoneTargetDate: milestones.targetDate,
          milestoneUpdatedAt: milestones.updatedAt,
          revisionTitle: commercialScopeItemRevisions.title,
        })
        .from(clientProjectItems)
        .leftJoin(milestones, eq(milestones.id, clientProjectItems.milestoneId))
        .leftJoin(
          commercialScopeItemRevisions,
          eq(
            commercialScopeItemRevisions.id,
            clientProjectItems.scopeItemRevisionId,
          ),
        )
        .where(
          and(
            eq(clientProjectItems.projectId, projectId),
            isNull(clientProjectItems.hiddenAt),
          ),
        )
        .orderBy(asc(clientProjectItems.sortOrder), asc(clientProjectItems.id)),
      db
        .select({
          id: commercialRequests.id,
          title: commercialRequests.title,
          requestText: commercialRequests.requestText,
          state: commercialRequests.state,
          receivedAt: commercialRequests.receivedAt,
          participantId: commercialRequests.submittedByClientParticipantId,
        })
        .from(commercialRequests)
        .where(
          and(
            eq(commercialRequests.projectId, projectId),
            sql`${commercialRequests.submittedByClientParticipantId} is not null`,
          ),
        )
        .orderBy(
          desc(commercialRequests.receivedAt),
          desc(commercialRequests.id),
        )
        .limit(historyLimit)
        .offset(historyOffset),
      db
        .select({
          id: clientCommercialPackets.id,
          requestId: clientCommercialPackets.requestId,
          version: clientCommercialPackets.versionNumber,
          supersededAt: clientCommercialPackets.supersededAt,
          disposition: commercialDecisions.disposition,
          decisionSupersededAt: commercialDecisions.supersededAt,
          requirement: clientCommercialPackets.requirement,
          title: clientCommercialPackets.title,
          requestSummary: clientCommercialPackets.requestSummary,
          treatmentSummary: clientCommercialPackets.treatmentSummary,
          scopeSummary: clientCommercialPackets.scopeSummary,
          assumptions: clientCommercialPackets.assumptions,
          scheduleDeltaDays: clientCommercialPackets.scheduleDeltaDays,
          targetDate: clientCommercialPackets.targetDate,
          monetaryAmount: clientCommercialPackets.monetaryAmount,
          currencyCode: clientCommercialPackets.currencyCode,
          publishedAt: clientCommercialPackets.publishedAt,
          action: clientCommercialPacketActions.action,
          actionComment: clientCommercialPacketActions.comment,
          actedAt: clientCommercialPacketActions.actedAt,
        })
        .from(clientCommercialPackets)
        .innerJoin(
          commercialDecisions,
          eq(commercialDecisions.id, clientCommercialPackets.decisionId),
        )
        .leftJoin(
          clientCommercialPacketActions,
          eq(
            clientCommercialPacketActions.packetId,
            clientCommercialPackets.id,
          ),
        )
        .where(eq(clientCommercialPackets.projectId, projectId))
        .orderBy(
          desc(clientCommercialPackets.publishedAt),
          desc(clientCommercialPackets.id),
        )
        .limit(historyLimit)
        .offset(historyOffset),
      db
        .select({
          id: clientAcceptanceTargets.id,
          projectItemId: clientAcceptanceTargets.projectItemId,
          version: clientAcceptanceTargets.versionNumber,
          supersededAt: clientAcceptanceTargets.supersededAt,
          title: clientAcceptanceTargets.snapshotTitle,
          summary: clientAcceptanceTargets.snapshotSummary,
          status: clientAcceptanceTargets.snapshotStatus,
          targetDate: clientAcceptanceTargets.snapshotTargetDate,
          milestoneSourceUpdatedAt:
            clientAcceptanceTargets.milestoneSourceUpdatedAt,
          currentMilestoneUpdatedAt: milestones.updatedAt,
          itemHiddenAt: clientProjectItems.hiddenAt,
          publishedAt: clientAcceptanceTargets.publishedAt,
          action: clientAcceptanceActions.action,
          actionComment: clientAcceptanceActions.comment,
          actedAt: clientAcceptanceActions.actedAt,
        })
        .from(clientAcceptanceTargets)
        .innerJoin(
          clientProjectItems,
          eq(clientProjectItems.id, clientAcceptanceTargets.projectItemId),
        )
        .leftJoin(milestones, eq(milestones.id, clientProjectItems.milestoneId))
        .leftJoin(
          clientAcceptanceActions,
          eq(
            clientAcceptanceActions.acceptanceTargetId,
            clientAcceptanceTargets.id,
          ),
        )
        .where(eq(clientAcceptanceTargets.projectId, projectId))
        .orderBy(
          desc(clientAcceptanceTargets.publishedAt),
          desc(clientAcceptanceTargets.id),
        )
        .limit(historyLimit)
        .offset(historyOffset),
      db
        .select({
          id: clientDiscussionMessages.id,
          target: clientDiscussionMessages.target,
          requestId: clientDiscussionMessages.requestId,
          packetId: clientDiscussionMessages.packetId,
          acceptanceTargetId: clientDiscussionMessages.acceptanceTargetId,
          authorParticipantId: clientDiscussionMessages.authorParticipantId,
          authorName: users.name,
          body: clientDiscussionMessages.body,
          createdAt: clientDiscussionMessages.createdAt,
        })
        .from(clientDiscussionMessages)
        .innerJoin(users, eq(users.id, clientDiscussionMessages.authorUserId))
        .where(eq(clientDiscussionMessages.projectId, projectId))
        .orderBy(
          desc(clientDiscussionMessages.createdAt),
          desc(clientDiscussionMessages.id),
        )
        .limit(historyLimit)
        .offset(historyOffset),
    ]);

  const hasMore = {
    requests: requestRows.length > historyPage.pageSize,
    packets: packetRows.length > historyPage.pageSize,
    acceptanceTargets: acceptanceRows.length > historyPage.pageSize,
    discussion: discussionRows.length > historyPage.pageSize,
  };
  const boundedRequestRows = requestRows.slice(0, historyPage.pageSize);
  const boundedPacketRows = packetRows.slice(0, historyPage.pageSize);
  const boundedAcceptanceRows = acceptanceRows.slice(0, historyPage.pageSize);
  const boundedDiscussionRows = discussionRows
    .slice(0, historyPage.pageSize)
    .reverse();

  const boundedRequestIds = boundedRequestRows.map(({ id }) => id);
  const latestRequestMessageRows = boundedRequestIds.length
    ? await db
        .selectDistinctOn([clientDiscussionMessages.requestId], {
          requestId: clientDiscussionMessages.requestId,
          authorParticipantId: clientDiscussionMessages.authorParticipantId,
        })
        .from(clientDiscussionMessages)
        .where(inArray(clientDiscussionMessages.requestId, boundedRequestIds))
        .orderBy(
          clientDiscussionMessages.requestId,
          desc(clientDiscussionMessages.createdAt),
          desc(clientDiscussionMessages.id),
        )
    : [];
  const latestRequestAuthor = new Map(
    latestRequestMessageRows.map((message) => [
      message.requestId,
      message.authorParticipantId ? ("client" as const) : ("team" as const),
    ]),
  );

  const acceptanceIds = boundedAcceptanceRows.map(({ id }) => id);
  const acceptancePacketRows = acceptanceIds.length
    ? await db
        .select({
          targetId: clientAcceptanceTargetPackets.acceptanceTargetId,
          packetId: clientAcceptanceTargetPackets.packetId,
        })
        .from(clientAcceptanceTargetPackets)
        .where(
          inArray(
            clientAcceptanceTargetPackets.acceptanceTargetId,
            acceptanceIds,
          ),
        )
    : [];
  const packetIdsByAcceptance = new Map<string, string[]>();
  for (const link of acceptancePacketRows) {
    const packetIds = packetIdsByAcceptance.get(link.targetId) ?? [];
    packetIds.push(link.packetId);
    packetIdsByAcceptance.set(link.targetId, packetIds);
  }

  const requests = boundedRequestRows.map((request) => ({
    id: request.id,
    title: request.title,
    requestText: request.requestText,
    state: request.state,
    receivedAt: request.receivedAt.toISOString(),
    submittedByCurrentParticipant: request.participantId === participant?.id,
    needsReply:
      request.state === "needs_clarification" &&
      latestRequestAuthor.get(request.id) === "team",
  }));
  const packets = boundedPacketRows.map((packet) => {
    const current = !packet.supersededAt && !packet.decisionSupersededAt;
    const mayClarify = participant !== null;
    const mayDecide =
      participant?.role === "approver" && packet.requirement === "approval";
    return {
      id: packet.id,
      requestId: packet.requestId,
      version: packet.version,
      current,
      disposition: packet.disposition,
      requirement: packet.requirement,
      title: packet.title,
      requestSummary: packet.requestSummary,
      treatmentSummary: packet.treatmentSummary,
      scopeSummary: packet.scopeSummary,
      assumptions: packet.assumptions,
      scheduleDeltaDays: packet.scheduleDeltaDays,
      targetDate: packet.targetDate,
      monetaryAmount: packet.monetaryAmount,
      currencyCode: packet.currencyCode,
      publishedAt: packet.publishedAt.toISOString(),
      action:
        packet.action && packet.actedAt
          ? {
              action: packet.action,
              comment: packet.actionComment,
              actedAt: packet.actedAt.toISOString(),
            }
          : null,
      actionable: current && !packet.action && (mayClarify || mayDecide),
    };
  });
  const acceptanceTargets = boundedAcceptanceRows.map((target) => {
    const milestoneFresh =
      !target.milestoneSourceUpdatedAt ||
      target.currentMilestoneUpdatedAt?.getTime() ===
        target.milestoneSourceUpdatedAt.getTime();
    const current =
      !target.supersededAt && !target.itemHiddenAt && milestoneFresh;
    return {
      id: target.id,
      projectItemId: target.projectItemId,
      version: target.version,
      current,
      title: target.title,
      summary: target.summary,
      status: target.status,
      targetDate: target.targetDate,
      packetIds: packetIdsByAcceptance.get(target.id) ?? [],
      publishedAt: target.publishedAt.toISOString(),
      action:
        target.action && target.actedAt
          ? {
              action: target.action,
              comment: target.actionComment,
              actedAt: target.actedAt.toISOString(),
            }
          : null,
      actionable: current && participant?.role === "approver" && !target.action,
    };
  });
  const discussion = boundedDiscussionRows.map((message) => ({
    id: message.id,
    target: message.target,
    targetId:
      message.requestId ?? message.packetId ?? message.acceptanceTargetId!,
    author: message.authorParticipantId
      ? ("client" as const)
      : ("team" as const),
    authorName: message.authorName,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  }));
  const attention = deriveClientAttention(requests, packets, acceptanceTargets);
  return {
    project: { id: project.id, name: project.name, summary: project.summary },
    participant,
    items: itemRows.map((item) => ({
      id: item.id,
      target: item.target,
      title: item.milestoneTitle ?? item.revisionTitle ?? "Visible item",
      summary: item.summary,
      status: item.target === "milestone" ? item.milestoneStatus : null,
      targetDate: item.target === "milestone" ? item.milestoneTargetDate : null,
    })),
    requests,
    packets,
    acceptanceTargets,
    discussion,
    attention,
    history: {
      page: historyPage.page,
      pageSize: historyPage.pageSize,
      hasNewer: historyPage.page > 1,
      hasOlder: Object.values(hasMore).some(Boolean),
      hasMore,
    },
  };
}

export async function getClientProjectProjection(
  actor: UserActor,
  projectId: string,
  historyPage = { page: 1, pageSize: 25 },
) {
  const access = await getClientAccess(getDb(), actor, projectId);
  return buildClientProjection(
    projectId,
    {
      id: access.participantId,
      role: access.role,
    },
    historyPage,
  );
}

export async function getClientProjectPreview(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  return buildClientProjection(projectId, null, { page: 1, pageSize: 25 });
}
