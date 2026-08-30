import { randomUUID } from "node:crypto";

import { verifyPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb, getPool } from "@/db";
import {
  accounts,
  memberships,
  projects,
  users,
  workspaces,
} from "@/db/schema";
import { createWorkItem } from "@/server/delivery";
import {
  runWebMcpDemoCommand,
  WEBMCP_DEMO_ENABLE_VALUE,
  WEBMCP_DEMO_RESET_CONFIRM_VALUE,
  WEBMCP_DEMO_WORKSPACE_SLUG,
} from "@/server/webmcp-demo";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/scopedelta_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error(
    "Integration tests require a dedicated scopedelta_test database.",
  );
}

const db = getDb();
const judgeEmail = `webmcp-integration-${randomUUID()}@challenge.test`;
const judgePassword = `integration-${randomUUID()}-password`;
const environment = {
  NODE_ENV: "test",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  WEBMCP_DEMO_ENABLE: WEBMCP_DEMO_ENABLE_VALUE,
  WEBMCP_DEMO_JUDGE_EMAIL: judgeEmail,
  WEBMCP_DEMO_JUDGE_PASSWORD: judgePassword,
} satisfies NodeJS.ProcessEnv;

describe("WebMCP judge demo provisioning", () => {
  beforeEach(async () => {
    await db.execute(sql`
      truncate table
        workspaces,
        users,
        auth_rate_limits,
        action_rate_limits
      cascade
    `);
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("creates a verified normal-member project lead and all five drift states", async () => {
    const result = await runWebMcpDemoCommand("seed", environment);

    expect(result).toMatchObject({
      command: "seed",
      workspace_slug: WEBMCP_DEMO_WORKSPACE_SLUG,
      project_key: "NOVA",
      judge_workspace_role: "member",
      judge_is_project_lead: true,
      judge_email_verified: true,
      judge_credential_verified: true,
      assigned_work_count: 5,
      base_items_present: true,
      pristine: true,
      drift_counts: {
        linked: 1,
        stale_basis: 1,
        commercially_unlinked: 1,
        needs_classification: 1,
        support_internal: 1,
      },
    });

    const judge = await db
      .select({ id: users.id, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, judgeEmail))
      .limit(1);
    const credential = await db
      .select({ password: accounts.password })
      .from(accounts)
      .where(eq(accounts.userId, judge[0]!.id))
      .limit(1);
    const membership = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, judge[0]!.id))
      .limit(1);
    const project = await db
      .select({ leadUserId: projects.leadUserId })
      .from(projects)
      .where(eq(projects.key, "NOVA"))
      .limit(1);

    expect(judge[0]?.emailVerified).toBe(true);
    expect(credential[0]?.password).toBeTruthy();
    expect(
      await verifyPassword({
        hash: credential[0]!.password!,
        password: judgePassword,
      }),
    ).toBe(true);
    expect(membership[0]?.role).toBe("member");
    expect(project[0]?.leadUserId).toBe(judge[0]?.id);
    await expect(
      runWebMcpDemoCommand("verify", {
        ...environment,
        WEBMCP_DEMO_JUDGE_PASSWORD: `wrong-${randomUUID()}-password`,
      }),
    ).rejects.toMatchObject({ code: "invalid_judge_credential" });
  });

  it("is idempotent and reset removes ordinary demo writes before reseeding", async () => {
    const first = await runWebMcpDemoCommand("seed", environment);
    const second = await runWebMcpDemoCommand("seed", environment);
    expect(second).toMatchObject(first);
    expect(
      await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, WEBMCP_DEMO_WORKSPACE_SLUG)),
    ).toHaveLength(1);

    const judge = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, judgeEmail))
      .limit(1);
    const workspace = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, WEBMCP_DEMO_WORKSPACE_SLUG))
      .limit(1);
    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.key, "NOVA"))
      .limit(1);
    await createWorkItem(
      { userId: judge[0]!.id, email: judgeEmail },
      workspace[0]!.id,
      project[0]!.id,
      {
        title: "Confirm wholesale change-order review",
        description: null,
        acceptanceCriteria: null,
        status: "backlog",
        priority: "high",
        assigneeUserId: judge[0]!.id,
        estimatePoints: null,
        targetDate: null,
        milestoneId: null,
        cycleId: null,
        parentId: null,
        labelIds: [],
      },
    );

    const changed = await runWebMcpDemoCommand("verify", environment);
    expect(changed).toMatchObject({
      assigned_work_count: 6,
      pristine: false,
      drift_counts: { needs_classification: 2 },
    });
    await expect(
      runWebMcpDemoCommand("seed", environment),
    ).rejects.toMatchObject({ code: "demo_not_pristine" });

    await expect(
      runWebMcpDemoCommand("reset", environment),
    ).rejects.toMatchObject({ code: "reset_not_confirmed" });

    const reset = await runWebMcpDemoCommand("reset", {
      ...environment,
      WEBMCP_DEMO_RESET_CONFIRM: WEBMCP_DEMO_RESET_CONFIRM_VALUE,
    });
    expect(reset).toMatchObject({
      command: "reset",
      assigned_work_count: 5,
      pristine: true,
      drift_counts: { needs_classification: 1 },
    });
  });

  it("refuses reset when the reserved workspace membership marker is not isolated", async () => {
    await runWebMcpDemoCommand("seed", environment);
    const workspace = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, WEBMCP_DEMO_WORKSPACE_SLUG))
      .limit(1);
    const unexpectedUserId = randomUUID();
    await db.insert(users).values({
      id: unexpectedUserId,
      name: "Unexpected fixture user",
      email: `unexpected-${randomUUID()}@challenge.test`,
      emailVerified: true,
    });
    await db.insert(memberships).values({
      id: randomUUID(),
      workspaceId: workspace[0]!.id,
      userId: unexpectedUserId,
      role: "member",
    });

    await expect(
      runWebMcpDemoCommand("reset", {
        ...environment,
        WEBMCP_DEMO_RESET_CONFIRM: WEBMCP_DEMO_RESET_CONFIRM_VALUE,
      }),
    ).rejects.toMatchObject({ code: "invalid_workspace_members" });
    expect(
      await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, WEBMCP_DEMO_WORKSPACE_SLUG)),
    ).toHaveLength(1);
  });

  it("refuses a reserved fixture identity collision", async () => {
    await db.insert(users).values({
      id: randomUUID(),
      name: "Colliding user",
      email: "webmcp-demo-owner@scopedelta.test",
      emailVerified: true,
    });

    await expect(
      runWebMcpDemoCommand("seed", environment),
    ).rejects.toMatchObject({ code: "fixture_identity_collision" });
    expect(
      await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, WEBMCP_DEMO_WORKSPACE_SLUG)),
    ).toHaveLength(0);
  });

  it("refuses reset when the exact workspace marker changes", async () => {
    await runWebMcpDemoCommand("seed", environment);
    await db
      .update(workspaces)
      .set({ name: "Not the guarded WebMCP fixture" })
      .where(eq(workspaces.slug, WEBMCP_DEMO_WORKSPACE_SLUG));

    await expect(
      runWebMcpDemoCommand("reset", {
        ...environment,
        WEBMCP_DEMO_RESET_CONFIRM: WEBMCP_DEMO_RESET_CONFIRM_VALUE,
      }),
    ).rejects.toMatchObject({ code: "invalid_workspace_marker" });
    expect(
      await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, WEBMCP_DEMO_WORKSPACE_SLUG)),
    ).toHaveLength(1);
  });
});
