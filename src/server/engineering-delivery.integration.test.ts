import { generateKeyPairSync, randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, getPool } from "@/db";
import {
  clientAcceptanceActions,
  clientAcceptanceTargets,
  clientProjectItems,
  clientProjectParticipants,
  commercialDecisions,
  commercialRequests,
  defects,
  engineeringProviderInstallations,
  engineeringRepositories,
  implementationArtifacts,
  implementationArtifactSnapshots,
  milestones,
  users,
  verificationRecords,
  workImplementationLinks,
} from "@/db/schema";
import type { CreateDefectInput } from "@/lib/engineering-validation";
import {
  createCommercialBaseline,
  createCommercialBasisLink,
  createCommercialScopeItem,
  createCommercialSource,
  updateWorkPurpose,
} from "@/server/commercial";
import { activateCommercialBaselineVersion } from "@/server/commercial-amendments";
import {
  createClient,
  createProject,
  createWorkItem,
  updateWorkItem,
} from "@/server/delivery";
import {
  completeGitHubRepositoryInstallation,
  createDefect,
  createVerificationRecord,
  disconnectEngineeringRepository,
  getDeliveryEvidenceTrace,
  getEngineeringCoverage,
  linkImplementationEvidence,
  listEngineeringWorkspace,
  processGitHubWebhookDelivery,
  setDefectStatus,
  unlinkImplementationEvidence,
  upsertProviderEvidence,
} from "@/server/engineering-delivery";
import type { ProviderPullRequestEvidence } from "@/server/github-provider";
import { createGitHubInstallationState } from "@/server/github-installation-state";
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
    const manualLink = await linkImplementationEvidence(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { workItemId: secondWork.id, artifactId: artifactRows[0]!.id },
    );
    const repeatedManualLink = await linkImplementationEvidence(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { workItemId: secondWork.id, artifactId: artifactRows[0]!.id },
    );
    expect(repeatedManualLink.id).toBe(manualLink.id);
    await expect(
      db
        .select({ id: workImplementationLinks.id })
        .from(workImplementationLinks)
        .where(eq(workImplementationLinks.id, repeatedManualLink.id)),
    ).resolves.toEqual([{ id: manualLink.id }]);
    await unlinkImplementationEvidence(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      repeatedManualLink.id,
    );
    const restoredManualLink = await linkImplementationEvidence(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { workItemId: secondWork.id, artifactId: artifactRows[0]!.id },
    );
    expect(restoredManualLink.id).toBe(manualLink.id);
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
    expect(trace.verification[0]).toMatchObject({ stale: true });
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

  it("associates scope, milestone, and acceptance verification with affected work", async () => {
    const fixture = await createFixture("TARGETQA");
    const scopeWork = await createWork(fixture, "Scope-targeted QA");
    const milestoneWork = await createWork(fixture, "Milestone-targeted QA");
    const acceptanceWork = await createWork(fixture, "Acceptance-targeted QA");
    const scopeItem = await createDraftScopeItem(
      fixture,
      "Verified scope deliverable",
    );
    await activateCommercialBaselineVersion(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      scopeItem.baselineVersionId,
      {},
    );
    await createCommercialBasisLink(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      scopeWork.id,
      { scopeItemRevisionId: scopeItem.revisionId },
    );
    const milestoneId = randomUUID();
    const acceptanceMilestoneId = randomUUID();
    await db.insert(milestones).values([
      {
        id: milestoneId,
        projectId: fixture.project.id,
        name: "QA milestone",
      },
      {
        id: acceptanceMilestoneId,
        projectId: fixture.project.id,
        name: "Acceptance QA milestone",
      },
    ]);
    await Promise.all([
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        milestoneWork.id,
        { milestoneId },
      ),
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        acceptanceWork.id,
        { milestoneId: acceptanceMilestoneId },
      ),
    ]);
    const acceptanceItemId = randomUUID();
    const acceptanceTargetId = randomUUID();
    await db.insert(clientProjectItems).values({
      id: acceptanceItemId,
      projectId: fixture.project.id,
      idempotencyKey: randomUUID(),
      target: "milestone",
      milestoneId: acceptanceMilestoneId,
      clientSummary: "Acceptance QA milestone",
      createdByUserId: fixture.owner.userId,
    });
    await db.insert(clientAcceptanceTargets).values({
      id: acceptanceTargetId,
      projectId: fixture.project.id,
      projectItemId: acceptanceItemId,
      idempotencyKey: randomUUID(),
      versionNumber: 1,
      snapshotTitle: "Acceptance QA milestone",
      snapshotSummary: "QA evidence target",
      snapshotStatus: "in_progress",
      publishedByUserId: fixture.owner.userId,
    });
    const targets = [
      {
        work: scopeWork,
        input: {
          workItemId: null,
          scopeItemRevisionId: scopeItem.revisionId,
          artifactId: null,
          milestoneId: null,
          acceptanceTargetId: null,
        },
      },
      {
        work: milestoneWork,
        input: {
          workItemId: null,
          scopeItemRevisionId: null,
          artifactId: null,
          milestoneId,
          acceptanceTargetId: null,
        },
      },
      {
        work: acceptanceWork,
        input: {
          workItemId: null,
          scopeItemRevisionId: null,
          artifactId: null,
          milestoneId: null,
          acceptanceTargetId,
        },
      },
    ];
    const verificationIds: string[] = [];
    for (const target of targets) {
      const record = await createVerificationRecord(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        {
          ...target.input,
          method: "manual",
          category: "Targeted delivery verification",
          result: "passed",
          referenceUrl: null,
          notes: null,
        },
      );
      verificationIds.push(record.id);
    }

    const coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    for (const [index, target] of targets.entries()) {
      expect(
        coverage.items.find((item) => item.workItemId === target.work.id)?.gaps,
      ).not.toContain("missing_verification");
      const trace = await getDeliveryEvidenceTrace(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        target.work.id,
      );
      expect(trace.verification).toContainEqual(
        expect.objectContaining({ id: verificationIds[index], stale: false }),
      );
    }

    const storedFingerprints = await db
      .select({
        id: verificationRecords.id,
        subjectFingerprint: verificationRecords.subjectFingerprint,
      })
      .from(verificationRecords);
    for (const verificationId of verificationIds) {
      expect(
        storedFingerprints.find((record) => record.id === verificationId)
          ?.subjectFingerprint,
      ).toMatch(/^work-set-v1:/);
    }

    const repositoryId = await seedRepository(fixture);
    await upsertProviderEvidence(
      repositoryId,
      [
        evidence({
          providerArtifactId: "contextual-overview-pr",
          number: 20,
          title: `TARGETQA-${scopeWork.number} contextual implementation`,
          headRef: `targetqa-${scopeWork.number}-contextual-implementation`,
        }),
      ],
      "integration",
      null,
    );
    let engineeringWorkspace = await listEngineeringWorkspace(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
    );
    expect(engineeringWorkspace.verifications).toContainEqual(
      expect.objectContaining({ id: verificationIds[0], stale: true }),
    );
    for (const verificationId of verificationIds.slice(1)) {
      expect(engineeringWorkspace.verifications).toContainEqual(
        expect.objectContaining({ id: verificationId, stale: false }),
      );
    }

    await Promise.all(
      targets.map((target, index) =>
        updateWorkItem(
          fixture.owner,
          fixture.workspace.id,
          fixture.project.id,
          target.work.id,
          { description: `Changed contextual definition ${index + 1}.` },
        ),
      ),
    );
    const staleCoverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    for (const [index, target] of targets.entries()) {
      expect(
        staleCoverage.items.find((item) => item.workItemId === target.work.id)
          ?.gaps,
      ).toEqual(
        expect.arrayContaining(["missing_verification", "stale_verification"]),
      );
      const trace = await getDeliveryEvidenceTrace(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        target.work.id,
      );
      expect(trace.verification).toContainEqual(
        expect.objectContaining({ id: verificationIds[index], stale: true }),
      );
    }
    engineeringWorkspace = await listEngineeringWorkspace(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
    );
    for (const verificationId of verificationIds) {
      expect(engineeringWorkspace.verifications).toContainEqual(
        expect.objectContaining({ id: verificationId, stale: true }),
      );
    }
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

  it("attributes artifact and verification defects to their affected work", async () => {
    const fixture = await createFixture("INDIRECT");
    const work = await createWork(fixture, "Indirect defect delivery");
    const repositoryId = await seedRepository(fixture);
    await upsertProviderEvidence(
      repositoryId,
      [
        evidence({
          providerArtifactId: "indirect-defect-pr",
          number: 31,
          title: "INDIRECT-1 implementation",
          headRef: "indirect-1-implementation",
        }),
      ],
      "integration",
      null,
    );
    const artifactRows = await db
      .select({ id: implementationArtifacts.id })
      .from(implementationArtifacts)
      .where(
        eq(implementationArtifacts.providerArtifactId, "indirect-defect-pr"),
      );
    const artifactId = artifactRows[0]!.id;
    const verification = await createVerificationRecord(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        workItemId: null,
        scopeItemRevisionId: null,
        artifactId,
        milestoneId: null,
        acceptanceTargetId: null,
        method: "automated_reference",
        category: "Artifact regression",
        result: "failed",
        referenceUrl: null,
        notes: null,
      },
    );
    const artifactDefect = await createDefect(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        title: "Artifact-only defect",
        description: null,
        severity: "high",
        workItemId: null,
        scopeItemRevisionId: null,
        commercialRequestId: null,
        commercialDecisionId: null,
        artifactId,
        verificationId: null,
        milestoneId: null,
        acceptanceTargetId: null,
      },
    );
    const verificationDefect = await createDefect(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        title: "Verification-only defect",
        description: null,
        severity: "critical",
        workItemId: null,
        scopeItemRevisionId: null,
        commercialRequestId: null,
        commercialDecisionId: null,
        artifactId: null,
        verificationId: verification.id,
        milestoneId: null,
        acceptanceTargetId: null,
      },
    );
    const projectDefect = await createDefect(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        title: "Project-level release blocker",
        description: null,
        severity: "critical",
        workItemId: null,
        scopeItemRevisionId: null,
        commercialRequestId: null,
        commercialDecisionId: null,
        artifactId: null,
        verificationId: null,
        milestoneId: null,
        acceptanceTargetId: null,
      },
    );

    const coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    expect(
      coverage.items.find((item) => item.workItemId === work.id)?.gaps,
    ).toContain("unresolved_defect");
    expect(coverage.summary.unresolvedDefects).toBe(3);
    expect(coverage.items).toContainEqual(
      expect.objectContaining({
        identifier: `DEF-${projectDefect.number}`,
        title: "Project-level release blocker",
        gaps: ["unresolved_defect"],
      }),
    );

    const trace = await getDeliveryEvidenceTrace(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      work.id,
    );
    expect(trace.defects.map((item) => item.id)).toEqual(
      expect.arrayContaining([artifactDefect.id, verificationDefect.id]),
    );
    expect(trace.verification).toContainEqual(
      expect.objectContaining({
        id: verification.id,
        result: "failed",
      }),
    );
  });

  it("maps every direct defect context to affected work and preserves standalone defects", async () => {
    const fixture = await createFixture("CONTEXTDEF");
    const work = await createWork(fixture, "Contextual defect delivery");
    const scopeItem = await createDraftScopeItem(
      fixture,
      "Contextual defect scope",
    );
    await activateCommercialBaselineVersion(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      scopeItem.baselineVersionId,
      {},
    );
    await createCommercialBasisLink(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      work.id,
      { scopeItemRevisionId: scopeItem.revisionId },
    );

    const milestoneId = randomUUID();
    await db.insert(milestones).values({
      id: milestoneId,
      projectId: fixture.project.id,
      name: "Contextual defect milestone",
    });
    await updateWorkItem(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      work.id,
      { milestoneId },
    );
    const acceptanceItemId = randomUUID();
    const acceptanceTargetId = randomUUID();
    await db.insert(clientProjectItems).values({
      id: acceptanceItemId,
      projectId: fixture.project.id,
      idempotencyKey: randomUUID(),
      target: "milestone",
      milestoneId,
      clientSummary: "Contextual defect acceptance",
      createdByUserId: fixture.owner.userId,
    });
    await db.insert(clientAcceptanceTargets).values({
      id: acceptanceTargetId,
      projectId: fixture.project.id,
      projectItemId: acceptanceItemId,
      idempotencyKey: randomUUID(),
      versionNumber: 1,
      snapshotTitle: "Contextual defect acceptance",
      snapshotSummary: "Acceptance defect context",
      snapshotStatus: "in_progress",
      publishedByUserId: fixture.owner.userId,
    });

    const requestId = randomUUID();
    const decisionId = randomUUID();
    await db.insert(commercialRequests).values({
      id: requestId,
      projectId: fixture.project.id,
      idempotencyKey: randomUUID(),
      title: "Contextual commercial request",
      requestText: "Trace request defects to delivery work.",
      receivedAt: new Date("2026-08-13T08:00:00.000Z"),
      createdByUserId: fixture.owner.userId,
    });
    await db.insert(commercialDecisions).values({
      id: decisionId,
      projectId: fixture.project.id,
      requestId,
      idempotencyKey: randomUUID(),
      disposition: "covered",
      coverageBasis: "baseline",
      rationale: "Existing delivery obligation.",
      confirmedAt: new Date("2026-08-13T08:01:00.000Z"),
      createdByUserId: fixture.owner.userId,
    });
    await createCommercialBasisLink(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      work.id,
      { basisType: "commercial_decision", decisionId },
    );

    const baseDefect: Omit<CreateDefectInput, "title"> = {
      description: null,
      severity: "high",
      workItemId: null,
      scopeItemRevisionId: null,
      commercialRequestId: null,
      commercialDecisionId: null,
      artifactId: null,
      verificationId: null,
      milestoneId: null,
      acceptanceTargetId: null,
    };
    const contextualDefects = await Promise.all([
      createDefect(fixture.owner, fixture.workspace.id, fixture.project.id, {
        ...baseDefect,
        title: "Scope revision defect",
        scopeItemRevisionId: scopeItem.revisionId,
      }),
      createDefect(fixture.owner, fixture.workspace.id, fixture.project.id, {
        ...baseDefect,
        title: "Milestone defect",
        milestoneId,
      }),
      createDefect(fixture.owner, fixture.workspace.id, fixture.project.id, {
        ...baseDefect,
        title: "Acceptance target defect",
        acceptanceTargetId,
      }),
      createDefect(fixture.owner, fixture.workspace.id, fixture.project.id, {
        ...baseDefect,
        title: "Commercial decision defect",
        commercialDecisionId: decisionId,
      }),
      createDefect(fixture.owner, fixture.workspace.id, fixture.project.id, {
        ...baseDefect,
        title: "Commercial request defect",
        commercialRequestId: requestId,
      }),
    ]);
    const standaloneDefect = await createDefect(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { ...baseDefect, title: "Standalone project defect" },
    );

    const coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    expect(coverage.summary.unresolvedDefects).toBe(6);
    expect(
      coverage.items.find((item) => item.workItemId === work.id)?.gaps,
    ).toContain("unresolved_defect");
    expect(coverage.items).toContainEqual(
      expect.objectContaining({
        identifier: `DEF-${standaloneDefect.number}`,
        title: "Standalone project defect",
      }),
    );

    const milestoneCoverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50, milestoneId },
    );
    expect(milestoneCoverage.summary.unresolvedDefects).toBe(5);
    expect(
      milestoneCoverage.items.some(
        (item) => item.identifier === `DEF-${standaloneDefect.number}`,
      ),
    ).toBe(false);

    const trace = await getDeliveryEvidenceTrace(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      work.id,
    );
    expect(trace.defects.map((defect) => defect.id)).toEqual(
      expect.arrayContaining(contextualDefects.map((defect) => defect.id)),
    );
    expect(trace.defects.map((defect) => defect.id)).not.toContain(
      standaloneDefect.id,
    );
  });

  it("requires QA evidence for the current linked implementation set", async () => {
    const fixture = await createFixture("MULTI");
    const work = await createWork(fixture, "Multiple implementation PRs");
    const repositoryId = await seedRepository(fixture);
    await upsertProviderEvidence(
      repositoryId,
      [
        evidence({
          providerArtifactId: "multi-pr-a",
          number: 41,
          title: "MULTI-1 implementation A",
          headRef: "multi-1-a",
          headSha: "multi-head-a",
        }),
        evidence({
          providerArtifactId: "multi-pr-b",
          number: 42,
          title: "MULTI-1 implementation B",
          headRef: "multi-1-b",
          headSha: "multi-head-b",
        }),
      ],
      "integration",
      null,
    );
    const artifacts = await db
      .select({
        id: implementationArtifacts.id,
        providerArtifactId: implementationArtifacts.providerArtifactId,
      })
      .from(implementationArtifacts)
      .where(eq(implementationArtifacts.projectId, fixture.project.id));
    const artifactA = artifacts.find(
      (artifact) => artifact.providerArtifactId === "multi-pr-a",
    )!;
    const artifactVerification = await createVerificationRecord(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        workItemId: null,
        scopeItemRevisionId: null,
        artifactId: artifactA.id,
        milestoneId: null,
        acceptanceTargetId: null,
        method: "automated_reference",
        category: "PR A checks",
        result: "passed",
        referenceUrl: null,
        notes: null,
      },
    );

    let coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    expect(
      coverage.items.find((item) => item.workItemId === work.id)?.gaps,
    ).toContain("missing_verification");
    let trace = await getDeliveryEvidenceTrace(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      work.id,
    );
    expect(trace.verification).toContainEqual(
      expect.objectContaining({
        id: artifactVerification.id,
        result: "passed",
      }),
    );

    const workVerification = await createVerificationRecord(
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
        category: "Whole implementation set",
        result: "passed",
        referenceUrl: null,
        notes: null,
      },
    );
    coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    expect(
      coverage.items.find((item) => item.workItemId === work.id)?.gaps,
    ).not.toContain("missing_verification");

    await upsertProviderEvidence(
      repositoryId,
      [
        evidence({
          providerArtifactId: "multi-pr-c",
          number: 43,
          title: "MULTI-1 implementation C",
          headRef: "multi-1-c",
          headSha: "multi-head-c",
          providerUpdatedAt: new Date("2026-08-12T11:00:00.000Z"),
        }),
      ],
      "integration",
      null,
    );
    coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    const gaps =
      coverage.items.find((item) => item.workItemId === work.id)?.gaps ?? [];
    expect(gaps).toEqual(
      expect.arrayContaining(["missing_verification", "stale_verification"]),
    );
    trace = await getDeliveryEvidenceTrace(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      work.id,
    );
    expect(trace.verification).toContainEqual(
      expect.objectContaining({
        id: workVerification.id,
        category: "Whole implementation set",
        stale: true,
      }),
    );
    const engineeringWorkspace = await listEngineeringWorkspace(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
    );
    expect(engineeringWorkspace.verifications).toContainEqual(
      expect.objectContaining({
        id: workVerification.id,
        stale: true,
      }),
    );
  });

  it("counts deliverable acceptance and invalidates accepted milestones after edits", async () => {
    const fixture = await createFixture("ACCEPT");
    const work = await createWork(fixture, "Accepted milestone delivery");
    const secondWork = await createWork(
      fixture,
      "Second accepted milestone delivery",
    );
    const milestoneId = randomUUID();
    const milestoneSourceUpdatedAt = new Date("2026-08-12T10:00:00.000Z");
    await db.insert(milestones).values({
      id: milestoneId,
      projectId: fixture.project.id,
      name: "Release candidate",
      updatedAt: milestoneSourceUpdatedAt,
    });
    await Promise.all(
      [work, secondWork].map((item) =>
        updateWorkItem(
          fixture.owner,
          fixture.workspace.id,
          fixture.project.id,
          item.id,
          { milestoneId },
        ),
      ),
    );
    const deliverable = await createDraftScopeItem(
      fixture,
      "Client projected deliverable",
    );
    const participantId = randomUUID();
    await db.insert(clientProjectParticipants).values({
      id: participantId,
      projectId: fixture.project.id,
      userId: fixture.owner.userId,
      invitedEmail: fixture.owner.email,
      role: "approver",
      createdByUserId: fixture.owner.userId,
    });
    const milestoneItemId = randomUUID();
    const deliverableItemId = randomUUID();
    await db.insert(clientProjectItems).values([
      {
        id: milestoneItemId,
        projectId: fixture.project.id,
        idempotencyKey: randomUUID(),
        target: "milestone",
        milestoneId,
        clientSummary: "Release candidate",
        createdByUserId: fixture.owner.userId,
      },
      {
        id: deliverableItemId,
        projectId: fixture.project.id,
        idempotencyKey: randomUUID(),
        target: "deliverable",
        scopeItemRevisionId: deliverable.revisionId,
        clientSummary: "Client projected deliverable",
        createdByUserId: fixture.owner.userId,
      },
    ]);
    const milestoneTargetId = randomUUID();
    const deliverableTargetId = randomUUID();
    await db.insert(clientAcceptanceTargets).values([
      {
        id: milestoneTargetId,
        projectId: fixture.project.id,
        projectItemId: milestoneItemId,
        idempotencyKey: randomUUID(),
        versionNumber: 1,
        snapshotTitle: "Release candidate",
        snapshotSummary: "Milestone acceptance snapshot",
        snapshotStatus: "planned",
        milestoneSourceUpdatedAt,
        publishedByUserId: fixture.owner.userId,
      },
      {
        id: deliverableTargetId,
        projectId: fixture.project.id,
        projectItemId: deliverableItemId,
        idempotencyKey: randomUUID(),
        versionNumber: 1,
        snapshotTitle: "Client projected deliverable",
        snapshotSummary: "Deliverable acceptance snapshot",
        publishedByUserId: fixture.owner.userId,
      },
    ]);
    await db.insert(clientAcceptanceActions).values({
      projectId: fixture.project.id,
      acceptanceTargetId: milestoneTargetId,
      participantId,
      idempotencyKey: randomUUID(),
      action: "accepted",
    });

    let coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    expect(coverage.summary.pendingAcceptance).toBe(1);
    expect(coverage.items).toContainEqual(
      expect.objectContaining({
        identifier: "Client deliverable",
        title: "Client projected deliverable",
        gaps: ["pending_acceptance"],
      }),
    );

    await db
      .update(milestones)
      .set({ updatedAt: new Date("2026-08-12T10:01:00.000Z") })
      .where(eq(milestones.id, milestoneId));
    coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    expect(coverage.summary.pendingAcceptance).toBe(2);
    expect(
      coverage.items.find((item) => item.workItemId === work.id)?.gaps,
    ).toContain("pending_acceptance");
    expect(
      coverage.items.find((item) => item.workItemId === secondWork.id)?.gaps,
    ).toContain("pending_acceptance");
  });

  it("requires current client-delivery work to cover commercial requirements", async () => {
    const fixture = await createFixture("PLAN");
    const source = await createCommercialSource(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pasted_text",
        name: "Planning requirements",
        mediaType: "text/plain",
        contentBase64: Buffer.from("Three delivery requirements").toString(
          "base64",
        ),
      },
    );
    const baseline = await createCommercialBaseline(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { sourceId: source.id },
    );
    const titles = [
      "Canceled requirement",
      "Archived requirement",
      "Reclassified requirement",
    ];
    const scopeItems = await Promise.all(
      titles.map((title) =>
        createCommercialScopeItem(
          fixture.owner,
          fixture.workspace.id,
          fixture.project.id,
          {
            idempotencyKey: randomUUID(),
            revisionIdempotencyKey: randomUUID(),
            baselineVersionId: baseline.versionId,
            kind: "requirement",
            title,
            details: null,
            anchors: [
              {
                sourceId: source.id,
                startOffset: 0,
                endOffset: 5,
                label: null,
              },
            ],
          },
        ),
      ),
    );
    await activateCommercialBaselineVersion(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      baseline.versionId,
      {},
    );
    const works = await Promise.all(
      titles.map((title) => createWork(fixture, `${title} work`)),
    );
    await Promise.all(
      works.map((work, index) =>
        createCommercialBasisLink(
          fixture.owner,
          fixture.workspace.id,
          fixture.project.id,
          work.id,
          { scopeItemRevisionId: scopeItems[index]!.revisionId },
        ),
      ),
    );
    let coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    expect(coverage.summary.missingPlannedWork).toBe(0);

    await Promise.all([
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        works[0]!.id,
        { status: "canceled" },
      ),
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        works[1]!.id,
        { archived: true },
      ),
      updateWorkPurpose(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        works[2]!.id,
        { purpose: "internal" },
      ),
    ]);
    coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 50 },
    );
    expect(coverage.summary.missingPlannedWork).toBe(3);
  });

  it("scopes defects, acceptance, and commercial readiness to one milestone", async () => {
    const fixture = await createFixture("MILESTONE");
    const targetMilestoneId = randomUUID();
    const otherMilestoneId = randomUUID();
    await db.insert(milestones).values([
      {
        id: targetMilestoneId,
        projectId: fixture.project.id,
        name: "Target milestone",
      },
      {
        id: otherMilestoneId,
        projectId: fixture.project.id,
        name: "Other milestone",
      },
    ]);
    const targetWork = await createWork(fixture, "Target milestone delivery");
    const otherWork = await createWork(fixture, "Other milestone delivery");
    const targetPlanningWork = await createWork(
      fixture,
      "Target milestone planning",
    );
    const otherPlanningWork = await createWork(
      fixture,
      "Other milestone planning",
    );
    await Promise.all([
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        targetWork.id,
        { milestoneId: targetMilestoneId },
      ),
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        targetPlanningWork.id,
        { milestoneId: targetMilestoneId },
      ),
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        otherWork.id,
        { milestoneId: otherMilestoneId },
      ),
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        otherPlanningWork.id,
        { milestoneId: otherMilestoneId },
      ),
    ]);
    await createDefect(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        title: "Target milestone defect",
        description: null,
        severity: "high",
        workItemId: targetWork.id,
        scopeItemRevisionId: null,
        commercialRequestId: null,
        commercialDecisionId: null,
        artifactId: null,
        verificationId: null,
        milestoneId: null,
        acceptanceTargetId: null,
      },
    );
    await createDefect(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        title: "Other milestone defect",
        description: null,
        severity: "critical",
        workItemId: otherWork.id,
        scopeItemRevisionId: null,
        commercialRequestId: null,
        commercialDecisionId: null,
        artifactId: null,
        verificationId: null,
        milestoneId: null,
        acceptanceTargetId: null,
      },
    );
    await createDefect(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        title: "Unattributed project defect",
        description: null,
        severity: "medium",
        workItemId: null,
        scopeItemRevisionId: null,
        commercialRequestId: null,
        commercialDecisionId: null,
        artifactId: null,
        verificationId: null,
        milestoneId: null,
        acceptanceTargetId: null,
      },
    );
    const targetProjectItemId = randomUUID();
    const otherProjectItemId = randomUUID();
    await db.insert(clientProjectItems).values([
      {
        id: targetProjectItemId,
        projectId: fixture.project.id,
        idempotencyKey: randomUUID(),
        target: "milestone",
        milestoneId: targetMilestoneId,
        clientSummary: "Target milestone acceptance",
        createdByUserId: fixture.owner.userId,
      },
      {
        id: otherProjectItemId,
        projectId: fixture.project.id,
        idempotencyKey: randomUUID(),
        target: "milestone",
        milestoneId: otherMilestoneId,
        clientSummary: "Other milestone acceptance",
        createdByUserId: fixture.owner.userId,
      },
    ]);
    await db.insert(clientAcceptanceTargets).values([
      {
        id: randomUUID(),
        projectId: fixture.project.id,
        projectItemId: targetProjectItemId,
        idempotencyKey: randomUUID(),
        versionNumber: 1,
        snapshotTitle: "Target milestone acceptance",
        snapshotSummary: "Pending target acceptance",
        snapshotStatus: "planned",
        publishedByUserId: fixture.owner.userId,
      },
      {
        id: randomUUID(),
        projectId: fixture.project.id,
        projectItemId: otherProjectItemId,
        idempotencyKey: randomUUID(),
        versionNumber: 1,
        snapshotTitle: "Other milestone acceptance",
        snapshotSummary: "Pending other acceptance",
        snapshotStatus: "planned",
        publishedByUserId: fixture.owner.userId,
      },
    ]);
    const source = await createCommercialSource(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pasted_text",
        name: "Milestone-scoped requirements",
        mediaType: "text/plain",
        contentBase64: Buffer.from("Target and other requirements").toString(
          "base64",
        ),
      },
    );
    const baseline = await createCommercialBaseline(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { sourceId: source.id },
    );
    const requirementTitles = [
      "Target milestone requirement",
      "Other milestone requirement",
    ];
    const requirements = await Promise.all(
      requirementTitles.map((title) =>
        createCommercialScopeItem(
          fixture.owner,
          fixture.workspace.id,
          fixture.project.id,
          {
            idempotencyKey: randomUUID(),
            revisionIdempotencyKey: randomUUID(),
            baselineVersionId: baseline.versionId,
            kind: "requirement",
            title,
            details: null,
            anchors: [
              {
                sourceId: source.id,
                startOffset: 0,
                endOffset: 6,
                label: null,
              },
            ],
          },
        ),
      ),
    );
    await activateCommercialBaselineVersion(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      baseline.versionId,
      {},
    );
    await Promise.all([
      createCommercialBasisLink(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        targetPlanningWork.id,
        { scopeItemRevisionId: requirements[0]!.revisionId },
      ),
      createCommercialBasisLink(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        otherPlanningWork.id,
        { scopeItemRevisionId: requirements[1]!.revisionId },
      ),
    ]);
    await Promise.all([
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        targetPlanningWork.id,
        { status: "canceled" },
      ),
      updateWorkItem(
        fixture.owner,
        fixture.workspace.id,
        fixture.project.id,
        otherPlanningWork.id,
        { status: "canceled" },
      ),
    ]);

    const coverage = await getEngineeringCoverage(
      fixture.owner,
      fixture.workspace.id,
      fixture.project.id,
      { page: 1, pageSize: 100, milestoneId: targetMilestoneId },
    );
    expect(coverage.summary.unresolvedDefects).toBe(1);
    expect(coverage.summary.pendingAcceptance).toBe(1);
    expect(coverage.summary.missingPlannedWork).toBe(1);
    expect(
      coverage.items.find((item) => item.workItemId === targetWork.id)?.gaps,
    ).toContain("unresolved_defect");
    expect(
      coverage.items.some((item) => item.workItemId === otherWork.id),
    ).toBe(false);
    expect(coverage.items).toContainEqual(
      expect.objectContaining({ title: "Target milestone requirement" }),
    );
    expect(
      coverage.items.some(
        (item) =>
          item.title === "Other milestone requirement" ||
          item.title === "Other milestone defect" ||
          item.title === "Unattributed project defect",
      ),
    ).toBe(false);
  });

  it("rejects a cross-workspace claim even when installation and repository identities are known", async () => {
    const authorized = await createFixture("AUTH", "authorized");
    const attacker = await createFixture("EVIL", "attacker");
    const installationId = "4242424242";
    const repositoryFullName = "customer/private-delivery";
    const state = createGitHubInstallationState({
      phase: "oauth",
      workspaceId: authorized.workspace.id,
      projectId: authorized.project.id,
      userId: authorized.owner.userId,
      repositoryFullName,
      returnPath: `/app/${authorized.workspace.slug}/projects/AUTH/engineering`,
      installationId,
    });

    await expect(
      completeGitHubRepositoryInstallation(
        attacker.owner,
        state,
        "attacker-supplied-code",
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      db
        .select()
        .from(engineeringProviderInstallations)
        .where(
          eq(
            engineeringProviderInstallations.providerInstallationId,
            installationId,
          ),
        ),
    ).resolves.toHaveLength(0);
  });

  it("reconciles a status webhook against an older cached PR by head SHA", async () => {
    const fixture = await createFixture("STATUS", "old-status");
    const repositoryId = await seedRepository(fixture);
    await upsertProviderEvidence(
      repositoryId,
      Array.from({ length: 31 }, (_, index) =>
        evidence({
          providerArtifactId: String(index + 1),
          number: index + 1,
          title: `Status evidence ${index + 1}`,
          headSha: index === 0 ? "old-head-sha" : `newer-head-${index + 1}`,
          checkRollup: "passing",
          providerUpdatedAt: new Date(Date.UTC(2026, 7, 13, 0, index)),
        }),
      ),
      "integration",
      null,
    );
    const repositoryRows = await db
      .select()
      .from(engineeringRepositories)
      .where(eq(engineeringRepositories.id, repositoryId));
    const installationRows = await db
      .select()
      .from(engineeringProviderInstallations)
      .where(
        eq(
          engineeringProviderInstallations.id,
          repositoryRows[0]!.installationId,
        ),
      );
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const envKeys = [
      "GITHUB_APP_ID",
      "GITHUB_APP_SLUG",
      "GITHUB_APP_CLIENT_ID",
      "GITHUB_APP_CLIENT_SECRET",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_APP_WEBHOOK_SECRET",
    ] as const;
    const previousEnv = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_SLUG: "scopedelta-test",
      GITHUB_APP_CLIENT_ID: "Iv1.test-client",
      GITHUB_APP_CLIENT_SECRET: "test-client-secret",
      GITHUB_APP_PRIVATE_KEY: privateKey.export({
        type: "pkcs8",
        format: "pem",
      }),
      GITHUB_APP_WEBHOOK_SECRET: "a-test-webhook-secret-long-enough",
    });
    const request = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/access_tokens")) {
        return Response.json({ token: "installation-token" });
      }
      if (url.includes("/pulls/1/reviews")) return Response.json([]);
      if (url.endsWith("/pulls/1")) {
        return Response.json({
          id: 1,
          number: 1,
          html_url: "https://github.com/scope-delta-test/delivery/pull/1",
          title: "Status evidence 1",
          state: "open",
          draft: false,
          merged_at: null,
          merge_commit_sha: null,
          updated_at: "2026-08-13T23:30:00.000Z",
          user: { id: 1, login: "engineer" },
          requested_reviewers: [],
          requested_teams: [],
          head: { ref: "old-pr", sha: "old-head-sha" },
          base: { ref: "main" },
        });
      }
      if (url.includes("/commits/old-head-sha/check-runs")) {
        return Response.json({
          total_count: 1,
          check_runs: [{ status: "completed", conclusion: "failure" }],
        });
      }
      if (url.endsWith("/commits/old-head-sha/status")) {
        return Response.json({ state: "failure", total_count: 1 });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", request);

    try {
      await expect(
        processGitHubWebhookDelivery(
          "old-status-delivery",
          "status",
          JSON.stringify({
            sha: "old-head-sha",
            repository: {
              id: Number(repositoryRows[0]!.providerRepositoryId),
            },
            installation: {
              id: Number(installationRows[0]!.providerInstallationId),
            },
          }),
        ),
      ).resolves.toEqual({ duplicate: false, processed: 1 });
      const oldArtifactRows = await db
        .select({
          checkRollup: implementationArtifacts.checkRollup,
          staleAt: implementationArtifacts.staleAt,
        })
        .from(implementationArtifacts)
        .where(eq(implementationArtifacts.providerArtifactId, "1"));
      expect(oldArtifactRows).toEqual([
        { checkRollup: "failing", staleAt: null },
      ]);
      expect(
        request.mock.calls.some(([input]) =>
          String(input).includes("/pulls?state=all"),
        ),
      ).toBe(false);
      expect(
        request.mock.calls.some(([input]) =>
          String(input).endsWith("/pulls/1"),
        ),
      ).toBe(true);
    } finally {
      for (const key of envKeys) {
        const value = previousEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("revokes cached evidence when GitHub removes repository or installation grants", async () => {
    const repositoryFixture = await createFixture("REVOKE", "repository-grant");
    const repositoryId = await seedRepository(repositoryFixture);
    await upsertProviderEvidence(
      repositoryId,
      [evidence({ providerArtifactId: "revoked-repository-pr" })],
      "integration",
      null,
    );
    const repositoryRows = await db
      .select()
      .from(engineeringRepositories)
      .where(eq(engineeringRepositories.id, repositoryId));
    const repositoryInstallationRows = await db
      .select()
      .from(engineeringProviderInstallations)
      .where(
        eq(
          engineeringProviderInstallations.id,
          repositoryRows[0]!.installationId,
        ),
      );
    await expect(
      processGitHubWebhookDelivery(
        "repository-grant-removed",
        "installation_repositories",
        JSON.stringify({
          action: "removed",
          installation: {
            id: Number(repositoryInstallationRows[0]!.providerInstallationId),
          },
          repositories_removed: [
            { id: Number(repositoryRows[0]!.providerRepositoryId) },
          ],
        }),
      ),
    ).resolves.toEqual({ duplicate: false, processed: 1 });
    const revokedRepositoryRows = await db
      .select()
      .from(engineeringRepositories)
      .where(eq(engineeringRepositories.id, repositoryId));
    expect(revokedRepositoryRows[0]).toMatchObject({
      state: "revoked",
      lastSyncErrorCode: "provider_repository_grant_revoked",
    });
    expect(revokedRepositoryRows[0]!.staleAt).not.toBeNull();
    const preservedArtifacts = await db
      .select()
      .from(implementationArtifacts)
      .where(eq(implementationArtifacts.repositoryId, repositoryId));
    expect(preservedArtifacts).toHaveLength(1);
    expect(preservedArtifacts[0]!.staleAt).not.toBeNull();
    await expect(
      db
        .select({ state: engineeringProviderInstallations.state })
        .from(engineeringProviderInstallations)
        .where(
          eq(
            engineeringProviderInstallations.id,
            repositoryInstallationRows[0]!.id,
          ),
        ),
    ).resolves.toEqual([{ state: "active" }]);

    const installationFixture = await createFixture(
      "SUSPEND",
      "installation-grant",
    );
    const installationRepositoryId = await seedRepository(installationFixture);
    await upsertProviderEvidence(
      installationRepositoryId,
      [evidence({ providerArtifactId: "suspended-installation-pr" })],
      "integration",
      null,
    );
    const installationRepositoryRows = await db
      .select()
      .from(engineeringRepositories)
      .where(eq(engineeringRepositories.id, installationRepositoryId));
    const installationRows = await db
      .select()
      .from(engineeringProviderInstallations)
      .where(
        eq(
          engineeringProviderInstallations.id,
          installationRepositoryRows[0]!.installationId,
        ),
      );
    await expect(
      processGitHubWebhookDelivery(
        "installation-suspended",
        "installation",
        JSON.stringify({
          action: "suspend",
          installation: {
            id: Number(installationRows[0]!.providerInstallationId),
          },
        }),
      ),
    ).resolves.toEqual({ duplicate: false, processed: 1 });
    await expect(
      db
        .select({ state: engineeringProviderInstallations.state })
        .from(engineeringProviderInstallations)
        .where(
          eq(engineeringProviderInstallations.id, installationRows[0]!.id),
        ),
    ).resolves.toEqual([{ state: "revoked" }]);
    await expect(
      db
        .select({
          state: engineeringRepositories.state,
          errorCode: engineeringRepositories.lastSyncErrorCode,
        })
        .from(engineeringRepositories)
        .where(eq(engineeringRepositories.id, installationRepositoryId)),
    ).resolves.toEqual([
      {
        state: "revoked",
        errorCode: "provider_installation_revoked",
      },
    ]);
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

async function createDraftScopeItem(fixture: Fixture, title: string) {
  const source = await createCommercialSource(
    fixture.owner,
    fixture.workspace.id,
    fixture.project.id,
    {
      idempotencyKey: randomUUID(),
      kind: "pasted_text",
      name: `${title} source`,
      mediaType: "text/plain",
      contentBase64: Buffer.from(title).toString("base64"),
    },
  );
  const baseline = await createCommercialBaseline(
    fixture.owner,
    fixture.workspace.id,
    fixture.project.id,
    { sourceId: source.id },
  );
  const item = await createCommercialScopeItem(
    fixture.owner,
    fixture.workspace.id,
    fixture.project.id,
    {
      idempotencyKey: randomUUID(),
      revisionIdempotencyKey: randomUUID(),
      baselineVersionId: baseline.versionId,
      kind: "deliverable",
      title,
      details: null,
      anchors: [
        {
          sourceId: source.id,
          startOffset: 0,
          endOffset: title.length,
          label: null,
        },
      ],
    },
  );
  return { ...item, baselineVersionId: baseline.versionId };
}

async function seedRepository(fixture: Fixture) {
  const installationId = randomUUID();
  const repositoryId = randomUUID();
  await db.insert(engineeringProviderInstallations).values({
    id: installationId,
    workspaceId: fixture.workspace.id,
    provider: "github",
    providerInstallationId: String(
      Math.floor(Math.random() * 900_000_000) + 100_000_000,
    ),
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
    providerRepositoryId: String(
      Math.floor(Math.random() * 900_000_000) + 100_000_000,
    ),
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
