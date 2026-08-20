import { randomUUID } from "node:crypto";

import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb, getPool } from "@/db";
import {
  clientAcceptanceTargets,
  clientCommercialPacketActions,
  clientCommercialPackets,
  clientProjectParticipants,
  clientProjectItems,
  commercialRequests,
  commercialDecisions,
  commercialImpactAssessments,
  defects,
  deliveryTimeEntries,
  engineeringProviderInstallations,
  engineeringRepositories,
  implementationArtifacts,
  memberDeliveryAvailabilityPeriods,
  memberships,
  users,
  workImplementationLinks,
  workspaceDeliveryAvailabilityPeriods,
} from "@/db/schema";
import { addIsoDays, isoWeekStart } from "@/lib/operations";
import {
  addDependency,
  addProjectMember,
  createClient,
  createMilestone,
  createProject,
  createWorkItem,
} from "@/server/delivery";
import {
  createAllocation,
  createTimeEntry,
  deleteTimeEntry,
  getProjectCommercialExposure,
  listCapacity,
  listPortfolio,
  listTimeEntries,
  setMemberAvailability,
  updateTimeEntry,
} from "@/server/operations";
import { createWorkspace } from "@/server/workspaces";
import { updateWorkPurpose } from "@/server/commercial";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/scopedelta_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error(
    "Integration tests require a dedicated scopedelta_test database.",
  );
}

const db = getDb();
const portfolioFilters = {
  page: 1,
  pageSize: 25,
  lifecycle: "active" as const,
};

describe("portfolio operations domain boundary", () => {
  beforeEach(async () => {
    await db.execute(sql`truncate table users, workspaces cascade`);
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("seeds availability, serializes effective periods, and shows masked over-allocation", async () => {
    const fixture = await createFixture();
    const currentWeek = isoWeekStart(new Date().toISOString().slice(0, 10));
    const nextWeek = addIsoDays(currentWeek, 7);

    await Promise.all([
      setMemberAvailability(
        fixture.owner,
        fixture.workspace.id,
        fixture.member.userId,
        {
          effectiveFrom: currentWeek,
          weeklyMinutes: 2_000,
        },
      ),
      setMemberAvailability(
        fixture.owner,
        fixture.workspace.id,
        fixture.member.userId,
        {
          effectiveFrom: nextWeek,
          weeklyMinutes: 2_400,
        },
      ),
    ]);
    await createAllocation(fixture.lead, fixture.workspace.id, {
      memberUserId: fixture.member.userId,
      projectId: fixture.ledProject.id,
      startWeek: currentWeek,
      endWeek: currentWeek,
      plannedMinutesPerWeek: 1_500,
      roleLabel: "Delivery",
    });
    await createAllocation(fixture.owner, fixture.workspace.id, {
      memberUserId: fixture.member.userId,
      projectId: fixture.otherProject.id,
      startWeek: currentWeek,
      endWeek: currentWeek,
      plannedMinutesPerWeek: 1_100,
      roleLabel: "Private account",
    });

    const defaults = await db
      .select()
      .from(workspaceDeliveryAvailabilityPeriods);
    expect(defaults).toEqual([
      expect.objectContaining({
        weeklyMinutes: 2_400,
        effectiveFrom: "1970-01-05",
      }),
    ]);
    const periods = await db
      .select()
      .from(memberDeliveryAvailabilityPeriods)
      .orderBy(asc(memberDeliveryAvailabilityPeriods.effectiveFrom));
    expect(periods).toEqual([
      expect.objectContaining({
        effectiveFrom: currentWeek,
        effectiveTo: addIsoDays(nextWeek, -1),
        weeklyMinutes: 2_000,
      }),
      expect.objectContaining({
        effectiveFrom: nextWeek,
        effectiveTo: null,
        weeklyMinutes: 2_400,
      }),
    ]);

    const capacity = await listCapacity(fixture.lead, fixture.workspace.id, {
      page: 1,
      pageSize: 25,
      startWeek: currentWeek,
      weeks: 1,
    });
    const member = capacity.members.find(
      (row) => row.id === fixture.member.userId,
    )!;
    expect(member.weeks[0]).toMatchObject({
      availableMinutes: 2_000,
      allocatedMinutes: 2_600,
      overallocatedMinutes: 600,
    });
    expect(member.weeks[0].allocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectName: "Lead project" }),
        expect.objectContaining({
          projectName: "Other committed work",
          projectId: null,
          roleLabel: null,
        }),
      ]),
    );
  });

  it("limits time mutation to the owner and excludes soft-deleted actuals", async () => {
    const fixture = await createFixture();
    const workDate = new Date().toISOString().slice(0, 10);
    const billable = await createTimeEntry(
      fixture.member,
      fixture.workspace.id,
      {
        projectId: fixture.ledProject.id,
        workItemId: null,
        workDate,
        durationMinutes: 90,
        classification: "billable",
        note: "Delivery session",
      },
    );
    await createTimeEntry(fixture.member, fixture.workspace.id, {
      projectId: fixture.ledProject.id,
      workItemId: null,
      workDate,
      durationMinutes: 30,
      classification: "non_billable",
      note: null,
    });

    await expect(
      updateTimeEntry(fixture.owner, fixture.workspace.id, billable.id, {
        durationMinutes: 10,
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    const leadView = await listTimeEntries(fixture.lead, fixture.workspace.id, {
      page: 1,
      pageSize: 25,
    });
    expect(leadView.aggregate).toEqual({
      billableMinutes: 90,
      nonBillableMinutes: 30,
    });
    expect(leadView.items[0]).toHaveProperty("note");

    await deleteTimeEntry(fixture.member, fixture.workspace.id, billable.id);
    const afterDelete = await listTimeEntries(
      fixture.owner,
      fixture.workspace.id,
      {
        page: 1,
        pageSize: 25,
      },
    );
    expect(afterDelete.aggregate).toEqual({
      billableMinutes: 0,
      nonBillableMinutes: 30,
    });
    await expect(
      db
        .select()
        .from(deliveryTimeEntries)
        .where(eq(deliveryTimeEntries.id, billable.id)),
    ).resolves.toEqual([
      expect.objectContaining({ deletedByUserId: fixture.member.userId }),
    ]);
  });

  it("returns exact portfolio drill links and conservative empty exposure", async () => {
    const fixture = await createFixture();
    const yesterday = addIsoDays(new Date().toISOString().slice(0, 10), -1);
    await createMilestone(
      fixture.owner,
      fixture.workspace.id,
      fixture.ledProject.id,
      {
        name: "Late review",
        description: null,
        targetDate: yesterday,
      },
    );
    const deliveryWork = await createWorkItem(
      fixture.owner,
      fixture.workspace.id,
      fixture.ledProject.id,
      {
        title: "Active delivery without a commercial basis",
        description: null,
        acceptanceCriteria: null,
        status: "ready",
        priority: "high",
        assigneeUserId: fixture.member.userId,
        estimatePoints: 5,
        targetDate: null,
        milestoneId: null,
        parentId: null,
        labelIds: [],
      },
    );
    await updateWorkPurpose(
      fixture.owner,
      fixture.workspace.id,
      fixture.ledProject.id,
      deliveryWork.id,
      { purpose: "client_delivery" },
    );
    const blocker = await createWorkItem(
      fixture.owner,
      fixture.workspace.id,
      fixture.ledProject.id,
      {
        title: "Blocking work",
        description: null,
        acceptanceCriteria: null,
        status: "in_progress",
        priority: "medium",
        assigneeUserId: null,
        estimatePoints: null,
        targetDate: null,
        milestoneId: null,
        parentId: null,
        labelIds: [],
      },
    );
    const blocked = await createWorkItem(
      fixture.owner,
      fixture.workspace.id,
      fixture.ledProject.id,
      {
        title: "Blocked work",
        description: null,
        acceptanceCriteria: null,
        status: "ready",
        priority: "high",
        assigneeUserId: null,
        estimatePoints: null,
        targetDate: null,
        milestoneId: null,
        parentId: null,
        labelIds: [],
      },
    );
    await addDependency(
      fixture.owner,
      fixture.workspace.id,
      fixture.ledProject.id,
      blocker.id,
      blocked.id,
    );
    await db.insert(commercialRequests).values({
      id: randomUUID(),
      projectId: fixture.ledProject.id,
      idempotencyKey: randomUUID(),
      state: "needs_clarification",
      title: "Unresolved change",
      requestText: "Clarify the requested delivery change.",
      receivedAt: new Date(),
      createdByUserId: fixture.owner.userId,
    });
    await db.insert(defects).values({
      id: randomUUID(),
      projectId: fixture.ledProject.id,
      number: 1,
      title: "Open regression",
      status: "open",
      severity: "high",
      createdByUserId: fixture.owner.userId,
    });
    const milestone = await createMilestone(
      fixture.owner,
      fixture.workspace.id,
      fixture.ledProject.id,
      { name: "Client acceptance", description: null, targetDate: null },
    );
    const projectItemId = randomUUID();
    await db.insert(clientProjectItems).values({
      id: projectItemId,
      projectId: fixture.ledProject.id,
      idempotencyKey: randomUUID(),
      target: "milestone",
      milestoneId: milestone.id,
      clientSummary: "Acceptance target",
      createdByUserId: fixture.owner.userId,
    });
    await db.insert(clientAcceptanceTargets).values({
      id: randomUUID(),
      projectId: fixture.ledProject.id,
      projectItemId,
      idempotencyKey: randomUUID(),
      versionNumber: 1,
      snapshotTitle: "Acceptance target",
      snapshotSummary: "Awaiting client acceptance",
      snapshotStatus: "in_progress",
      publishedByUserId: fixture.owner.userId,
    });
    const installationId = randomUUID();
    const repositoryId = randomUUID();
    await db.insert(engineeringProviderInstallations).values({
      id: installationId,
      workspaceId: fixture.workspace.id,
      provider: "github",
      providerInstallationId: randomUUID(),
      accountId: randomUUID(),
      accountLogin: "operations-test",
      connectedByUserId: fixture.owner.userId,
    });
    await db.insert(engineeringRepositories).values({
      id: repositoryId,
      workspaceId: fixture.workspace.id,
      projectId: fixture.ledProject.id,
      installationId,
      provider: "github",
      providerRepositoryId: randomUUID(),
      owner: "scope-delta-test",
      name: "operations",
      fullName: "scope-delta-test/operations",
      url: "https://github.com/scope-delta-test/operations",
      defaultBranch: "main",
      private: true,
      connectedByUserId: fixture.owner.userId,
    });
    const artifactId = randomUUID();
    await db.insert(implementationArtifacts).values({
      id: artifactId,
      projectId: fixture.ledProject.id,
      repositoryId,
      provider: "github",
      kind: "pull_request",
      providerArtifactId: "operations-pr-1",
      number: 1,
      url: "https://github.com/scope-delta-test/operations/pull/1",
      title: "Stale delivery evidence",
      state: "open",
      baseBranch: "main",
      reviewRollup: "pending",
      checkRollup: "unknown",
      providerUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      staleAt: new Date(),
    });
    await db.insert(workImplementationLinks).values({
      id: randomUUID(),
      projectId: fixture.ledProject.id,
      workItemId: deliveryWork.id,
      artifactId,
      provenance: "manual",
      createdByUserId: fixture.owner.userId,
    });

    const portfolio = await listPortfolio(
      fixture.owner,
      fixture.workspace.id,
      portfolioFilters,
    );
    const project = portfolio.items.find(
      (item) => item.id === fixture.ledProject.id,
    )!;
    expect(project.signals.map((signal) => signal.category).sort()).toEqual(
      [
        "blocked_work",
        "client_request",
        "commercial_drift",
        "evidence_gap",
        "overdue_milestone",
        "pending_acceptance",
        "pending_commercial_decision",
        "stale_provider_evidence",
        "unresolved_defect",
      ].sort(),
    );
    expect(project.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "overdue_milestone",
          href: `/app/${fixture.workspace.slug}/projects/LEAD#milestones`,
        }),
      ]),
    );
    const memberPortfolio = await listPortfolio(
      fixture.member,
      fixture.workspace.id,
      portfolioFilters,
    );
    const memberProject = memberPortfolio.items.find(
      (item) => item.id === fixture.ledProject.id,
    )!;
    expect(memberProject.canViewCommercial).toBe(false);
    expect(memberProject.signals.map((signal) => signal.category)).toEqual(
      expect.arrayContaining(["blocked_work", "overdue_milestone"]),
    );
    const memberCategories = memberProject.signals.map(
      (signal) => signal.category,
    );
    expect(memberCategories).not.toContain("commercial_drift");
    expect(memberCategories).not.toContain("pending_commercial_decision");
    for (const attention of [
      "commercial_drift",
      "pending_commercial_decision",
    ] as const) {
      const filtered = await listPortfolio(
        fixture.member,
        fixture.workspace.id,
        { ...portfolioFilters, attention },
      );
      expect(filtered.items).toEqual([]);
      expect(filtered.page.total).toBe(0);
    }
    const ordinaryFiltered = await listPortfolio(
      fixture.member,
      fixture.workspace.id,
      { ...portfolioFilters, attention: "blocked_work" },
    );
    expect(ordinaryFiltered.items).toEqual([
      expect.objectContaining({
        id: fixture.ledProject.id,
        signals: expect.arrayContaining([
          expect.objectContaining({ category: "blocked_work" }),
        ]),
      }),
    ]);
    const exposure = await getProjectCommercialExposure(
      fixture.lead,
      fixture.workspace.id,
      fixture.ledProject.id,
    );
    expect(exposure).toMatchObject({
      baseline: null,
      confirmed: { money: [], effortMinutes: 0, scheduleImpactCount: 0 },
      pending: {
        money: [],
        effortMinutes: 0,
        scheduleImpactCount: 0,
        requestCount: 1,
      },
      actual: { billableMinutes: 0, nonBillableMinutes: 0 },
    });
    expect(exposure).not.toHaveProperty("margin");
    expect(exposure).not.toHaveProperty("revenue");
  });

  it("uses safe not-found denial across workspaces", async () => {
    const fixture = await createFixture();
    const outsider = await createUser("outsider@example.test", "Outsider");
    await createWorkspace(outsider, { name: "Other tenant" });
    await expect(
      listPortfolio(outsider, fixture.workspace.id, portfolioFilters),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(
      createTimeEntry(outsider, fixture.workspace.id, {
        projectId: fixture.ledProject.id,
        workItemId: null,
        workDate: new Date().toISOString().slice(0, 10),
        durationMinutes: 15,
        classification: "billable",
        note: null,
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("requires exact client-approved packets for paid-change exposure", async () => {
    const fixture = await createFixture();
    const requestIds = {
      noPacket: randomUUID(),
      unapproved: randomUUID(),
      approved: randomUUID(),
      stalePacket: randomUUID(),
      unresolved: randomUUID(),
    };
    await db.insert(commercialRequests).values(
      Object.entries(requestIds).map(([kind, id]) => ({
        id,
        projectId: fixture.ledProject.id,
        idempotencyKey: randomUUID(),
        state:
          kind === "unresolved" ? ("open" as const) : ("resolved" as const),
        title: {
          noPacket: "No client packet",
          unapproved: "Awaiting client approval",
          approved: "Approved exact packet",
          stalePacket: "Stale packet approval",
          unresolved: "Unresolved estimate",
        }[kind]!,
        requestText: `Commercial exposure fixture: ${kind}.`,
        receivedAt: new Date(),
        createdByUserId: fixture.owner.userId,
      })),
    );

    const decisionIds = {
      noPacket: randomUUID(),
      unapproved: randomUUID(),
      approved: randomUUID(),
      stale: randomUUID(),
      current: randomUUID(),
    };
    const now = new Date();
    const earlier = new Date(now.getTime() - 1_000);
    await db.insert(commercialDecisions).values([
      ...(["noPacket", "unapproved", "approved"] as const).map((kind) => ({
        id: decisionIds[kind],
        projectId: fixture.ledProject.id,
        requestId: requestIds[kind],
        idempotencyKey: randomUUID(),
        disposition:
          kind === "unapproved" ? ("swap" as const) : ("paid_change" as const),
        rationale: `Current ${kind} decision.`,
        confirmedAt: now,
        createdByUserId: fixture.owner.userId,
      })),
      {
        id: decisionIds.stale,
        projectId: fixture.ledProject.id,
        requestId: requestIds.stalePacket,
        idempotencyKey: randomUUID(),
        disposition: "paid_change" as const,
        rationale: "Superseded decision attached to the packet.",
        confirmedAt: earlier,
        supersededAt: now,
        createdByUserId: fixture.owner.userId,
      },
      {
        id: decisionIds.current,
        projectId: fixture.ledProject.id,
        requestId: requestIds.stalePacket,
        idempotencyKey: randomUUID(),
        disposition: "paid_change" as const,
        rationale: "Current decision not attached to the stale packet.",
        supersedesDecisionId: decisionIds.stale,
        confirmedAt: now,
        createdByUserId: fixture.owner.userId,
      },
    ]);

    const impactIds = {
      noPacket: randomUUID(),
      unapproved: randomUUID(),
      approved: randomUUID(),
      stale: randomUUID(),
      current: randomUUID(),
    };
    await db.insert(commercialImpactAssessments).values([
      {
        id: impactIds.noPacket,
        projectId: fixture.ledProject.id,
        requestId: requestIds.noPacket,
        decisionId: decisionIds.noPacket,
        idempotencyKey: randomUUID(),
        confidence: "confirmed",
        effortMinutes: 120,
        scheduleDeltaDays: 2,
        monetaryAmount: "100.00",
        currencyCode: "USD",
        createdByUserId: fixture.owner.userId,
      },
      {
        id: impactIds.unapproved,
        projectId: fixture.ledProject.id,
        requestId: requestIds.unapproved,
        decisionId: decisionIds.unapproved,
        idempotencyKey: randomUUID(),
        confidence: "confirmed",
        effortMinutes: 60,
        scheduleDeltaDays: 1,
        monetaryAmount: "200.00",
        currencyCode: "EUR",
        createdByUserId: fixture.owner.userId,
      },
      {
        id: impactIds.approved,
        projectId: fixture.ledProject.id,
        requestId: requestIds.approved,
        decisionId: decisionIds.approved,
        idempotencyKey: randomUUID(),
        confidence: "confirmed",
        effortMinutes: 180,
        scheduleDeltaDays: 3,
        monetaryAmount: "300.00",
        currencyCode: "GBP",
        createdByUserId: fixture.owner.userId,
      },
      {
        id: impactIds.stale,
        projectId: fixture.ledProject.id,
        requestId: requestIds.stalePacket,
        decisionId: decisionIds.stale,
        idempotencyKey: randomUUID(),
        confidence: "confirmed",
        effortMinutes: 15,
        monetaryAmount: "50.00",
        currencyCode: "JPY",
        createdByUserId: fixture.owner.userId,
      },
      {
        id: impactIds.current,
        projectId: fixture.ledProject.id,
        requestId: requestIds.stalePacket,
        decisionId: decisionIds.current,
        idempotencyKey: randomUUID(),
        confidence: "confirmed",
        effortMinutes: 90,
        scheduleDeltaDays: 4,
        monetaryAmount: "400.00",
        currencyCode: "JPY",
        supersedesImpactAssessmentId: impactIds.stale,
        createdByUserId: fixture.owner.userId,
      },
      {
        id: randomUUID(),
        projectId: fixture.ledProject.id,
        requestId: requestIds.unresolved,
        idempotencyKey: randomUUID(),
        confidence: "estimate",
        effortMinutes: 45,
        targetDate: addIsoDays(new Date().toISOString().slice(0, 10), 14),
        monetaryAmount: "75.50",
        currencyCode: "CAD",
        createdByUserId: fixture.owner.userId,
      },
    ]);

    const packetIds = {
      unapproved: randomUUID(),
      approved: randomUUID(),
      stale: randomUUID(),
    };
    await db.insert(clientCommercialPackets).values([
      {
        id: packetIds.unapproved,
        projectId: fixture.ledProject.id,
        requestId: requestIds.unapproved,
        decisionId: decisionIds.unapproved,
        impactAssessmentId: impactIds.unapproved,
        idempotencyKey: randomUUID(),
        versionNumber: 1,
        requirement: "approval",
        title: "Awaiting approval",
        requestSummary: "Approval has not been supplied.",
        treatmentSummary: "Keep this exposure pending.",
        publishedByUserId: fixture.owner.userId,
      },
      {
        id: packetIds.approved,
        projectId: fixture.ledProject.id,
        requestId: requestIds.approved,
        decisionId: decisionIds.approved,
        impactAssessmentId: impactIds.approved,
        idempotencyKey: randomUUID(),
        versionNumber: 1,
        requirement: "approval",
        title: "Approved exact packet",
        requestSummary: "Approval applies to this decision and impact.",
        treatmentSummary: "Include this exposure as confirmed.",
        publishedByUserId: fixture.owner.userId,
      },
      {
        id: packetIds.stale,
        projectId: fixture.ledProject.id,
        requestId: requestIds.stalePacket,
        decisionId: decisionIds.stale,
        impactAssessmentId: impactIds.stale,
        idempotencyKey: randomUUID(),
        versionNumber: 1,
        requirement: "approval",
        title: "Approved stale packet",
        requestSummary: "Approval applies only to superseded evidence.",
        treatmentSummary: "Do not authorize the current impact.",
        publishedByUserId: fixture.owner.userId,
      },
    ]);
    const client = await createUser(
      "commercial-client@example.test",
      "Commercial Client",
    );
    const participantId = randomUUID();
    await db.insert(clientProjectParticipants).values({
      id: participantId,
      projectId: fixture.ledProject.id,
      userId: client.userId,
      invitedEmail: client.email,
      role: "approver",
      createdByUserId: fixture.owner.userId,
    });
    await db.insert(clientCommercialPacketActions).values([
      {
        id: randomUUID(),
        projectId: fixture.ledProject.id,
        packetId: packetIds.approved,
        participantId,
        idempotencyKey: randomUUID(),
        action: "approved",
      },
      {
        id: randomUUID(),
        projectId: fixture.ledProject.id,
        packetId: packetIds.stale,
        participantId,
        idempotencyKey: randomUUID(),
        action: "approved",
      },
    ]);

    const exposure = await getProjectCommercialExposure(
      fixture.lead,
      fixture.workspace.id,
      fixture.ledProject.id,
    );
    expect(exposure.confirmed).toMatchObject({
      money: [{ currencyCode: "GBP", amount: "300.00" }],
      effortMinutes: 180,
      scheduleImpactCount: 1,
    });
    expect(exposure.confirmed.scheduleImpacts).toEqual([
      expect.objectContaining({
        requestTitle: "Approved exact packet",
        scheduleDeltaDays: 3,
      }),
    ]);
    expect(exposure.pending).toMatchObject({
      effortMinutes: 315,
      scheduleImpactCount: 4,
      requestCount: 1,
    });
    expect(exposure.pending.money).toEqual(
      expect.arrayContaining([
        { currencyCode: "USD", amount: "100.00" },
        { currencyCode: "EUR", amount: "200.00" },
        { currencyCode: "JPY", amount: "400.00" },
        { currencyCode: "CAD", amount: "75.50" },
      ]),
    );
    expect(exposure.pending.scheduleImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requestTitle: "No client packet" }),
        expect.objectContaining({ requestTitle: "Awaiting client approval" }),
        expect.objectContaining({ requestTitle: "Stale packet approval" }),
        expect.objectContaining({ requestTitle: "Unresolved estimate" }),
      ]),
    );
    expect(JSON.stringify(exposure)).not.toMatch(/margin|profit|revenue|cost/i);
  });

  it("keeps representative 220-person portfolio responses bounded", async () => {
    const owner = await createUser("scale-owner@example.test", "Scale Owner");
    const workspace = await createWorkspace(owner, { name: "Scale fixture" });
    const client = await createClient(owner, workspace.id, {
      name: "Scale client",
      internalReference: null,
      summary: null,
    });
    const currentWeek = isoWeekStart(new Date().toISOString().slice(0, 10));
    await db.execute(sql`
      insert into users (id, email, name, email_verified)
      select gen_random_uuid(), 'scale-' || value || '@example.test',
        'Scale member ' || lpad(value::text, 3, '0'), true
      from generate_series(1, 219) value;
    `);
    await db.execute(sql`
      insert into memberships (id, workspace_id, user_id, role)
      select gen_random_uuid(), ${workspace.id}, id, 'member'
      from users where email ~ '^scale-[0-9]+@example\\.test$';
    `);
    await db.execute(sql`
      insert into projects (id, workspace_id, client_id, key, name, lead_user_id, lifecycle)
      select gen_random_uuid(), ${workspace.id}, ${client.id},
        'S' || lpad(value::text, 3, '0'), 'Scale project ' || lpad(value::text, 3, '0'),
        ${owner.userId},
        case when value <= 80 then 'active'::project_lifecycle
          when value <= 100 then 'completed'::project_lifecycle
          else 'archived'::project_lifecycle end
      from generate_series(1, 120) value;
    `);
    await db.execute(sql`
      with member_rows as (
        select user_id, row_number() over (order by user_id) position
        from memberships where workspace_id = ${workspace.id}
      ), project_rows as (
        select id, row_number() over (order by key) position
        from projects where workspace_id = ${workspace.id} and lifecycle = 'active'
      )
      insert into project_allocations (
        id, workspace_id, project_id, member_user_id, start_week, end_week,
        planned_minutes_per_week, created_by_user_id, updated_by_user_id
      )
      select gen_random_uuid(), ${workspace.id}, project_rows.id, member_rows.user_id,
        ${currentWeek}::date, ${currentWeek}::date, 120, ${owner.userId}, ${owner.userId}
      from generate_series(1, 2000) value
      join member_rows on member_rows.position = ((value - 1) % 220) + 1
      join project_rows on project_rows.position = ((value - 1) % 80) + 1;
    `);
    await db.execute(sql`
      with member_rows as (
        select user_id, row_number() over (order by user_id) position
        from memberships where workspace_id = ${workspace.id}
      ), project_rows as (
        select id, row_number() over (order by key) position
        from projects where workspace_id = ${workspace.id} and lifecycle = 'active'
      )
      insert into work_items (
        id, project_id, number, title, status, purpose, assignee_user_id,
        estimate_points, sort_order
      )
      select gen_random_uuid(), project_rows.id, ((value - 1) / 80) + 1,
        'Representative work ' || value, 'ready', 'unclassified',
        member_rows.user_id, (value % 8) + 1, value
      from generate_series(1, 3000) value
      join member_rows on member_rows.position = ((value - 1) % 220) + 1
      join project_rows on project_rows.position = ((value - 1) % 80) + 1;
    `);
    await db.execute(sql`
      with member_rows as (
        select user_id, row_number() over (order by user_id) position
        from memberships where workspace_id = ${workspace.id}
      ), project_rows as (
        select id, row_number() over (order by key) position
        from projects where workspace_id = ${workspace.id} and lifecycle = 'active'
      )
      insert into delivery_time_entries (
        id, workspace_id, project_id, member_user_id, work_date,
        duration_minutes, classification, created_by_user_id, updated_by_user_id
      )
      select gen_random_uuid(), ${workspace.id}, project_rows.id, member_rows.user_id,
        current_date, 30,
        case when value % 3 = 0 then 'non_billable'::delivery_time_classification
          else 'billable'::delivery_time_classification end,
        member_rows.user_id, member_rows.user_id
      from generate_series(1, 5000) value
      join member_rows on member_rows.position = ((value - 1) % 220) + 1
      join project_rows on project_rows.position = ((value - 1) % 80) + 1;
    `);

    const [portfolio, capacity, time] = await Promise.all([
      listPortfolio(owner, workspace.id, portfolioFilters),
      listCapacity(owner, workspace.id, {
        page: 1,
        pageSize: 100,
        startWeek: currentWeek,
        weeks: 4,
      }),
      listTimeEntries(owner, workspace.id, { page: 1, pageSize: 25 }),
    ]);
    expect(portfolio.page).toMatchObject({ total: 80, size: 25 });
    expect(portfolio.items).toHaveLength(25);
    expect(
      portfolio.items.every((project) => project.lifecycle === "active"),
    ).toBe(true);
    expect(capacity.page).toMatchObject({ total: 220, size: 100 });
    expect(capacity.members).toHaveLength(100);
    expect(time.page).toMatchObject({ total: 5_000, size: 25 });
    expect(time.items).toHaveLength(25);
    expect(JSON.stringify(portfolio).length).toBeLessThan(250_000);
  });
});

async function createFixture() {
  const owner = await createUser("owner@example.test", "Owner");
  const lead = await createUser("lead@example.test", "Lead");
  const member = await createUser("member@example.test", "Member");
  const workspace = await createWorkspace(owner, { name: "Operations" });
  await db.insert(memberships).values([
    {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: lead.userId,
      role: "member",
    },
    {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: member.userId,
      role: "member",
    },
  ]);
  const client = await createClient(owner, workspace.id, {
    name: "Client",
    internalReference: null,
    summary: null,
  });
  const ledProject = await createProject(owner, workspace.id, {
    clientId: client.id,
    key: "LEAD",
    name: "Lead project",
    summary: null,
    leadUserId: lead.userId,
    startDate: null,
    targetDate: null,
  });
  const otherProject = await createProject(owner, workspace.id, {
    clientId: client.id,
    key: "OTHER",
    name: "Other project",
    summary: null,
    leadUserId: owner.userId,
    startDate: null,
    targetDate: null,
  });
  await addProjectMember(lead, workspace.id, ledProject.id, member.userId);
  return { owner, lead, member, workspace, ledProject, otherProject };
}

async function createUser(email: string, name: string) {
  const userId = randomUUID();
  await db
    .insert(users)
    .values({ id: userId, email, name, emailVerified: true });
  return { userId, email };
}
