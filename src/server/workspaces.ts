import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditEvents,
  memberships,
  projectMemberships,
  projects,
  users,
  workspaceDeliveryAvailabilityPeriods,
  workspaceInvitations,
  workspaceSettings,
  workspaces,
  type WorkspaceRole,
  type MembershipStatus,
} from "@/db/schema";
import {
  communityEntitlementPolicy,
  type EntitlementPolicy,
} from "@/lib/entitlements";
import { forbidden, notFound, PlatformError } from "@/lib/platform-errors";
import { consumeActionLimit } from "@/server/action-rate-limit";
import {
  assertInternalMemberCapacity,
  deploymentEntitlementPolicy,
  initializeWorkspaceBillingState,
} from "@/server/billing";
import { recordWorkspaceProductSignal } from "@/server/self-service";

export type UserActor = { userId: string; email: string };

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  role: WorkspaceRole;
};

type CreateWorkspaceInput = { name: string };
type UpdateWorkspaceInput = { name: string; timezone: string };
type InviteMemberInput = { email: string; role: "admin" | "member" };

export async function listWorkspaces(
  actor: UserActor,
): Promise<WorkspaceSummary[]> {
  return getDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      timezone: workspaceSettings.timezone,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .innerJoin(
      workspaceSettings,
      eq(workspaceSettings.workspaceId, workspaces.id),
    )
    .where(
      and(
        eq(memberships.userId, actor.userId),
        eq(memberships.status, "active"),
      ),
    )
    .orderBy(asc(workspaces.name));
}

export async function createWorkspace(
  actor: UserActor,
  input: CreateWorkspaceInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  await entitlements.assertAllowed("workspace.create", {
    userId: actor.userId,
  });
  const db = getDb();
  const workspaceId = randomUUID();
  const settingsId = workspaceId;
  const membershipId = randomUUID();
  const slug = createWorkspaceSlug(input.name);

  await db.transaction(async (transaction) => {
    await transaction.insert(workspaces).values({
      id: workspaceId,
      name: input.name,
      slug,
    });
    await transaction.insert(workspaceSettings).values({
      workspaceId: settingsId,
      timezone: "UTC",
    });
    await initializeWorkspaceBillingState(transaction, workspaceId);
    await transaction.insert(memberships).values({
      id: membershipId,
      workspaceId,
      userId: actor.userId,
      role: "owner",
    });
    await transaction.insert(workspaceDeliveryAvailabilityPeriods).values({
      id: randomUUID(),
      workspaceId,
      weeklyMinutes: 2_400,
      effectiveFrom: "1970-01-05",
      createdByUserId: actor.userId,
    });
    await transaction.insert(auditEvents).values([
      {
        id: randomUUID(),
        workspaceId,
        actorType: "human",
        actorId: actor.userId,
        eventType: "workspace.created.v1",
        targetType: "workspace",
        targetId: workspaceId,
        metadata: {},
      },
      {
        id: randomUUID(),
        workspaceId,
        actorType: "system",
        actorId: null,
        eventType: "workspace.settings.created.v1",
        targetType: "workspace_settings",
        targetId: settingsId,
        metadata: { timezone: "UTC" },
      },
    ]);
    await recordWorkspaceProductSignal(transaction, {
      workspaceId,
      eventType: "workspace_created",
      outcome: "completed",
      subjectId: workspaceId,
    });
    await recordWorkspaceProductSignal(transaction, {
      workspaceId,
      eventType: "onboarding_step_completed",
      outcome: "completed",
      dimension: "workspace_profile",
      subjectId: workspaceId,
    });
  });

  return {
    id: workspaceId,
    name: input.name,
    slug,
    timezone: "UTC",
    role: "owner" as const,
  };
}

export async function getWorkspaceBySlug(actor: UserActor, slug: string) {
  const rows = await getDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      timezone: workspaceSettings.timezone,
      role: memberships.role,
    })
    .from(workspaces)
    .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
    .innerJoin(
      workspaceSettings,
      eq(workspaceSettings.workspaceId, workspaces.id),
    )
    .where(
      and(
        eq(workspaces.slug, slug),
        eq(memberships.userId, actor.userId),
        eq(memberships.status, "active"),
      ),
    )
    .limit(1);

  if (!rows[0]) throw notFound();
  return rows[0];
}

export async function updateWorkspace(
  actor: UserActor,
  workspaceId: string,
  input: UpdateWorkspaceInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const db = getDb();

  return db.transaction(async (transaction) => {
    const access = await transaction
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
    if (!access[0]) throw notFound();
    if (access[0].role === "member") throw forbidden();
    await entitlements.assertAllowed("workspace.settings.update", {
      userId: actor.userId,
      workspaceId,
    });

    const updated = await transaction
      .update(workspaces)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
      });
    if (!updated[0]) throw notFound();

    await transaction
      .update(workspaceSettings)
      .set({ timezone: input.timezone, updatedAt: new Date() })
      .where(eq(workspaceSettings.workspaceId, workspaceId));
    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "workspace.settings.updated.v1",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { changedFields: ["name", "timezone"] },
    });
    await recordWorkspaceProductSignal(transaction, {
      workspaceId,
      eventType: "onboarding_step_completed",
      outcome: "completed",
      dimension: "workspace_profile",
      subjectId: workspaceId,
    });

    return { ...updated[0], timezone: input.timezone, role: access[0].role };
  });
}

export async function listWorkspaceMembers(
  actor: UserActor,
  workspaceId: string,
  filters: {
    page?: number;
    pageSize?: number;
    query?: string;
    role?: WorkspaceRole;
    status?: MembershipStatus;
    invitationPage?: number;
    invitationState?: "pending" | "accepted" | "revoked" | "expired" | "all";
  } = {},
) {
  const db = getDb();
  const access = await getMembership(actor, workspaceId);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? 50, 100));
  const memberConditions = [eq(memberships.workspaceId, workspaceId)];
  if (access.role === "member")
    memberConditions.push(eq(memberships.status, "active"));
  else if (filters.status)
    memberConditions.push(eq(memberships.status, filters.status));
  if (filters.role) memberConditions.push(eq(memberships.role, filters.role));
  if (filters.query) {
    const pattern = `%${filters.query}%`;
    memberConditions.push(
      or(ilike(users.name, pattern), ilike(users.email, pattern))!,
    );
  }
  const [memberRows, memberTotals] = await Promise.all([
    db
      .select({
        id: memberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        status: memberships.status,
        joinedAt: memberships.createdAt,
        suspendedAt: memberships.suspendedAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(...memberConditions))
      .orderBy(asc(users.name), asc(memberships.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(...memberConditions)),
  ]);

  const invitationPage = Math.max(1, filters.invitationPage ?? 1);
  const invitationConditions = [
    eq(workspaceInvitations.workspaceId, workspaceId),
  ];
  if (filters.query)
    invitationConditions.push(
      ilike(workspaceInvitations.email, `%${filters.query}%`),
    );
  const invitationState = filters.invitationState ?? "pending";
  if (invitationState === "expired") {
    invitationConditions.push(
      and(
        eq(workspaceInvitations.state, "pending"),
        sql`${workspaceInvitations.expiresAt} <= now()`,
      )!,
    );
  } else if (invitationState !== "all") {
    invitationConditions.push(eq(workspaceInvitations.state, invitationState));
    if (invitationState === "pending") {
      invitationConditions.push(sql`${workspaceInvitations.expiresAt} > now()`);
    }
  }
  const [invitationRows, invitationTotals] =
    access.role === "member"
      ? [[], [{ total: 0 }]]
      : await Promise.all([
          db
            .select({
              id: workspaceInvitations.id,
              email: workspaceInvitations.email,
              role: workspaceInvitations.role,
              state: workspaceInvitations.state,
              expired: sql<boolean>`${workspaceInvitations.state} = 'pending' and ${workspaceInvitations.expiresAt} <= now()`,
              expiresAt: workspaceInvitations.expiresAt,
              emailDeliveryState: workspaceInvitations.emailDeliveryState,
              emailAttemptCount: workspaceInvitations.emailAttemptCount,
              lastEmailAttemptAt: workspaceInvitations.lastEmailAttemptAt,
              lastEmailErrorCode: workspaceInvitations.lastEmailErrorCode,
            })
            .from(workspaceInvitations)
            .where(and(...invitationConditions))
            .orderBy(
              desc(workspaceInvitations.updatedAt),
              asc(workspaceInvitations.id),
            )
            .limit(pageSize)
            .offset((invitationPage - 1) * pageSize),
          db
            .select({ total: count() })
            .from(workspaceInvitations)
            .where(and(...invitationConditions)),
        ]);

  return {
    role: access.role,
    members: memberRows,
    invitations: invitationRows,
    memberPage: pageResult(page, pageSize, Number(memberTotals[0]?.total ?? 0)),
    invitationPage: pageResult(
      invitationPage,
      pageSize,
      Number(invitationTotals[0]?.total ?? 0),
    ),
  };
}

export async function inviteWorkspaceMember(
  actor: UserActor,
  workspaceId: string,
  input: InviteMemberInput,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const access = await getMembership(actor, workspaceId);
  if (access.role === "member") throw forbidden();
  if (access.role === "admin" && input.role !== "member") throw forbidden();
  await entitlements.assertAllowed("workspace.members.manage", {
    userId: actor.userId,
    workspaceId,
  });
  await consumeActionLimit(
    `invite:${workspaceId}:${actor.userId}`,
    10,
    60 * 60,
  );

  const db = getDb();
  const existingMembership = await db
    .select({ id: memberships.id, status: memberships.status })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        sql`lower(${users.email}) = ${input.email}`,
      ),
    )
    .limit(1);
  if (existingMembership[0]) {
    if (existingMembership[0].status === "suspended") {
      throw new PlatformError(
        "member_access_suspended",
        409,
        "This person already has suspended workspace access. Reactivate them from Members instead of sending an invitation.",
      );
    }
    throw new PlatformError(
      "already_a_member",
      409,
      "This person is already a workspace member.",
      { email: ["This person is already a workspace member."] },
    );
  }

  const workspace = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace[0]) throw notFound();

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitationId = randomUUID();

  const invitation = await db.transaction(async (transaction) => {
    const rows = await transaction
      .insert(workspaceInvitations)
      .values({
        id: invitationId,
        workspaceId,
        email: input.email,
        role: input.role,
        state: "pending",
        tokenHash,
        expiresAt,
        invitedByUserId: actor.userId,
        emailDeliveryState: "pending",
      })
      .onConflictDoUpdate({
        target: [workspaceInvitations.workspaceId, workspaceInvitations.email],
        set: {
          role: input.role,
          state: "pending",
          tokenHash,
          expiresAt,
          invitedByUserId: actor.userId,
          acceptedAt: null,
          revokedAt: null,
          emailDeliveryState: "pending",
          lastEmailErrorCode: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: workspaceInvitations.id });

    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "workspace.invitation.created.v1",
      targetType: "workspace_invitation",
      targetId: rows[0]!.id,
      metadata: { role: input.role },
    });
    return rows[0]!;
  });

  return {
    id: invitation.id,
    email: input.email,
    role: input.role,
    expiresAt,
    delivery: {
      to: input.email,
      workspaceName: workspace[0].name,
      token,
    },
  };
}

export async function verifyInvitationToken(token: string) {
  const invitation = await getDb()
    .select({ id: workspaceInvitations.id })
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.tokenHash, hashToken(token)),
        eq(workspaceInvitations.state, "pending"),
        sql`${workspaceInvitations.expiresAt} > now()`,
      ),
    )
    .limit(1);
  if (!invitation[0]) {
    throw new PlatformError(
      "invitation_invalid",
      400,
      "This invitation is invalid or has expired.",
    );
  }
}

export async function acceptWorkspaceInvitation(
  actor: UserActor,
  token: string,
  entitlements: EntitlementPolicy = deploymentEntitlementPolicy,
) {
  const db = getDb();
  const tokenHash = hashToken(token);

  return db.transaction(async (transaction) => {
    const rows = await transaction
      .select({
        id: workspaceInvitations.id,
        workspaceId: workspaceInvitations.workspaceId,
        email: workspaceInvitations.email,
        role: workspaceInvitations.role,
        slug: workspaces.slug,
      })
      .from(workspaceInvitations)
      .innerJoin(
        workspaces,
        eq(workspaces.id, workspaceInvitations.workspaceId),
      )
      .where(
        and(
          eq(workspaceInvitations.tokenHash, tokenHash),
          eq(workspaceInvitations.state, "pending"),
          sql`${workspaceInvitations.expiresAt} > now()`,
        ),
      )
      .limit(1);
    const invitation = rows[0];
    if (!invitation) {
      throw new PlatformError(
        "invitation_invalid",
        400,
        "This invitation is invalid or has expired.",
      );
    }
    if (invitation.email !== actor.email.trim().toLowerCase()) {
      throw new PlatformError(
        "invitation_email_mismatch",
        403,
        "Sign in with the email address that received this invitation.",
      );
    }
    await entitlements.assertAllowed("workspace.invitation.accept", {
      userId: actor.userId,
      workspaceId: invitation.workspaceId,
    });
    await transaction.execute(
      sql`select ${workspaces.id} from ${workspaces} where ${workspaces.id} = ${invitation.workspaceId} for update`,
    );
    await assertInternalMemberCapacity(transaction, invitation.workspaceId);

    const claimed = await transaction
      .update(workspaceInvitations)
      .set({
        state: "accepted",
        tokenHash: null,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workspaceInvitations.id, invitation.id),
          eq(workspaceInvitations.state, "pending"),
        ),
      )
      .returning({ id: workspaceInvitations.id });
    if (!claimed[0]) {
      throw new PlatformError(
        "invitation_invalid",
        400,
        "This invitation is invalid or has expired.",
      );
    }

    const membership = await transaction
      .insert(memberships)
      .values({
        id: randomUUID(),
        workspaceId: invitation.workspaceId,
        userId: actor.userId,
        role: invitation.role,
      })
      .onConflictDoNothing()
      .returning({ id: memberships.id });
    const membershipId = membership[0]?.id;
    if (!membershipId) {
      throw new PlatformError(
        "already_a_member",
        409,
        "You already belong to this workspace.",
      );
    }

    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      workspaceId: invitation.workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "workspace.invitation.accepted.v1",
      targetType: "membership",
      targetId: membershipId,
      metadata: { role: invitation.role },
    });
    await recordWorkspaceProductSignal(transaction, {
      workspaceId: invitation.workspaceId,
      eventType: "onboarding_step_completed",
      outcome: "completed",
      dimension: "internal_member",
      subjectId: membershipId,
    });
    return { workspaceId: invitation.workspaceId, slug: invitation.slug };
  });
}

export async function updateWorkspaceMemberRole(
  actor: UserActor,
  workspaceId: string,
  membershipId: string,
  nextRole: WorkspaceRole,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const db = getDb();
  return db.transaction(async (transaction) => {
    const actorMembership = await transaction
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
    if (!actorMembership[0]) throw notFound();
    if (actorMembership[0].role !== "owner") throw forbidden();
    await entitlements.assertAllowed("workspace.members.manage", {
      userId: actor.userId,
      workspaceId,
    });
    await transaction
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for("update");

    const target = await transaction
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.id, membershipId),
          eq(memberships.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!target[0]) throw notFound();
    if (target[0].role === "owner" && nextRole !== "owner") {
      await assertAnotherOwner(transaction, workspaceId, membershipId);
    }

    await transaction
      .update(memberships)
      .set({ role: nextRole, updatedAt: new Date() })
      .where(eq(memberships.id, membershipId));
    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "membership.role.updated.v1",
      targetType: "membership",
      targetId: membershipId,
      metadata: { previousRole: target[0].role, role: nextRole },
    });
    return { id: membershipId, role: nextRole };
  });
}

export async function removeWorkspaceMember(
  actor: UserActor,
  workspaceId: string,
  membershipId: string,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  return updateWorkspaceMemberStatus(
    actor,
    workspaceId,
    membershipId,
    "suspended",
    entitlements,
  );
}

export async function updateWorkspaceMemberStatus(
  actor: UserActor,
  workspaceId: string,
  membershipId: string,
  nextStatus: MembershipStatus,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const db = getDb();
  return db.transaction(async (transaction) => {
    const actorMembership = await transaction
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.userId, actor.userId),
          eq(memberships.status, "active"),
        ),
      )
      .limit(1);
    if (!actorMembership[0]) throw notFound();
    await entitlements.assertAllowed("workspace.members.manage", {
      userId: actor.userId,
      workspaceId,
    });
    await transaction
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for("update");

    const target = await transaction
      .select({
        id: memberships.id,
        userId: memberships.userId,
        role: memberships.role,
        status: memberships.status,
      })
      .from(memberships)
      .where(
        and(
          eq(memberships.id, membershipId),
          eq(memberships.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!target[0]) throw notFound();

    const allowed =
      actorMembership[0].role === "owner" ||
      (actorMembership[0].role === "admin" && target[0].role === "member");
    if (!allowed) throw forbidden();
    if (target[0].status === nextStatus) {
      return { id: membershipId, status: nextStatus };
    }
    if (nextStatus === "suspended" && target[0].role === "owner") {
      await assertAnotherOwner(transaction, workspaceId, membershipId);
    }
    if (nextStatus === "suspended") {
      const activeLead = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            eq(projects.leadUserId, target[0].userId),
            eq(projects.lifecycle, "active"),
          ),
        )
        .limit(1);
      if (activeLead[0]) {
        throw new PlatformError(
          "member_leads_active_project",
          409,
          "Reassign this person's active project leadership before suspending access.",
        );
      }
      const now = new Date();
      await transaction
        .delete(projectMemberships)
        .where(
          and(
            eq(projectMemberships.workspaceId, workspaceId),
            eq(projectMemberships.userId, target[0].userId),
          ),
        );
      await transaction
        .update(memberships)
        .set({
          status: "suspended",
          suspendedAt: now,
          suspendedByUserId: actor.userId,
          updatedAt: now,
        })
        .where(eq(memberships.id, membershipId));
    } else {
      await assertInternalMemberCapacity(transaction, workspaceId);
      await transaction
        .update(memberships)
        .set({
          status: "active",
          suspendedAt: null,
          suspendedByUserId: null,
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, membershipId));
    }
    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType:
        nextStatus === "suspended"
          ? "membership.suspended.v1"
          : "membership.reactivated.v1",
      targetType: "membership",
      targetId: membershipId,
      metadata: { previousStatus: target[0].status, status: nextStatus },
    });
    return { id: membershipId, status: nextStatus };
  });
}

export async function revokeWorkspaceInvitation(
  actor: UserActor,
  workspaceId: string,
  invitationId: string,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const access = await getMembership(actor, workspaceId);
  if (access.role === "member") throw forbidden();
  await entitlements.assertAllowed("workspace.members.manage", {
    userId: actor.userId,
    workspaceId,
  });
  const db = getDb();
  const invitation = await db
    .select({ role: workspaceInvitations.role })
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.workspaceId, workspaceId),
        eq(workspaceInvitations.state, "pending"),
      ),
    )
    .limit(1);
  if (!invitation[0]) throw notFound();
  if (access.role === "admin" && invitation[0].role !== "member")
    throw forbidden();

  await db.transaction(async (transaction) => {
    await transaction
      .update(workspaceInvitations)
      .set({
        state: "revoked",
        tokenHash: null,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workspaceInvitations.id, invitationId));
    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "workspace.invitation.revoked.v1",
      targetType: "workspace_invitation",
      targetId: invitationId,
      metadata: { role: invitation[0].role },
    });
  });
  return { id: invitationId };
}

export async function reissueWorkspaceInvitation(
  actor: UserActor,
  workspaceId: string,
  invitationId: string,
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
) {
  const access = await getMembership(actor, workspaceId);
  if (access.role === "member") throw forbidden();
  const invitation = await getDb()
    .select({
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
    })
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.workspaceId, workspaceId),
        inArray(workspaceInvitations.state, ["pending", "revoked"]),
      ),
    )
    .limit(1);
  if (!invitation[0]) throw notFound();
  if (access.role === "admin" && invitation[0].role !== "member") {
    throw forbidden();
  }
  return inviteWorkspaceMember(
    actor,
    workspaceId,
    {
      email: invitation[0].email,
      role: invitation[0].role as "admin" | "member",
    },
    entitlements,
  );
}

export async function recordWorkspaceInvitationEmailResult(
  invitationId: string,
  state: "sent" | "failed",
  errorCode: string | null = null,
) {
  const now = new Date();
  await getDb()
    .update(workspaceInvitations)
    .set({
      emailDeliveryState: state,
      emailAttemptCount: sql`${workspaceInvitations.emailAttemptCount} + 1`,
      lastEmailAttemptAt: now,
      lastEmailErrorCode:
        state === "failed" ? (errorCode ?? "delivery_failed") : null,
      updatedAt: now,
    })
    .where(eq(workspaceInvitations.id, invitationId));
}

async function getMembership(actor: UserActor, workspaceId: string) {
  const rows = await getDb()
    .select({ id: memberships.id, role: memberships.role })
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
  return rows[0];
}

async function assertAnotherOwner(
  transaction: Parameters<
    Parameters<ReturnType<typeof getDb>["transaction"]>[0]
  >[0],
  workspaceId: string,
  excludingMembershipId: string,
) {
  const owners = await transaction
    .select({ total: count() })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.role, "owner"),
        eq(memberships.status, "active"),
        ne(memberships.id, excludingMembershipId),
      ),
    );
  if ((owners[0]?.total ?? 0) < 1) {
    throw new PlatformError(
      "last_owner_required",
      409,
      "Promote another owner before removing or changing the last owner.",
    );
  }
}

function createWorkspaceSlug(name: string) {
  const base =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42) || "workspace";
  return `${base}-${randomBytes(4).toString("hex")}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function pageResult(number: number, size: number, total: number) {
  return { number, size, total, pages: Math.ceil(total / size) };
}
