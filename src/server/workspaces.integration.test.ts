import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, getPool } from "@/db";
import {
  actionRateLimits,
  accounts,
  auditEvents,
  authRateLimits,
  memberships,
  sessions,
  users,
  verifications,
  workspaceInvitations,
  workspaceSettings,
  workspaces,
} from "@/db/schema";
import { PlatformError } from "@/lib/platform-errors";
import {
  acceptWorkspaceInvitation,
  createWorkspace,
  getWorkspaceBySlug,
  inviteWorkspaceMember,
  listWorkspaces,
  removeWorkspaceMember,
  updateWorkspace,
  updateWorkspaceMemberRole,
} from "@/server/workspaces";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/scopedelta_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error(
    "Integration tests require a dedicated scopedelta_test database.",
  );
}

const db = getDb();

describe("workspace domain boundary", () => {
  beforeEach(async () => {
    await db.execute(sql`truncate table ${auditEvents}`);
    await db.delete(workspaceInvitations);
    await db.delete(memberships);
    await db.delete(workspaceSettings);
    await db.delete(workspaces);
    await db.delete(accounts);
    await db.delete(sessions);
    await db.delete(verifications);
    await db.delete(authRateLimits);
    await db.delete(actionRateLimits);
    await db.delete(users);
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("creates a durable owner workspace with human and system audit events", async () => {
    const actor = await createUser("owner@example.test", "Owner");
    const workspace = await createWorkspace(actor, { name: "River Studio" });

    const membershipRows = await db
      .select()
      .from(memberships)
      .where(eq(memberships.workspaceId, workspace.id));
    const eventRows = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, workspace.id));

    expect(membershipRows).toHaveLength(1);
    expect(membershipRows[0]?.role).toBe("owner");
    expect(eventRows.map((event) => event.actorType).sort()).toEqual([
      "human",
      "system",
    ]);
    expect(JSON.stringify(eventRows)).not.toContain(actor.email);
    expect(JSON.stringify(eventRows)).not.toContain("River Studio");
    await expect(
      db.delete(auditEvents).where(eq(auditEvents.id, eventRows[0]!.id)),
    ).rejects.toBeDefined();
    await expect(
      db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.workspaceId, workspace.id)),
    ).resolves.toHaveLength(2);
  });

  it("returns the same not-found boundary for guessed and cross-tenant workspace reads and writes", async () => {
    const owner = await createUser("owner@example.test", "Owner");
    const outsider = await createUser("outsider@example.test", "Outsider");
    const workspace = await createWorkspace(owner, {
      name: "Private Delivery",
    });
    const entitlements = { assertAllowed: vi.fn() };

    await expect(
      getWorkspaceBySlug(outsider, workspace.slug),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<PlatformError>);
    await expect(
      updateWorkspace(
        outsider,
        workspace.id,
        {
          name: "Tampered",
          timezone: "UTC",
        },
        entitlements,
      ),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    expect(entitlements.assertAllowed).not.toHaveBeenCalled();
    await expect(
      getWorkspaceBySlug(outsider, "does-not-exist"),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("blocks member settings writes and preserves the last owner", async () => {
    const owner = await createUser("owner@example.test", "Owner");
    const member = await createUser("member@example.test", "Member");
    const workspace = await createWorkspace(owner, { name: "Role Boundary" });
    const memberId = randomUUID();
    await db.insert(memberships).values({
      id: memberId,
      workspaceId: workspace.id,
      userId: member.userId,
      role: "member",
    });

    await expect(
      updateWorkspace(member, workspace.id, {
        name: "Blocked",
        timezone: "UTC",
      }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });

    const ownerMembership = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, owner.userId));
    await expect(
      removeWorkspaceMember(owner, workspace.id, ownerMembership[0]!.id),
    ).rejects.toMatchObject({ code: "last_owner_required", status: 409 });

    await updateWorkspaceMemberRole(owner, workspace.id, memberId, "owner");
    await expect(
      removeWorkspaceMember(owner, workspace.id, ownerMembership[0]!.id),
    ).resolves.toEqual({ id: ownerMembership[0]!.id });
  });

  it("isolates multi-workspace membership and enforces the admin boundary", async () => {
    const owner = await createUser("owner@example.test", "Owner");
    const admin = await createUser("admin@example.test", "Admin");
    const member = await createUser("member@example.test", "Member");
    const first = await createWorkspace(owner, { name: "First Workspace" });
    await createWorkspace(owner, { name: "Second Workspace" });
    const adminMembershipId = randomUUID();
    const memberMembershipId = randomUUID();
    await db.insert(memberships).values([
      {
        id: adminMembershipId,
        workspaceId: first.id,
        userId: admin.userId,
        role: "admin",
      },
      {
        id: memberMembershipId,
        workspaceId: first.id,
        userId: member.userId,
        role: "member",
      },
    ]);

    await expect(listWorkspaces(owner)).resolves.toHaveLength(2);
    await expect(listWorkspaces(admin)).resolves.toHaveLength(1);
    await expect(
      inviteWorkspaceMember(admin, first.id, {
        email: "new-admin@example.test",
        role: "admin",
      }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      removeWorkspaceMember(admin, first.id, adminMembershipId),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    const ownerMembership = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, owner.userId));
    await expect(
      removeWorkspaceMember(admin, first.id, ownerMembership[0]!.id),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      removeWorkspaceMember(admin, first.id, memberMembershipId),
    ).resolves.toEqual({ id: memberMembershipId });
  });

  it("accepts a hashed invitation only for its verified matching identity", async () => {
    const owner = await createUser("owner@example.test", "Owner");
    const invited = await createUser("invited@example.test", "Invited");
    const mismatch = await createUser("other@example.test", "Other");
    const workspace = await createWorkspace(owner, { name: "Invite Boundary" });
    const invitation = await inviteWorkspaceMember(owner, workspace.id, {
      email: invited.email,
      role: "member",
    });

    const stored = await db
      .select({ tokenHash: workspaceInvitations.tokenHash })
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.id, invitation.id));
    expect(stored[0]?.tokenHash).not.toBe(invitation.delivery.token);
    await expect(
      acceptWorkspaceInvitation(mismatch, invitation.delivery.token),
    ).rejects.toMatchObject({
      code: "invitation_email_mismatch",
      status: 403,
    });
    await expect(
      acceptWorkspaceInvitation(invited, invitation.delivery.token),
    ).resolves.toMatchObject({ workspaceId: workspace.id });
    await expect(listWorkspaces(invited)).resolves.toHaveLength(1);

    const serializedEvents = JSON.stringify(
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.workspaceId, workspace.id)),
    );
    expect(serializedEvents).not.toContain(invited.email);
    expect(serializedEvents).not.toContain(invitation.delivery.token);
  });

  it("serializes concurrent owner demotions so one owner always remains", async () => {
    const firstOwner = await createUser("first@example.test", "First Owner");
    const secondOwner = await createUser("second@example.test", "Second Owner");
    const workspace = await createWorkspace(firstOwner, {
      name: "Concurrent Owners",
    });
    const firstMembership = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, firstOwner.userId));
    const secondMembershipId = randomUUID();
    await db.insert(memberships).values({
      id: secondMembershipId,
      workspaceId: workspace.id,
      userId: secondOwner.userId,
      role: "owner",
    });

    const results = await Promise.allSettled([
      updateWorkspaceMemberRole(
        firstOwner,
        workspace.id,
        firstMembership[0]!.id,
        "member",
      ),
      updateWorkspaceMemberRole(
        secondOwner,
        workspace.id,
        secondMembershipId,
        "member",
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const remainingOwners = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspace.id),
          eq(memberships.role, "owner"),
        ),
      );
    expect(remainingOwners).toHaveLength(1);
  });
});

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
