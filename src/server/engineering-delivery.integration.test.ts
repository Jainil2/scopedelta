import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb, getPool } from "@/db";
import {
  defects,
  engineeringProviderInstallations,
  engineeringRepositories,
  implementationArtifacts,
  implementationArtifactSnapshots,
  users,
  verificationRecords,
  workImplementationLinks,
} from "@/db/schema";
import { updateWorkPurpose } from "@/server/commercial";
import {
  createClient,
  createProject,
  createWorkItem,
  updateWorkItem,
} from "@/server/delivery";
import {
  createDefect,
  createVerificationRecord,
  disconnectEngineeringRepository,
  getDeliveryEvidenceTrace,
  getEngineeringCoverage,
  linkImplementationEvidence,
  listEngineeringWorkspace,
  setDefectStatus,
  unlinkImplementationEvidence,
  upsertProviderEvidence,
} from "@/server/engineering-delivery";
import type { ProviderPullRequestEvidence } from "@/server/github-provider";
import { createWorkspace } from "@/server/workspaces";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/scopedelta_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error(
    "Integration tests require a dedicated scopedelta_test database.",
  );
}

const db = getDb();

describe("engineering and QA delivery evidence boundary", () => {
  beforeEach(async () => {
    await db.execute(
      sql`truncate table workspaces, users, action_rate_limits cascade`,
    );
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("preserves scoped PR history across close, reopen, force-push, merge, rerun, and replay", async () => {
    const fixture = await createFixture("APP");
    const sameKeyElsewhere = await createFixture("APP", "elsewhere");
    const work = await createWork(fixture, "Provider-linked delivery");
    const otherWork = await createWork(
      sameKeyElsewhere,
      "Same identifier, other tenant",
    );
    const repositoryId = await seedRepository(fixture);
    const started = new Date("2026-08-12T08:00:00.000Z");

    await upsertProviderEvidence(
      repositoryId,
      [evidence({ providerUpdatedAt: started })],
      "integration",
      null,
    );
    await upsertProviderEvidence(
      repositoryId,
      [
        evidence({
          state: "closed",
          checkRollup: "failing",
          providerUpdatedAt: new Date("2026-08-12T08:01:00.000Z"),
        }),
      ],
      "integration",
      null,
    );
    await upsertProviderEvidence(
      repositoryId,
      [
        evidence({
          state: "open",
          headSha: "head-b",
          checkRollup: "pending",
          providerUpdatedAt: new Date("2026-08-12T08:02:00.000Z"),
        }),
      ],
      "integration",
      null,
    );
    const mergedAt = new Date("2026-08-12T08:03:00.000Z");
    await upsertProviderEvidence(
      repositoryId,
      [
        evidence({
          state: "merged",
          headSha: "head-b",
          checkRollup: "failing",
          mergedAt,
          mergeCommitSha: "merge-b",
          providerUpdatedAt: mergedAt,
        }),
      ],
      "integration",
      null,
    );
    await upsertProviderEvidence(
      repositoryId,
      [
        evidence({
          state: "merged",
          headSha: "head-b",
          reviewRollup: "approved",
          approvalsCount: 1,
          checkRollup: "passing",
          mergedAt,
          mergeCommitSha: "merge-b",
          providerUpdatedAt: mergedAt,
        }),
      ],
      "integration",
      null,
    );
    await upsertProviderEvidence(
      repositoryId,
      [evidence({ providerUpdatedAt: started })],
      "integration",
      null,
    );

    const artifactRows = await db
      .select()
      .from(implementationArtifacts)
      .where(eq(implementationArtifacts.repositoryId, repositoryId));
    expect(artifactRows).toHaveLength(1);
    expect(artifactRows[0]).toMatchObject({
      state: "merged",
      headSha: "head-b",
      reviewRollup: "approved",
      checkRollup: "passing",
    });
    await expect(
      db
        .select()
        .from(implementationArtifactSnapshots)
        .where(
          eq(implementationArtifactSnapshots.artifactId, artifactRows[0]!.id),
        ),
    ).resolves.toHaveLength(5);

    const links = await db
      .select()
      .from(workImplementationLinks)
      .where(eq(workImplementationLinks.artifactId, artifactRows[0]!.id));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      projectId: fixture.project.id,
      workItemId: work.id,
      provenance: "provider_key",
    });

    const secondWork = await createWork(fixture, "Manually linked delivery");
    await linkImplementationEvidence(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { workItemId: secondWork.id, artifactId: artifactRows[0]!.id },
    );
    await expect(
      db
        .select()
        .from(workImplementationLinks)
        .where(eq(workImplementationLinks.artifactId, artifactRows[0]!.id)),
    ).resolves.toHaveLength(2);
    await upsertProviderEvidence(
      repositoryId,
      [
        evidence({
          providerArtifactId: "provider-pr-13",
          number: 13,
          title: "APP-1 follow-up implementation",
          providerUpdatedAt: new Date("2026-08-12T08:04:00.000Z"),
        }),
      ],
      "integration",
      null,
    );
    const originalWorkLinks = await db
      .select()
      .from(workImplementationLinks)
      .where(eq(workImplementationLinks.workItemId, work.id));
    expect(originalWorkLinks).toHaveLength(2);
    await expect(
      linkImplementationEvidence(
        sameKeyElsewhere.owner,
        sameKeyElsewhere.workspace.id,
        sameKeyElsewhere.project.id,
        { workItemId: otherWork.id, artifactId: artifactRows[0]!.id },
      ),
    ).rejects.toMatchObject({ code: "not_found" });

    await unlinkImplementationEvidence(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      links[0]!.id,
    );
    await upsertProviderEvidence(
      repositoryId,
      [
        evidence({
          state: "merged",
          headSha: "head-b",
          reviewRollup: "approved",
          approvalsCount: 1,
          checkRollup: "passing",
          mergedAt,
          mergeCommitSha: "merge-b",
          providerUpdatedAt: mergedAt,
        }),
      ],
      "integration",
      null,
    );
    const tombstone = await db
      .select()
      .from(workImplementationLinks)
      .where(eq(workImplementationLinks.id, links[0]!.id));
    expect(tombstone[0]?.removedAt).not.toBeNull();

    await expect(
      db
        .update(implementationArtifactSnapshots)
        .set({ checkRollup: "unknown" })
        .where(
          eq(implementationArtifactSnapshots.artifactId, artifactRows[0]!.id),
        ),
    ).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/immutable/) },
    });

    const snapshotCount = await db
      .select()
      .from(implementationArtifactSnapshots)
      .where(
        eq(implementationArtifactSnapshots.artifactId, artifactRows[0]!.id),
      );
    await disconnectEngineeringRepository(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      repositoryId,
    );
    await expect(
      upsertProviderEvidence(
        repositoryId,
        [evidence({ providerUpdatedAt: new Date() })],
        "integration",
        null,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      db
        .select()
        .from(implementationArtifactSnapshots)
        .where(
          eq(implementationArtifactSnapshots.artifactId, artifactRows[0]!.id),
        ),
    ).resolves.toHaveLength(snapshotCount.length);
  });

  it("supports local QA and defects, detects stale evidence, and rejects cross-project targets", async () => {
    const fixture = await createFixture("LOCAL");
    const other = await createFixture("OTHER");
    const work = await createWork(fixture, "Local-only QA delivery");
    const otherWork = await createWork(other, "Other project work");
    const verification = await createVerificationRecord(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        workItemId: work.id,
        scopeItemRevisionId: null,
        artifactId: null,
        milestoneId: null,
        acceptanceTargetId: null,
        method: "manual",
        category: "Exploratory regression",
        result: "passed",
        referenceUrl: null,
        notes: "Verified the local delivery journey.",
      },
    );
    const defect = await createDefect(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        title: "Keyboard focus is lost",
        description: "Observed during the local regression pass.",
        severity: "high",
        workItemId: work.id,
        scopeItemRevisionId: null,
        commercialRequestId: null,
        commercialDecisionId: null,
        artifactId: null,
        verificationId: verification.id,
        milestoneId: null,
        acceptanceTargetId: null,
      },
    );

    let coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    expect(coverage.summary.unresolvedDefects).toBe(1);
    expect(coverage.summary.missingVerification).toBe(0);
    expect(coverage.summary.missingImplementation).toBe(1);

    await updateWorkItem(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      work.id,
      { description: "The tested delivery content changed." },
    );
    coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    expect(coverage.summary.staleVerification).toBe(1);

    await setDefectStatus(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      defect.id,
      "resolved",
    );
    coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    expect(coverage.summary.unresolvedDefects).toBe(0);
    const defectRows = await db
      .select()
      .from(defects)
      .where(eq(defects.id, defect.id));
    expect(defectRows[0]).toMatchObject({ status: "resolved" });
    expect(defectRows[0]?.resolvedAt).not.toBeNull();

    const trace = await getDeliveryEvidenceTrace(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      work.id,
    );
    expect(trace.verification).toHaveLength(1);
    expect(trace.defects).toHaveLength(1);
    expect(trace.implementation).toHaveLength(0);

    await expect(
      createVerificationRecord(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        {
          workItemId: otherWork.id,
          scopeItemRevisionId: null,
          artifactId: null,
          milestoneId: null,
          acceptanceTargetId: null,
          method: "manual",
          category: "Cross-project evidence",
          result: "passed",
          referenceUrl: null,
          notes: null,
        },
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      listEngineeringWorkspace(
        other.owner,
        fixture.workspace.id,
        fixture.project.id,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      db
        .update(verificationRecords)
        .set({ result: "failed" })
        .where(eq(verificationRecords.id, verification.id)),
    ).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/immutable/) },
    });
  });

  it("keeps done work in evidence readiness without calling it incomplete", async () => {
    const fixture = await createFixture("DONE");
    const missingWork = await createWork(fixture, "Missing delivery evidence");
    const failingWork = await createWork(fixture, "Failing delivery checks");
    const staleWork = await createWork(fixture, "Stale delivery verification");
    const repositoryId = await seedRepository(fixture);

    await upsertProviderEvidence(
      repositoryId,
      [
        evidence({
          providerArtifactId: "done-failing-pr",
          number: 21,
          title: "DONE-2 failing delivery checks",
          headRef: "done-2-failing-checks",
          state: "merged",
          checkRollup: "failing",
          mergedAt: new Date("2026-08-12T09:00:00.000Z"),
          providerUpdatedAt: new Date("2026-08-12T09:00:00.000Z"),
        }),
        evidence({
          providerArtifactId: "done-stale-pr",
          number: 22,
          title: "DONE-3 stale delivery verification",
          headRef: "done-3-stale-verification",
          state: "merged",
          checkRollup: "passing",
          mergedAt: new Date("2026-08-12T09:01:00.000Z"),
          providerUpdatedAt: new Date("2026-08-12T09:01:00.000Z"),
        }),
      ],
      "integration",
      null,
    );
    const staleArtifacts = await db
      .select({ id: implementationArtifacts.id })
      .from(implementationArtifacts)
      .where(eq(implementationArtifacts.providerArtifactId, "done-stale-pr"));
    await createVerificationRecord(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        workItemId: staleWork.id,
        scopeItemRevisionId: null,
        artifactId: staleArtifacts[0]!.id,
        milestoneId: null,
        acceptanceTargetId: null,
        method: "automated_reference",
        category: "Done-work regression",
        result: "passed",
        referenceUrl: null,
        notes: "Evidence matched before the work definition changed.",
      },
    );

    await Promise.all([
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        missingWork.id,
        { status: "done" },
      ),
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        failingWork.id,
        { status: "done" },
      ),
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        staleWork.id,
        { status: "done", description: "Changed after verification." },
      ),
    ]);

    const coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    const gapsFor = (workItemId: string) =>
      coverage.items.find((item) => item.workItemId === workItemId)?.gaps ?? [];

    expect(gapsFor(missingWork.id)).toEqual(
      expect.arrayContaining([
        "missing_implementation",
        "missing_verification",
      ]),
    );
    expect(gapsFor(failingWork.id)).toContain("failing_checks");
    expect(gapsFor(staleWork.id)).toContain("stale_verification");
    for (const work of [missingWork, failingWork, staleWork]) {
      expect(gapsFor(work.id)).not.toContain("incomplete_material_work");
    }
    expect(coverage.summary.incompleteMaterialWork).toBe(0);
  });
});

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture(key: string, suffix = key.toLowerCase()) {
  const owner = await createUser(
    `${suffix}-owner@example.test`,
    `${key} owner`,
  );
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
    summary: null,
    leadUserId: owner.userId,
    startDate: null,
    targetDate: null,
  });
  return { owner, workspace, project };
}

async function createUser(email: string, name: string) {
  const userId = randomUUID();
  await db
    .insert(users)
    .values({ id: userId, email, name, emailVerified: true });
  return { userId, email };
}

async function createWork(fixture: Fixture, title: string) {
  const work = await createWorkItem(
    fixture.owner,
    fixture.workspace.id,
    fixture.project.id,
    {
      title,
      description: "Delivery detail",
      acceptanceCriteria: "Evidence is reconstructable.",
      status: "in_progress",
      priority: "high",
      assigneeUserId: null,
      estimatePoints: 3,
      targetDate: null,
      milestoneId: null,
      parentId: null,
      labelIds: [],
    },
  );
  await updateWorkPurpose(
    fixture.owner,
    fixture.workspace.id,
    fixture.project.id,
    work.id,
    { purpose: "client_delivery" },
  );
  return work;
}

async function seedRepository(fixture: Fixture) {
  const installationId = randomUUID();
  const repositoryId = randomUUID();
  await db.insert(engineeringProviderInstallations).values({
    id: installationId,
    workspaceId: fixture.workspace.id,
    provider: "github",
    providerInstallationId: String(Math.floor(Math.random() * 1_000_000)),
    accountId: randomUUID(),
    accountLogin: "scope-delta-test",
    connectedByUserId: fixture.owner.userId,
  });
  await db.insert(engineeringRepositories).values({
    id: repositoryId,
    workspaceId: fixture.workspace.id,
    projectId: fixture.project.id,
    installationId,
    provider: "github",
    providerRepositoryId: randomUUID(),
    owner: "scope-delta-test",
    name: "delivery",
    fullName: "scope-delta-test/delivery",
    url: "https://github.com/scope-delta-test/delivery",
    defaultBranch: "main",
    private: true,
    connectedByUserId: fixture.owner.userId,
  });
  return repositoryId;
}

function evidence(
  overrides: Partial<ProviderPullRequestEvidence> = {},
): ProviderPullRequestEvidence {
  return {
    providerArtifactId: "provider-pr-12",
    number: 12,
    url: "https://github.com/scope-delta-test/delivery/pull/12",
    title: "APP-1 deliver provider evidence",
    state: "open",
    headRef: "app-1-evidence",
    headSha: "head-a",
    baseBranch: "main",
    authorRef: "123:engineer",
    reviewRollup: "pending",
    approvalsCount: 0,
    changesRequestedCount: 0,
    checkRollup: "pending",
    mergedAt: null,
    mergeCommitSha: null,
    providerUpdatedAt: new Date("2026-08-12T08:00:00.000Z"),
    ...overrides,
  };
}
