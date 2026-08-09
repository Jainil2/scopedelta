import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb, getPool } from "@/db";
import { PlatformError } from "@/lib/platform-errors";
import {
  auditEvents,
  commercialBasisLinks,
  commercialEvidenceSources,
  commercialScopeItemRevisions,
  memberships,
  projectMemberships,
  users,
} from "@/db/schema";
import {
  createCommercialBaseline,
  createCommercialBasisLink,
  createCommercialScopeItem,
  createCommercialSource,
  getCommercialSource,
  getWorkCommercialProvenance,
  listCommercialBasisOptions,
  listCommercialDrift,
  listCommercialOverview,
  retryCommercialSource,
  setCommercialScopeItemArchived,
  updateCommercialScopeItem,
  updateWorkPurpose,
} from "@/server/commercial";
import {
  createCommercialDecision,
  createCommercialImpactAssessment,
  createCommercialRequest,
  getCommercialRequest,
  listCommercialRequests,
  updateCommercialRequestState,
} from "@/server/commercial-change-control";
import {
  createClient,
  createProject,
  createWorkItem,
  listMyWork,
  listWorkItems,
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

describe("commercial baseline domain boundary", () => {
  beforeEach(async () => {
    await db.execute(sql`
      truncate table
        commercial_impact_assessment_anchors,
        commercial_impact_assessments,
        commercial_decision_anchors,
        commercial_decision_scope_items,
        commercial_request_anchors,
        commercial_request_scope_items,
        commercial_basis_links,
        commercial_decisions,
        commercial_requests,
        commercial_scope_revision_anchors,
        commercial_evidence_anchors,
        commercial_scope_item_revisions,
        commercial_scope_items,
        commercial_baseline_versions,
        commercial_baselines,
        commercial_evidence_sources,
        work_items,
        project_memberships,
        projects,
        clients,
        audit_events,
        workspace_invitations,
        memberships,
        workspace_settings,
        workspaces,
        accounts,
        sessions,
        verifications,
        auth_rate_limits,
        action_rate_limits,
        users
      cascade
    `);
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("preserves source, revision and work-link history while projecting advisory drift", async () => {
    const { owner, workspace, project, work } = await createFixture();
    const secret = "Deliver an authenticated client portal by launch";
    const idempotencyKey = randomUUID();
    const source = await createCommercialSource(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey,
        kind: "pasted_text",
        name: "Signed SOW extract",
        mediaType: "text/plain",
        contentBase64: Buffer.from(secret).toString("base64"),
      },
    );
    expect(source).toMatchObject({
      parseState: "ready",
      extractedText: secret,
    });
    await expect(
      createCommercialSource(owner, workspace.id, project.id, {
        idempotencyKey,
        kind: "pasted_text",
        name: "Signed SOW extract",
        mediaType: "text/plain",
        contentBase64: Buffer.from(secret).toString("base64"),
      }),
    ).resolves.toMatchObject({ id: source.id });

    const baseline = await createCommercialBaseline(
      owner,
      workspace.id,
      project.id,
      { sourceId: source.id },
    );
    expect(baseline).toMatchObject({ versionNumber: 1, sourceId: source.id });
    await expect(
      retryCommercialSource(owner, workspace.id, project.id, source.id),
    ).rejects.toMatchObject({ code: "source_in_use", status: 409 });

    const item = await createCommercialScopeItem(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        revisionIdempotencyKey: randomUUID(),
        baselineVersionId: baseline.versionId,
        kind: "deliverable",
        title: "Authenticated client portal",
        details: null,
        anchors: [
          {
            sourceId: source.id,
            startOffset: 0,
            endOffset: secret.length,
            label: "Deliverable paragraph",
          },
        ],
      },
    );

    await updateWorkPurpose(owner, workspace.id, project.id, work.id, {
      purpose: "client_delivery",
    });
    await expect(
      listCommercialDrift(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
        state: "commercially_unlinked",
      }),
    ).resolves.toMatchObject({ page: { total: 1 } });

    await createCommercialBasisLink(owner, workspace.id, project.id, work.id, {
      scopeItemRevisionId: item.revisionId,
    });
    const revised = await updateCommercialScopeItem(
      owner,
      workspace.id,
      project.id,
      item.id,
      {
        idempotencyKey: randomUUID(),
        kind: "deliverable",
        title: "Authenticated client portal with SSO",
        details: "Manual clarification recorded without rewriting version 1.",
        anchors: [
          {
            sourceId: source.id,
            startOffset: 0,
            endOffset: secret.length,
            label: null,
          },
        ],
      },
    );
    expect(revised.revisionNumber).toBe(2);
    const provenance = await getWorkCommercialProvenance(
      owner,
      workspace.id,
      project.id,
      work.id,
    );
    expect(provenance).toMatchObject({
      purpose: "client_delivery",
      state: "linked",
    });
    expect(provenance.links).toEqual([
      expect.objectContaining({
        scopeItemRevisionId: item.revisionId,
        revisionNumber: 1,
        title: "Authenticated client portal",
      }),
    ]);
    expect(
      await db
        .select()
        .from(commercialScopeItemRevisions)
        .where(eq(commercialScopeItemRevisions.scopeItemId, item.id)),
    ).toHaveLength(2);
    expect(await db.select().from(commercialBasisLinks)).toHaveLength(1);
    await expect(
      listWorkItems(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
      }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: work.id, commercialBasisCount: 1 }),
      ],
    });
    await expect(
      listMyWork(owner, workspace.id, { page: 1, pageSize: 50 }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: work.id, commercialBasisCount: 1 }),
      ],
    });
    await expect(
      listCommercialDrift(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
        state: "linked",
      }),
    ).resolves.toMatchObject({ page: { total: 1 } });
    await expect(
      listCommercialDrift(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
      }),
    ).resolves.toMatchObject({
      data: [expect.objectContaining({ id: work.id, state: "linked" })],
    });

    await setCommercialScopeItemArchived(
      owner,
      workspace.id,
      project.id,
      item.id,
      true,
    );
    await expect(
      getWorkCommercialProvenance(owner, workspace.id, project.id, work.id),
    ).resolves.toMatchObject({
      purpose: "client_delivery",
      state: "commercially_unlinked",
      links: [
        expect.objectContaining({
          scopeItemRevisionId: item.revisionId,
          archivedAt: expect.any(Date),
        }),
      ],
    });
    await expect(
      listWorkItems(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
      }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: work.id, commercialBasisCount: 0 }),
      ],
    });
    await expect(
      listMyWork(owner, workspace.id, { page: 1, pageSize: 50 }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: work.id, commercialBasisCount: 0 }),
      ],
    });
    await expect(
      listCommercialDrift(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
        state: "commercially_unlinked",
      }),
    ).resolves.toMatchObject({
      page: { total: 1 },
      data: [
        expect.objectContaining({
          id: work.id,
          state: "commercially_unlinked",
          basisCount: 0,
        }),
      ],
    });
    await expect(
      listCommercialDrift(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
        state: "linked",
      }),
    ).resolves.toMatchObject({ page: { total: 0 }, data: [] });

    await setCommercialScopeItemArchived(
      owner,
      workspace.id,
      project.id,
      item.id,
      false,
    );
    await expect(
      getWorkCommercialProvenance(owner, workspace.id, project.id, work.id),
    ).resolves.toMatchObject({
      state: "linked",
      links: [
        expect.objectContaining({
          scopeItemRevisionId: item.revisionId,
          archivedAt: null,
        }),
      ],
    });
    await expect(
      listWorkItems(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
      }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: work.id, commercialBasisCount: 1 }),
      ],
    });
    await expect(
      listMyWork(owner, workspace.id, { page: 1, pageSize: 50 }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: work.id, commercialBasisCount: 1 }),
      ],
    });

    await updateWorkPurpose(owner, workspace.id, project.id, work.id, {
      purpose: "delivery_support",
    });
    await expect(
      listCommercialDrift(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
        state: "commercially_unlinked",
      }),
    ).resolves.toMatchObject({ page: { total: 0 } });

    const audits = await db
      .select({ metadata: auditEvents.metadata })
      .from(auditEvents);
    expect(JSON.stringify(audits)).not.toContain(secret);
    expect(JSON.stringify(audits)).not.toContain("Authenticated client portal");
  });

  it("keeps full commercial evidence manager-only and rejects cross-project graph references", async () => {
    const { owner, member, outsider, workspace, project, work } =
      await createFixture();
    const source = await createCommercialSource(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pasted_text",
        name: "Private terms",
        mediaType: "text/plain",
        contentBase64: Buffer.from("Private commercial terms").toString(
          "base64",
        ),
      },
    );
    await expect(
      getCommercialSource(member, workspace.id, project.id, source.id),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      getCommercialSource(outsider, workspace.id, project.id, source.id),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });

    const otherClient = await createClient(owner, workspace.id, {
      name: "Other client",
      internalReference: null,
      summary: null,
    });
    const otherProject = await createProject(owner, workspace.id, {
      clientId: otherClient.id,
      key: "OTHER",
      name: "Other project",
      summary: null,
      leadUserId: owner.userId,
      startDate: null,
      targetDate: null,
    });
    await expect(
      createCommercialBaseline(owner, workspace.id, otherProject.id, {
        sourceId: source.id,
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });

    const baseline = await createCommercialBaseline(
      owner,
      workspace.id,
      project.id,
      { sourceId: source.id },
    );
    const scope = await createCommercialScopeItem(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        revisionIdempotencyKey: randomUUID(),
        baselineVersionId: baseline.versionId,
        kind: "requirement",
        title: "Private requirement",
        details: null,
        anchors: [
          { sourceId: source.id, startOffset: 0, endOffset: 7, label: null },
        ],
      },
    );
    const otherWork = await createWorkItem(
      owner,
      workspace.id,
      otherProject.id,
      workInput("Other project work"),
    );
    await expect(
      createCommercialBasisLink(
        owner,
        workspace.id,
        otherProject.id,
        otherWork.id,
        { scopeItemRevisionId: scope.revisionId },
      ),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(
      listCommercialOverview(member, workspace.id, project.id),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      listCommercialBasisOptions(member, workspace.id, project.id),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      updateWorkPurpose(
        owner,
        workspace.id,
        project.id,
        work.id,
        { purpose: "internal" },
        {
          async assertAllowed() {
            throw new PlatformError(
              "not_entitled",
              403,
              "This operation is not available.",
            );
          },
        },
      ),
    ).rejects.toMatchObject({ code: "not_entitled", status: 403 });
    expect(work.id).toBeTruthy();
  });

  it("keeps request and decision history while only current authorizing decisions cover active work", async () => {
    const { owner, member, workspace, project, work } = await createFixture();
    await updateWorkPurpose(owner, workspace.id, project.id, work.id, {
      purpose: "client_delivery",
    });
    const requestText = "Client asked for a production export workflow.";
    const source = await createCommercialSource(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pasted_text",
        name: "Client request excerpt",
        mediaType: "text/plain",
        contentBase64: Buffer.from(requestText).toString("base64"),
      },
    );
    const requestKey = randomUUID();
    const requestInput = {
      idempotencyKey: requestKey,
      title: "Add export workflow",
      requestText,
      externalRequester: "Product sponsor",
      receivedAt: "2026-08-09T09:30:00.000Z",
      scopeItemIds: [],
      anchors: [
        {
          sourceId: source.id,
          startOffset: 0,
          endOffset: requestText.length,
          label: "Original client language",
        },
      ],
      impact: {
        idempotencyKey: randomUUID(),
        confidence: "estimate" as const,
        effortMinutes: 960,
        scheduleDeltaDays: 3,
        targetDate: null,
        monetaryAmount: "1250.50",
        currencyCode: "USD",
        notes: "Initial planning range",
        anchors: [],
      },
    };
    const created = await createCommercialRequest(
      owner,
      workspace.id,
      project.id,
      requestInput,
    );
    await expect(
      createCommercialRequest(owner, workspace.id, project.id, requestInput),
    ).resolves.toMatchObject({ id: created.id });
    await updateCommercialRequestState(
      owner,
      workspace.id,
      project.id,
      created.id,
      { state: "needs_clarification" },
    );

    const deferredInput = decisionInput("deferred");
    const deferred = await createCommercialDecision(
      owner,
      workspace.id,
      project.id,
      created.id,
      deferredInput,
    );
    expect(deferred).toMatchObject({
      state: "resolved",
      currentDecision: { disposition: "deferred" },
    });
    const deferredId = deferred.currentDecision!.id;
    await expect(
      createCommercialBasisLink(owner, workspace.id, project.id, work.id, {
        basisType: "commercial_decision",
        decisionId: deferredId,
      }),
    ).rejects.toMatchObject({ code: "decision_not_authorizing", status: 409 });

    const paid = await createCommercialDecision(
      owner,
      workspace.id,
      project.id,
      created.id,
      {
        ...decisionInput("paid_change"),
        supersedesDecisionId: deferredId,
        impact: {
          idempotencyKey: randomUUID(),
          confidence: "confirmed",
          effortMinutes: 840,
          scheduleDeltaDays: 2,
          targetDate: "2026-08-21",
          monetaryAmount: "1200.00",
          currencyCode: "USD",
          notes: "Confirmed change order",
          anchors: [],
        },
      },
    );
    const paidId = paid.currentDecision!.id;
    await createCommercialBasisLink(owner, workspace.id, project.id, work.id, {
      basisType: "commercial_decision",
      decisionId: paidId,
    });
    await expect(
      getWorkCommercialProvenance(owner, workspace.id, project.id, work.id),
    ).resolves.toMatchObject({
      state: "linked",
      links: [
        expect.objectContaining({
          basisType: "commercial_decision",
          decisionId: paidId,
          requestTitle: "Add export workflow",
          effective: true,
          contradiction: false,
        }),
      ],
    });
    await expect(
      listMyWork(owner, workspace.id, { page: 1, pageSize: 50 }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: work.id, commercialBasisCount: 1 }),
      ],
    });

    const rejected = await createCommercialDecision(
      owner,
      workspace.id,
      project.id,
      created.id,
      {
        ...decisionInput("rejected"),
        supersedesDecisionId: paidId,
      },
    );
    expect(rejected.currentDecision).toMatchObject({ disposition: "rejected" });
    await expect(
      createCommercialDecision(
        owner,
        workspace.id,
        project.id,
        created.id,
        deferredInput,
      ),
    ).resolves.toMatchObject({
      currentDecision: {
        id: rejected.currentDecision!.id,
        disposition: "rejected",
      },
    });
    await expect(
      getWorkCommercialProvenance(owner, workspace.id, project.id, work.id),
    ).resolves.toMatchObject({
      state: "commercially_unlinked",
      links: [
        expect.objectContaining({
          decisionId: paidId,
          effective: false,
          contradiction: true,
          decisionSupersededAt: expect.any(Date),
        }),
      ],
    });
    await expect(
      listCommercialDrift(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
        state: "commercially_unlinked",
      }),
    ).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          id: work.id,
          state: "commercially_unlinked",
          basisCount: 0,
        }),
      ],
    });
    const history = await getCommercialRequest(
      owner,
      workspace.id,
      project.id,
      created.id,
    );
    expect(history.decisionHistory).toHaveLength(3);
    expect(history.decisionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: owner.userId,
          actorName: "Owner",
        }),
      ]),
    );
    expect(history.anchors).toEqual([
      expect.objectContaining({
        sourceId: source.id,
        startOffset: 0,
        endOffset: requestText.length,
      }),
    ]);
    expect(history.impacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          confidence: "estimate",
          monetaryAmount: "1250.50",
          currencyCode: "USD",
        }),
        expect.objectContaining({
          confidence: "confirmed",
          monetaryAmount: "1200.00",
          currencyCode: "USD",
        }),
      ]),
    );
    const estimatedImpact = history.impacts.find(
      (impact) => impact.confidence === "estimate",
    );
    const confirmedImpact = history.impacts.find(
      (impact) => impact.confidence === "confirmed",
    );
    expect(confirmedImpact?.supersedesImpactAssessmentId).toBe(
      estimatedImpact?.id,
    );
    expect(history.contradictionCount).toBe(1);
    await expect(
      listCommercialRequests(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      data: [
        expect.objectContaining({ id: created.id, contradictionCount: 1 }),
      ],
    });
    await expect(
      getCommercialRequest(member, workspace.id, project.id, created.id),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });

    const audits = await db
      .select({ metadata: auditEvents.metadata })
      .from(auditEvents);
    const auditJson = JSON.stringify(audits);
    expect(auditJson).not.toContain(requestInput.requestText);
    expect(auditJson).not.toContain("Confirmed change order");
  });

  it("persists all six outcomes and exposes only the four authorizing decisions as work bases", async () => {
    const { owner, workspace, project, work } = await createFixture();
    const sourceText =
      "Current commitment available for an explicit scope swap.";
    const source = await createCommercialSource(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pasted_text",
        name: "Current scope",
        mediaType: "text/plain",
        contentBase64: Buffer.from(sourceText).toString("base64"),
      },
    );
    const baseline = await createCommercialBaseline(
      owner,
      workspace.id,
      project.id,
      { sourceId: source.id },
    );
    const offsetScope = await createCommercialScopeItem(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        revisionIdempotencyKey: randomUUID(),
        baselineVersionId: baseline.versionId,
        kind: "deliverable",
        title: "Current export commitment",
        details: null,
        anchors: [
          {
            sourceId: source.id,
            startOffset: 0,
            endOffset: sourceText.length,
            label: null,
          },
        ],
      },
    );
    const decisions: Array<{ disposition: string; id: string }> = [];
    for (const disposition of [
      "covered",
      "absorbed",
      "swap",
      "paid_change",
      "deferred",
      "rejected",
    ] as const) {
      const request = await createCommercialRequest(
        owner,
        workspace.id,
        project.id,
        {
          idempotencyKey: randomUUID(),
          title: `${disposition} request`,
          requestText: `Commercial question for ${disposition}.`,
          externalRequester: null,
          receivedAt: "2026-08-09T10:00:00.000Z",
          scopeItemIds: [],
          anchors: [],
          impact: null,
        },
      );
      const decided = await createCommercialDecision(
        owner,
        workspace.id,
        project.id,
        request.id,
        {
          ...decisionInput(disposition),
          coverageBasis: disposition === "covered" ? "baseline" : null,
          swapOffsetScopeItemIds:
            disposition === "swap" ? [offsetScope.id] : [],
        },
      );
      decisions.push({ disposition, id: decided.currentDecision!.id });
    }

    const options = await listCommercialBasisOptions(
      owner,
      workspace.id,
      project.id,
    );
    const decisionOptions = options.filter(
      (option) => option.basisType === "commercial_decision",
    );
    expect(decisionOptions).toHaveLength(4);
    expect(decisionOptions).toEqual(
      expect.arrayContaining(
        decisions
          .filter(({ disposition }) =>
            ["covered", "absorbed", "swap", "paid_change"].includes(
              disposition,
            ),
          )
          .map(({ id }) => expect.objectContaining({ decisionId: id })),
      ),
    );
    expect(decisionOptions.map((option) => option.disposition).sort()).toEqual([
      "absorbed",
      "covered",
      "paid_change",
      "swap",
    ]);
    for (const disposition of ["deferred", "rejected"] as const) {
      const decision = decisions.find(
        (candidate) => candidate.disposition === disposition,
      )!;
      await expect(
        createCommercialBasisLink(owner, workspace.id, project.id, work.id, {
          basisType: "commercial_decision",
          decisionId: decision.id,
        }),
      ).rejects.toMatchObject({
        code: "decision_not_authorizing",
        status: 409,
      });
    }
  });

  it("blocks cross-project and cross-tenant request, decision, impact and work links", async () => {
    const { owner, workspace, project } = await createFixture();
    const stranger = await createUser("stranger@example.test", "Stranger");
    const request = await createCommercialRequest(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        title: "Project-bound request",
        requestText: "This request belongs only to COM.",
        externalRequester: null,
        receivedAt: "2026-08-09T10:30:00.000Z",
        scopeItemIds: [],
        anchors: [],
        impact: null,
      },
    );
    const decided = await createCommercialDecision(
      owner,
      workspace.id,
      project.id,
      request.id,
      decisionInput("paid_change"),
    );
    await expect(
      getCommercialRequest(stranger, workspace.id, project.id, request.id),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });

    const otherClient = await createClient(owner, workspace.id, {
      name: "Second client",
      internalReference: null,
      summary: null,
    });
    const otherProject = await createProject(owner, workspace.id, {
      clientId: otherClient.id,
      key: "BOUND",
      name: "Second project",
      summary: null,
      leadUserId: owner.userId,
      startDate: null,
      targetDate: null,
    });
    const otherWork = await createWorkItem(
      owner,
      workspace.id,
      otherProject.id,
      workInput("Other project work"),
    );
    await expect(
      getCommercialRequest(owner, workspace.id, otherProject.id, request.id),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(
      createCommercialImpactAssessment(
        owner,
        workspace.id,
        otherProject.id,
        request.id,
        {
          idempotencyKey: randomUUID(),
          decisionId: decided.currentDecision!.id,
          supersedesImpactAssessmentId: null,
          confidence: "estimate",
          effortMinutes: 60,
          scheduleDeltaDays: null,
          targetDate: null,
          monetaryAmount: null,
          currencyCode: null,
          notes: null,
          anchors: [],
        },
      ),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(
      createCommercialBasisLink(
        owner,
        workspace.id,
        otherProject.id,
        otherWork.id,
        {
          basisType: "commercial_decision",
          decisionId: decided.currentDecision!.id,
        },
      ),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("persists recoverable parser failure without allowing a trusted baseline", async () => {
    const { owner, workspace, project } = await createFixture();
    const malformed = Buffer.from("%PDF-not-a-document");
    const source = await createCommercialSource(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pdf",
        name: "malformed.pdf",
        mediaType: "application/pdf",
        contentBase64: malformed.toString("base64"),
      },
    );
    expect(source).toMatchObject({ parseState: "failed" });
    await expect(
      createCommercialBaseline(owner, workspace.id, project.id, {
        sourceId: source.id,
      }),
    ).rejects.toMatchObject({ code: "source_not_ready", status: 409 });
    const stored = await db
      .select({ original: commercialEvidenceSources.originalContent })
      .from(commercialEvidenceSources)
      .where(eq(commercialEvidenceSources.id, source.id));
    expect(stored[0]?.original.equals(malformed)).toBe(true);
  });
});

async function createFixture() {
  const owner = await createUser("owner@example.test", "Owner");
  const member = await createUser("member@example.test", "Member");
  const outsider = await createUser("outsider@example.test", "Outsider");
  const workspace = await createWorkspace(owner, { name: "Commercial" });
  await db.insert(memberships).values([
    {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: member.userId,
      role: "member",
    },
    {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: outsider.userId,
      role: "member",
    },
  ]);
  const client = await createClient(owner, workspace.id, {
    name: "Client",
    internalReference: null,
    summary: null,
  });
  const project = await createProject(owner, workspace.id, {
    clientId: client.id,
    key: "COM",
    name: "Commercial project",
    summary: null,
    leadUserId: owner.userId,
    startDate: null,
    targetDate: null,
  });
  await db.insert(projectMemberships).values({
    projectId: project.id,
    workspaceId: workspace.id,
    userId: member.userId,
    addedByUserId: owner.userId,
  });
  const work = await createWorkItem(
    owner,
    workspace.id,
    project.id,
    workInput("Build client portal", owner.userId),
  );
  return { owner, member, outsider, workspace, project, work };
}

function workInput(title: string, assigneeUserId: string | null = null) {
  return {
    title,
    description: null,
    acceptanceCriteria: null,
    status: "in_progress" as const,
    priority: "high" as const,
    assigneeUserId,
    estimatePoints: null,
    targetDate: null,
    milestoneId: null,
    cycleId: null,
    parentId: null,
    labelIds: [],
  };
}

function decisionInput(
  disposition:
    "covered" | "absorbed" | "swap" | "paid_change" | "deferred" | "rejected",
) {
  return {
    idempotencyKey: randomUUID(),
    disposition,
    coverageBasis: disposition === "covered" ? ("baseline" as const) : null,
    rationale: null,
    supersedesDecisionId: null,
    affectedScopeItemIds: [],
    swapOffsetScopeItemIds: [],
    anchors: [],
    impact: null,
  };
}

async function createUser(email: string, name: string) {
  const userId = randomUUID();
  await db
    .insert(users)
    .values({ id: userId, email, name, emailVerified: true });
  return { userId, email };
}
