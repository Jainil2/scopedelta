import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import { and, asc, count, eq, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  actionRateLimits,
  auditEvents,
  memberships,
  users,
  workspaceInvitations,
  workspaceSettings,
  workspaces,
  type WorkspaceRole,
} from "@/db/schema";
import {
  communityEntitlementPolicy,
  type EntitlementPolicy,
} from "@/lib/entitlements";
import { getAuthSecret } from "@/lib/env";
import { forbidden, notFound, PlatformError } from "@/lib/platform-errors";

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
    .where(eq(memberships.userId, actor.userId))
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
    await transaction.insert(memberships).values({
      id: membershipId,
      workspaceId,
      userId: actor.userId,
      role: "owner",
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
    .where(and(eq(workspaces.slug, slug), eq(memberships.userId, actor.userId)))
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

    return { ...updated[0], timezone: input.timezone, role: access[0].role };
  });
}

export async function listWorkspaceMembers(
  actor: UserActor,
  workspaceId: string,
) {
  const db = getDb();
  const access = await getMembership(actor, workspaceId);
  const memberRows = await db
    .select({
      id: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspaceId))
    .orderBy(asc(users.name));

  const invitationRows =
    access.role === "member"
      ? []
      : await db
          .select({
            id: workspaceInvitations.id,
            email: workspaceInvitations.email,
            role: workspaceInvitations.role,
            state: workspaceInvitations.state,
            expiresAt: workspaceInvitations.expiresAt,
          })
          .from(workspaceInvitations)
          .where(
            and(
              eq(workspaceInvitations.workspaceId, workspaceId),
              eq(workspaceInvitations.state, "pending"),
            ),
          )
          .orderBy(asc(workspaceInvitations.email));

  return {
    role: access.role,
    members: memberRows,
    invitations: invitationRows,
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
    .select({ id: memberships.id })
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
    delivery: { to: input.email, workspaceName: workspace[0].name, token },
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
  entitlements: EntitlementPolicy = communityEntitlementPolicy,
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
  const db = getDb();
  return db.transaction(async (transaction) => {
    const actorMembership = await transaction
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.userId, actor.userId),
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

    const allowed =
      actorMembership[0].role === "owner" ||
      (actorMembership[0].role === "admin" && target[0].role === "member");
    if (!allowed) throw forbidden();
    if (target[0].role === "owner") {
      await assertAnotherOwner(transaction, workspaceId, membershipId);
    }

    await transaction
      .delete(memberships)
      .where(eq(memberships.id, membershipId));
    await transaction.insert(auditEvents).values({
      id: randomUUID(),
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "membership.removed.v1",
      targetType: "membership",
      targetId: membershipId,
      metadata: { previousRole: target[0].role },
    });
    return { id: membershipId };
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

async function getMembership(actor: UserActor, workspaceId: string) {
  const rows = await getDb()
    .select({ id: memberships.id, role: memberships.role })
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

async function consumeActionLimit(
  keySource: string,
  maximum: number,
  windowSeconds: number,
) {
  const key = createHmac("sha256", getAuthSecret())
    .update(keySource)
    .digest("hex");
  const result = await getDb().execute<{ count: number }>(sql`
    insert into ${actionRateLimits} (key, count, window_started_at, expires_at)
    values (${key}, 1, now(), now() + (${windowSeconds} * interval '1 second'))
    on conflict (key) do update set
      count = case
        when ${actionRateLimits.expiresAt} <= now() then 1
        else ${actionRateLimits.count} + 1
      end,
      window_started_at = case
        when ${actionRateLimits.expiresAt} <= now() then now()
        else ${actionRateLimits.windowStartedAt}
      end,
      expires_at = case
        when ${actionRateLimits.expiresAt} <= now()
          then now() + (${windowSeconds} * interval '1 second')
        else ${actionRateLimits.expiresAt}
      end
    returning count
  `);
  if (Number(result.rows[0]?.count ?? 0) > maximum) {
    throw new PlatformError(
      "rate_limited",
      429,
      "Too many requests. Try again later.",
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
