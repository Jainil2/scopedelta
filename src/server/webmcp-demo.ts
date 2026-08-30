import "server-only";

import { randomUUID } from "node:crypto";

import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  accounts,
  aiActionExecutions,
  memberships,
  operatorIncidents,
  projects,
  users,
  workspaceExportRuns,
  workspaceLifecycleRequests,
  workspaces,
} from "@/db/schema";
import {
  activateCommercialBaselineVersion,
  createCommercialAmendment,
} from "@/server/commercial-amendments";
import {
  createCommercialBaseline,
  createCommercialBasisLink,
  createCommercialScopeItem,
  createCommercialSource,
  listCommercialDrift,
  listCommercialOverview,
  setCommercialScopeItemArchived,
  updateCommercialScopeItem,
  updateWorkPurpose,
} from "@/server/commercial";
import {
  createClient,
  createCycle,
  createMilestone,
  createProject,
  createWorkItem,
  listMyWork,
} from "@/server/delivery";
import { createWorkspace } from "@/server/workspaces";

export const WEBMCP_DEMO_ENABLE_VALUE = "webmcp-challenge-2026";
export const WEBMCP_DEMO_RESET_CONFIRM_VALUE = "reset-webmcp-judge-demo";
export const WEBMCP_DEMO_WORKSPACE_NAME = "ScopeDelta WebMCP Judge Demo";
export const WEBMCP_DEMO_WORKSPACE_SLUG = "webmcp-judge-demo";
export const WEBMCP_DEMO_PROJECT_KEY = "NOVA";

const DEMO_OWNER_EMAIL = "webmcp-demo-owner@scopedelta.test";
const DEMO_OWNER_NAME = "WebMCP Demo Owner";
const DEMO_JUDGE_NAME = "WebMCP Challenge Judge";
const INCOMPLETE_DEMO_WORKSPACE_SLUG =
  /^scopedelta-webmcp-judge-demo-[0-9a-f]{8}$/;
const demoJudgeEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254)
  .refine((value) => value.endsWith(".test") && value !== DEMO_OWNER_EMAIL);
const BASE_WORK_TITLES = [
  "Deliver weekly order audit export",
  "Implement account-based checkout",
  "Add wholesale discount rules",
  "Investigate checkout analytics gaps",
  "Refresh launch rollback runbook",
] as const;
const DRIFT_STATES = [
  "linked",
  "stale_basis",
  "commercially_unlinked",
  "needs_classification",
  "support_internal",
] as const;

type DemoConfig = {
  judgeEmail: string;
  judgePassword: string;
};

type FixtureIdentities = {
  ownerUserId: string;
  judgeUserId: string;
};

export type WebMcpDemoCommand = "seed" | "verify" | "reset";

export type WebMcpDemoResult = {
  command: WebMcpDemoCommand;
  workspace_slug: typeof WEBMCP_DEMO_WORKSPACE_SLUG;
  project_key: typeof WEBMCP_DEMO_PROJECT_KEY;
  judge_workspace_role: "member";
  judge_is_project_lead: true;
  judge_email_verified: boolean;
  judge_credential_verified: boolean;
  assigned_work_count: number;
  drift_counts: Record<(typeof DRIFT_STATES)[number], number>;
  base_items_present: boolean;
  pristine: boolean;
};

export class WebMcpDemoError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WebMcpDemoError";
  }
}

export function formatWebMcpDemoFailure(error: unknown) {
  return error instanceof WebMcpDemoError
    ? `webmcp_demo_failed:${error.code}`
    : "webmcp_demo_failed:unexpected_error";
}

export function readWebMcpDemoConfig(
  environment: NodeJS.ProcessEnv,
): DemoConfig {
  if (environment.WEBMCP_DEMO_ENABLE !== WEBMCP_DEMO_ENABLE_VALUE) {
    throw demoError(
      "demo_disabled",
      "Set the explicit WebMCP demo enable marker before running this command.",
    );
  }
  const judgeEmailResult = demoJudgeEmailSchema.safeParse(
    environment.WEBMCP_DEMO_JUDGE_EMAIL ?? "",
  );
  if (!judgeEmailResult.success) {
    throw demoError(
      "invalid_judge_email",
      "The judge identity must use a private synthetic .test email address.",
    );
  }
  const judgeEmail = judgeEmailResult.data;
  const judgePassword = environment.WEBMCP_DEMO_JUDGE_PASSWORD ?? "";
  if (judgePassword.length < 16 || judgePassword.length > 128) {
    throw demoError(
      "invalid_judge_password",
      "The private judge password must contain 16 to 128 characters.",
    );
  }
  return { judgeEmail, judgePassword };
}

export async function runWebMcpDemoCommand(
  command: WebMcpDemoCommand,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<WebMcpDemoResult> {
  const config = readWebMcpDemoConfig(environment);
  if ((environment.BETTER_AUTH_SECRET?.trim().length ?? 0) < 32) {
    throw demoError(
      "platform_auth_unconfigured",
      "The existing platform authentication secret must be configured.",
    );
  }
  if (command === "reset") {
    if (
      environment.WEBMCP_DEMO_RESET_CONFIRM !== WEBMCP_DEMO_RESET_CONFIRM_VALUE
    ) {
      throw demoError(
        "reset_not_confirmed",
        "Set the exact WebMCP demo reset confirmation marker.",
      );
    }
    await resetWebMcpDemo(config);
    const result = await seedWebMcpDemo(config);
    return { ...result, command };
  }
  if (command === "seed") {
    const result = await seedWebMcpDemo(config);
    return { ...result, command };
  }
  if (command === "verify") {
    const result = await verifyWebMcpDemo(config);
    return { ...result, command };
  }
  throw demoError("invalid_command", "Use seed, verify, or reset.");
}

async function seedWebMcpDemo(
  config: DemoConfig,
): Promise<Omit<WebMcpDemoResult, "command">> {
  const existing = await findDemoWorkspace();
  if (existing) {
    if (existing.slug === WEBMCP_DEMO_WORKSPACE_SLUG) {
      return requirePristine(await verifyWebMcpDemo(config));
    }
    const identities = await assertIncompleteDemoWorkspaceIsolation(
      existing,
      config,
    );
    await deleteDemoWorkspace(existing.id);
    await assertFixtureUsersHaveNoOtherWorkspace(identities);
  }

  const identities = await ensureFixtureIdentities(config);
  await assertFixtureUsersHaveNoOtherWorkspace(identities);
  const owner = { userId: identities.ownerUserId, email: DEMO_OWNER_EMAIL };
  const workspace = await createWorkspace(owner, {
    name: WEBMCP_DEMO_WORKSPACE_NAME,
  });
  await getDb().insert(memberships).values({
    id: randomUUID(),
    workspaceId: workspace.id,
    userId: identities.judgeUserId,
    role: "member",
  });

  const client = await createClient(owner, workspace.id, {
    name: "Northstar Retail",
    internalReference: "SYNTHETIC-WEBMCP-DEMO",
    summary:
      "Synthetic retail client used only for the WebMCP Challenge judge journey.",
  });
  const project = await createProject(owner, workspace.id, {
    clientId: client.id,
    key: WEBMCP_DEMO_PROJECT_KEY,
    name: "Checkout Recovery",
    summary:
      "Recover a delayed checkout launch while keeping delivery tied to the current commercial basis.",
    leadUserId: identities.judgeUserId,
    startDate: "2026-08-25",
    targetDate: "2026-09-03",
  });
  const milestone = await createMilestone(owner, workspace.id, project.id, {
    name: "September Checkout Launch",
    description:
      "Synthetic launch milestone for the deterministic judge scenario.",
    targetDate: "2026-09-03",
  });
  const cycle = await createCycle(owner, workspace.id, project.id, {
    name: "Judge Demo Cycle",
    startDate: "2026-08-25",
    endDate: "2026-09-03",
    goal: "Resolve commercial drift before the checkout launch.",
  });

  const work = [];
  work.push(
    await createDemoWork(
      owner,
      workspace.id,
      project.id,
      milestone.id,
      cycle.id,
      {
        title: BASE_WORK_TITLES[0],
        status: "in_progress",
        priority: "high",
        purpose: "client_delivery",
        assigneeUserId: identities.judgeUserId,
      },
    ),
  );
  work.push(
    await createDemoWork(
      owner,
      workspace.id,
      project.id,
      milestone.id,
      cycle.id,
      {
        title: BASE_WORK_TITLES[1],
        status: "in_review",
        priority: "high",
        purpose: "client_delivery",
        assigneeUserId: identities.judgeUserId,
      },
    ),
  );
  work.push(
    await createDemoWork(
      owner,
      workspace.id,
      project.id,
      milestone.id,
      cycle.id,
      {
        title: BASE_WORK_TITLES[2],
        status: "ready",
        priority: "urgent",
        purpose: "client_delivery",
        assigneeUserId: identities.judgeUserId,
      },
    ),
  );
  work.push(
    await createDemoWork(
      owner,
      workspace.id,
      project.id,
      milestone.id,
      cycle.id,
      {
        title: BASE_WORK_TITLES[3],
        status: "backlog",
        priority: "medium",
        purpose: "unclassified",
        assigneeUserId: identities.judgeUserId,
      },
    ),
  );
  work.push(
    await createDemoWork(
      owner,
      workspace.id,
      project.id,
      milestone.id,
      cycle.id,
      {
        title: BASE_WORK_TITLES[4],
        status: "ready",
        priority: "low",
        purpose: "delivery_support",
        assigneeUserId: identities.judgeUserId,
      },
    ),
  );

  const baselineText =
    "Northstar Retail will receive an account-based checkout, a weekly order audit export, and legacy guest checkout dashboard support through launch.";
  const baselineSource = await createCommercialSource(
    owner,
    workspace.id,
    project.id,
    {
      idempotencyKey: randomUUID(),
      kind: "pasted_text",
      name: "Synthetic checkout statement of work",
      mediaType: "text/plain",
      contentBase64: Buffer.from(baselineText).toString("base64"),
    },
  );
  const baseline = await createCommercialBaseline(
    owner,
    workspace.id,
    project.id,
    { sourceId: baselineSource.id },
  );
  const accountScope = await createDemoScope(
    owner,
    workspace.id,
    project.id,
    baseline.versionId,
    baselineSource.id,
    baselineText,
    "account-based checkout",
    "Account-based checkout",
  );
  const auditScope = await createDemoScope(
    owner,
    workspace.id,
    project.id,
    baseline.versionId,
    baselineSource.id,
    baselineText,
    "weekly order audit export",
    "Weekly order audit export",
  );
  await createDemoScope(
    owner,
    workspace.id,
    project.id,
    baseline.versionId,
    baselineSource.id,
    baselineText,
    "legacy guest checkout dashboard support",
    "Legacy guest checkout dashboard support",
  );
  await activateCommercialBaselineVersion(
    owner,
    workspace.id,
    project.id,
    baseline.versionId,
    {},
  );
  await createCommercialBasisLink(owner, workspace.id, project.id, work[0].id, {
    scopeItemRevisionId: auditScope.revisionId,
  });
  await createCommercialBasisLink(owner, workspace.id, project.id, work[1].id, {
    scopeItemRevisionId: accountScope.revisionId,
  });

  const amendmentText =
    "The account-based checkout now includes SSO and approval audit history. The weekly order audit export remains unchanged. Legacy guest checkout dashboard support is retired.";
  const amendmentSource = await createCommercialSource(
    owner,
    workspace.id,
    project.id,
    {
      idempotencyKey: randomUUID(),
      kind: "pasted_text",
      name: "Synthetic checkout amendment",
      mediaType: "text/plain",
      contentBase64: Buffer.from(amendmentText).toString("base64"),
    },
  );
  const amendment = await createCommercialAmendment(
    owner,
    workspace.id,
    project.id,
    {
      sourceId: amendmentSource.id,
      label: "SSO and approval-history amendment",
      decisionIds: [],
    },
  );
  const draft = await listCommercialOverview(owner, workspace.id, project.id);
  const accountCopy = requireScopeCopy(
    draft.scopeItems,
    "Account-based checkout",
  );
  const legacyCopy = requireScopeCopy(
    draft.scopeItems,
    "Legacy guest checkout dashboard support",
  );
  await updateCommercialScopeItem(
    owner,
    workspace.id,
    project.id,
    accountCopy.id,
    {
      idempotencyKey: randomUUID(),
      kind: "deliverable",
      title: "Account-based checkout with SSO and approval audit history",
      details: "The current amendment expands the original checkout basis.",
      anchors: [
        anchorFor(
          amendmentSource.id,
          amendmentText,
          "account-based checkout now includes SSO and approval audit history",
          "Revised checkout commitment",
        ),
      ],
    },
  );
  await setCommercialScopeItemArchived(
    owner,
    workspace.id,
    project.id,
    legacyCopy.id,
    true,
  );
  await activateCommercialBaselineVersion(
    owner,
    workspace.id,
    project.id,
    amendment.id,
    {},
  );
  await getDb()
    .update(workspaces)
    .set({ slug: WEBMCP_DEMO_WORKSPACE_SLUG, updatedAt: new Date() })
    .where(eq(workspaces.id, workspace.id));
  return requirePristine(await verifyWebMcpDemo(config));
}

async function verifyWebMcpDemo(
  config: DemoConfig,
): Promise<Omit<WebMcpDemoResult, "command">> {
  const workspace = await findDemoWorkspace();
  if (!workspace) {
    throw demoError("demo_missing", "The WebMCP demo workspace is not seeded.");
  }
  const identities = await loadFixtureIdentities(config);
  await assertDemoWorkspaceIsolation(
    workspace.id,
    config.judgeEmail,
    identities,
  );
  const projectRows = await getDb()
    .select({
      id: projects.id,
      leadUserId: projects.leadUserId,
    })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspace.id),
        eq(projects.key, WEBMCP_DEMO_PROJECT_KEY),
      ),
    )
    .limit(1);
  const project = projectRows[0];
  if (!project || project.leadUserId !== identities.judgeUserId) {
    throw demoError(
      "invalid_demo_project",
      "The reserved demo project is missing or has the wrong project lead.",
    );
  }
  const judge = { userId: identities.judgeUserId, email: config.judgeEmail };
  const assigned = await listMyWork(judge, workspace.id, {
    page: 1,
    pageSize: 100,
    projectKey: WEBMCP_DEMO_PROJECT_KEY,
  });
  const driftPages = [];
  for (const state of DRIFT_STATES) {
    driftPages.push([
      state,
      await listCommercialDrift(judge, workspace.id, project.id, {
        page: 1,
        pageSize: 1,
        state,
      }),
    ] as const);
  }
  const driftCounts = Object.fromEntries(
    driftPages.map(([state, page]) => [state, page.page.total]),
  ) as WebMcpDemoResult["drift_counts"];
  const titles = new Set(assigned.items.map((item) => item.title));
  const baseItemsPresent = BASE_WORK_TITLES.every((title) => titles.has(title));
  const judgeUser = await getDb()
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, identities.judgeUserId))
    .limit(1);
  await assertJudgeCredential(config, identities.judgeUserId);
  const pristine =
    baseItemsPresent &&
    assigned.pageInfo.total === BASE_WORK_TITLES.length &&
    DRIFT_STATES.every((state) => driftCounts[state] === 1);
  return {
    workspace_slug: WEBMCP_DEMO_WORKSPACE_SLUG,
    project_key: WEBMCP_DEMO_PROJECT_KEY,
    judge_workspace_role: "member",
    judge_is_project_lead: true,
    judge_email_verified: judgeUser[0]?.emailVerified === true,
    judge_credential_verified: true,
    assigned_work_count: assigned.pageInfo.total,
    drift_counts: driftCounts,
    base_items_present: baseItemsPresent,
    pristine,
  };
}

async function resetWebMcpDemo(config: DemoConfig) {
  const workspace = await findDemoWorkspace();
  if (!workspace) return;
  const identities =
    workspace.slug === WEBMCP_DEMO_WORKSPACE_SLUG
      ? await loadVerifiedDemoIdentities(config)
      : await assertIncompleteDemoWorkspaceIsolation(workspace, config);
  await deleteDemoWorkspace(workspace.id);
  await assertFixtureUsersHaveNoOtherWorkspace(identities);
}

async function loadVerifiedDemoIdentities(config: DemoConfig) {
  await verifyWebMcpDemo(config);
  return loadFixtureIdentities(config);
}

async function deleteDemoWorkspace(workspaceId: string) {
  await getDb().transaction(async (transaction) => {
    await transaction
      .delete(workspaceLifecycleRequests)
      .where(eq(workspaceLifecycleRequests.workspaceId, workspaceId));
    await transaction
      .delete(workspaceExportRuns)
      .where(eq(workspaceExportRuns.workspaceId, workspaceId));
    await transaction
      .delete(aiActionExecutions)
      .where(eq(aiActionExecutions.workspaceId, workspaceId));
    await transaction.execute(
      sql`lock table audit_events in access exclusive mode`,
    );
    await transaction.execute(
      sql`alter table audit_events disable trigger audit_events_immutable`,
    );
    await transaction.execute(
      sql`delete from audit_events where workspace_id = ${workspaceId}`,
    );
    await transaction.execute(
      sql`alter table audit_events enable trigger audit_events_immutable`,
    );
    await transaction
      .delete(operatorIncidents)
      .where(eq(operatorIncidents.workspaceId, workspaceId));
    await transaction.delete(workspaces).where(eq(workspaces.id, workspaceId));
  });
}

async function ensureFixtureIdentities(config: DemoConfig) {
  const db = getDb();
  const expected = new Map([
    [DEMO_OWNER_EMAIL, DEMO_OWNER_NAME],
    [config.judgeEmail, DEMO_JUDGE_NAME],
  ]);
  const identityRows = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(inArray(users.email, [...expected.keys()]));
  for (const row of identityRows) {
    if (expected.get(row.email) !== row.name) {
      throw demoError(
        "fixture_identity_collision",
        "A reserved WebMCP demo identity collides with an existing user.",
      );
    }
  }
  let ownerUserId = identityRows.find(
    (row) => row.email === DEMO_OWNER_EMAIL,
  )?.id;
  let judgeUserId = identityRows.find(
    (row) => row.email === config.judgeEmail,
  )?.id;
  if (!ownerUserId) {
    ownerUserId = randomUUID();
    await db.insert(users).values({
      id: ownerUserId,
      name: DEMO_OWNER_NAME,
      email: DEMO_OWNER_EMAIL,
      emailVerified: true,
    });
  }
  if (!judgeUserId) {
    judgeUserId = randomUUID();
    await db.insert(users).values({
      id: judgeUserId,
      name: DEMO_JUDGE_NAME,
      email: config.judgeEmail,
      emailVerified: true,
    });
  }
  await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(inArray(users.id, [ownerUserId, judgeUserId]));
  const accountRows = await db
    .select({
      id: accounts.id,
      accountId: accounts.accountId,
      providerId: accounts.providerId,
      userId: accounts.userId,
    })
    .from(accounts)
    .where(
      or(
        eq(accounts.userId, judgeUserId),
        and(
          eq(accounts.providerId, "credential"),
          eq(accounts.accountId, judgeUserId),
        ),
      ),
    );
  if (
    accountRows.length > 1 ||
    accountRows.some(
      (row) =>
        row.accountId !== judgeUserId ||
        row.providerId !== "credential" ||
        row.userId !== judgeUserId,
    )
  ) {
    throw demoError(
      "fixture_account_collision",
      "The reserved WebMCP demo credential collides with an existing account.",
    );
  }
  const password = await hashPassword(config.judgePassword);
  if (accountRows[0]) {
    await db
      .update(accounts)
      .set({ password, updatedAt: new Date() })
      .where(eq(accounts.id, accountRows[0].id));
  } else {
    await db.insert(accounts).values({
      id: randomUUID(),
      accountId: judgeUserId,
      providerId: "credential",
      userId: judgeUserId,
      password,
    });
  }
  return { ownerUserId, judgeUserId };
}

async function loadFixtureIdentities(
  config: DemoConfig,
): Promise<FixtureIdentities> {
  const identityRows = await getDb()
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(inArray(users.email, [DEMO_OWNER_EMAIL, config.judgeEmail]));
  const owner = identityRows.find((row) => row.email === DEMO_OWNER_EMAIL);
  const judge = identityRows.find((row) => row.email === config.judgeEmail);
  if (
    identityRows.length !== 2 ||
    owner?.name !== DEMO_OWNER_NAME ||
    judge?.name !== DEMO_JUDGE_NAME
  ) {
    throw demoError(
      "invalid_fixture_identities",
      "The reserved WebMCP demo identities are missing or changed.",
    );
  }
  const accountRows = await getDb()
    .select({ accountId: accounts.accountId, providerId: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, judge.id));
  if (
    accountRows.length !== 1 ||
    accountRows[0]?.accountId !== judge.id ||
    accountRows[0]?.providerId !== "credential"
  ) {
    throw demoError(
      "fixture_account_collision",
      "The reserved WebMCP demo credential is missing or changed.",
    );
  }
  return { ownerUserId: owner.id, judgeUserId: judge.id };
}

async function assertFixtureUsersHaveNoOtherWorkspace(
  identities: FixtureIdentities,
  allowedWorkspaceId?: string,
) {
  const rows = await getDb()
    .select({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .where(
      inArray(memberships.userId, [
        identities.ownerUserId,
        identities.judgeUserId,
      ]),
    );
  if (rows.some((row) => row.workspaceId !== allowedWorkspaceId)) {
    throw demoError(
      "fixture_identity_not_isolated",
      "A reserved WebMCP demo identity belongs to another workspace.",
    );
  }
}

async function assertDemoWorkspaceIsolation(
  workspaceId: string,
  judgeEmail: string,
  identities: FixtureIdentities,
) {
  const workspace = await getDb()
    .select({ name: workspaces.name, slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (
    workspace[0]?.name !== WEBMCP_DEMO_WORKSPACE_NAME ||
    workspace[0]?.slug !== WEBMCP_DEMO_WORKSPACE_SLUG
  ) {
    throw demoError(
      "invalid_workspace_marker",
      "The reserved demo workspace marker does not match.",
    );
  }
  await assertFixtureUsersHaveNoOtherWorkspace(identities, workspaceId);
  const rows = await getDb()
    .select({
      userId: memberships.userId,
      role: memberships.role,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspaceId));
  if (
    rows.length !== 2 ||
    !rows.some(
      (row) =>
        row.userId === identities.ownerUserId &&
        row.role === "owner" &&
        row.email === DEMO_OWNER_EMAIL,
    ) ||
    !rows.some(
      (row) =>
        row.userId === identities.judgeUserId &&
        row.role === "member" &&
        row.email === judgeEmail,
    )
  ) {
    throw demoError(
      "invalid_workspace_members",
      "The reserved demo workspace contains unexpected members or roles.",
    );
  }
}

async function assertIncompleteDemoWorkspaceIsolation(
  workspace: { id: string; name: string; slug: string },
  config: DemoConfig,
) {
  if (
    workspace.name !== WEBMCP_DEMO_WORKSPACE_NAME ||
    !INCOMPLETE_DEMO_WORKSPACE_SLUG.test(workspace.slug)
  ) {
    throw demoError(
      "invalid_workspace_marker",
      "The incomplete demo workspace marker does not match.",
    );
  }
  const identities = await loadFixtureIdentities(config);
  await assertJudgeCredential(config, identities.judgeUserId);
  await assertFixtureUsersHaveNoOtherWorkspace(identities, workspace.id);
  const rows = await getDb()
    .select({
      userId: memberships.userId,
      role: memberships.role,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspace.id));
  const expectedOwner = (row: (typeof rows)[number]) =>
    row.userId === identities.ownerUserId &&
    row.role === "owner" &&
    row.email === DEMO_OWNER_EMAIL;
  const expectedJudge = (row: (typeof rows)[number]) =>
    row.userId === identities.judgeUserId &&
    row.role === "member" &&
    row.email === config.judgeEmail;
  if (
    rows.length < 1 ||
    rows.length > 2 ||
    rows.filter(expectedOwner).length !== 1 ||
    rows.filter(expectedJudge).length > 1 ||
    rows.some((row) => !expectedOwner(row) && !expectedJudge(row))
  ) {
    throw demoError(
      "invalid_workspace_members",
      "The incomplete demo workspace contains unexpected members or roles.",
    );
  }
  return identities;
}

async function assertJudgeCredential(config: DemoConfig, judgeUserId: string) {
  const judgeAccount = await getDb()
    .select({ password: accounts.password })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, judgeUserId),
        eq(accounts.providerId, "credential"),
      ),
    )
    .limit(1);
  const verified = Boolean(
    judgeAccount[0]?.password &&
    (await verifyPassword({
      hash: judgeAccount[0].password,
      password: config.judgePassword,
    })),
  );
  if (!verified) {
    throw demoError(
      "invalid_judge_credential",
      "The reserved judge credential does not verify.",
    );
  }
}

async function findDemoWorkspace() {
  const rows = await getDb()
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
    .from(workspaces)
    .where(
      or(
        eq(workspaces.slug, WEBMCP_DEMO_WORKSPACE_SLUG),
        eq(workspaces.name, WEBMCP_DEMO_WORKSPACE_NAME),
      ),
    )
    .limit(2);
  if (rows.length > 1) {
    throw demoError(
      "fixture_workspace_collision",
      "The reserved WebMCP demo workspace marker collides with existing workspaces.",
    );
  }
  return rows[0];
}

async function createDemoWork(
  actor: { userId: string; email: string },
  workspaceId: string,
  projectId: string,
  milestoneId: string,
  cycleId: string,
  input: {
    title: string;
    status: "backlog" | "ready" | "in_progress" | "in_review";
    priority: "low" | "medium" | "high" | "urgent";
    assigneeUserId: string;
    purpose:
      "unclassified" | "client_delivery" | "delivery_support" | "internal";
  },
) {
  const work = await createWorkItem(actor, workspaceId, projectId, {
    title: input.title,
    description: "Synthetic work item for the WebMCP Challenge judge journey.",
    acceptanceCriteria:
      "Visible in the ordinary ScopeDelta delivery workspace.",
    status: input.status,
    priority: input.priority,
    assigneeUserId: input.assigneeUserId,
    estimatePoints: 3,
    targetDate: "2026-09-03",
    milestoneId,
    cycleId,
    parentId: null,
    labelIds: [],
  });
  if (input.purpose !== "unclassified") {
    await updateWorkPurpose(actor, workspaceId, projectId, work.id, {
      purpose: input.purpose,
    });
  }
  return work;
}

async function createDemoScope(
  actor: { userId: string; email: string },
  workspaceId: string,
  projectId: string,
  baselineVersionId: string,
  sourceId: string,
  sourceText: string,
  phrase: string,
  title: string,
) {
  return createCommercialScopeItem(actor, workspaceId, projectId, {
    idempotencyKey: randomUUID(),
    revisionIdempotencyKey: randomUUID(),
    baselineVersionId,
    kind: "deliverable",
    title,
    details: null,
    anchors: [anchorFor(sourceId, sourceText, phrase, "Synthetic commitment")],
  });
}

function anchorFor(
  sourceId: string,
  sourceText: string,
  phrase: string,
  label: string,
) {
  const startOffset = sourceText.indexOf(phrase);
  if (startOffset < 0) {
    throw demoError(
      "invalid_demo_anchor",
      "A synthetic commercial evidence phrase is missing.",
    );
  }
  return {
    sourceId,
    startOffset,
    endOffset: startOffset + phrase.length,
    label,
  };
}

function requireScopeCopy(
  items: Array<{ id: string; title: string }>,
  title: string,
) {
  const item = items.find((candidate) => candidate.title === title);
  if (!item) {
    throw demoError(
      "invalid_demo_lineage",
      "The synthetic amendment did not carry the expected scope lineage.",
    );
  }
  return item;
}

function demoError(code: string, message: string) {
  return new WebMcpDemoError(code, message);
}

function requirePristine(
  result: Omit<WebMcpDemoResult, "command">,
): Omit<WebMcpDemoResult, "command"> {
  if (!result.pristine) {
    throw demoError(
      "demo_not_pristine",
      "The reserved demo workspace exists but does not match the pristine fixture.",
    );
  }
  return result;
}
