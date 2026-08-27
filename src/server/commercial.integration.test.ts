import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb, getPool } from "@/db";
import { PlatformError } from "@/lib/platform-errors";
import {
  activateCommercialBaselineVersion,
  createCommercialAmendment,
  listCommercialHistory,
} from "@/server/commercial-amendments";
import {
  auditEvents,
  commercialBasisLinks,
  commercialDecisions,
  commercialEvidenceSources,
  commercialImpactAssessments,
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
  getWorkItem,
  listMyWork,
  listWorkItems,
  updateWorkItem,
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
    expect(baseline).toMatchObject({
      versionNumber: null,
      state: "draft",
      sourceId: source.id,
    });
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
    const effectiveBaseline = await activateCommercialBaselineVersion(
      owner,
      workspace.id,
      project.id,
      baseline.versionId,
      {},
    );
    expect(effectiveBaseline).toMatchObject({
      versionNumber: 1,
      state: "effective",
    });
    await createCommercialBasisLink(owner, workspace.id, project.id, work.id, {
      scopeItemRevisionId: revised.revisionId,
    });
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
        scopeItemRevisionId: revised.revisionId,
        revisionNumber: 2,
        title: "Authenticated client portal with SSO",
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

    await expect(
      setCommercialScopeItemArchived(
        owner,
        workspace.id,
        project.id,
        item.id,
        true,
      ),
    ).rejects.toMatchObject({
      code: "baseline_version_immutable",
      status: 409,
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

  it("activates an amendment with explicit scope lineage and marks only active revised work stale", async () => {
    const { owner, workspace, project, work } = await createFixture();
    const firstText =
      "Build portal. Keep audit export. Retain legacy dashboard support.";
    const firstSource = await createCommercialSource(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pasted_text",
        name: "Original SOW",
        mediaType: "text/plain",
        contentBase64: Buffer.from(firstText).toString("base64"),
      },
    );
    const firstVersion = await createCommercialBaseline(
      owner,
      workspace.id,
      project.id,
      { sourceId: firstSource.id },
    );
    const createScope = (title: string) =>
      createCommercialScopeItem(owner, workspace.id, project.id, {
        idempotencyKey: randomUUID(),
        revisionIdempotencyKey: randomUUID(),
        baselineVersionId: firstVersion.versionId,
        kind: "deliverable",
        title,
        details: null,
        anchors: [
          {
            sourceId: firstSource.id,
            startOffset: 0,
            endOffset: firstText.length,
            label: "Original scope",
          },
        ],
      });
    const [revisedBasis, carriedBasis, retiredBasis] = await Promise.all([
      createScope("Client portal"),
      createScope("Audit export"),
      createScope("Legacy dashboard support"),
    ]);
    await activateCommercialBaselineVersion(
      owner,
      workspace.id,
      project.id,
      firstVersion.versionId,
      {},
    );
    await updateWorkPurpose(owner, workspace.id, project.id, work.id, {
      purpose: "client_delivery",
    });
    await createCommercialBasisLink(owner, workspace.id, project.id, work.id, {
      scopeItemRevisionId: revisedBasis.revisionId,
    });
    const carriedWork = await createWorkItem(
      owner,
      workspace.id,
      project.id,
      workInput("Deliver audit export"),
    );
    await updateWorkPurpose(owner, workspace.id, project.id, carriedWork.id, {
      purpose: "client_delivery",
    });
    await createCommercialBasisLink(
      owner,
      workspace.id,
      project.id,
      carriedWork.id,
      { scopeItemRevisionId: carriedBasis.revisionId },
    );
    const completedWork = await createWorkItem(
      owner,
      workspace.id,
      project.id,
      workInput("Complete legacy dashboard support", owner.userId),
    );
    await updateWorkPurpose(owner, workspace.id, project.id, completedWork.id, {
      purpose: "client_delivery",
    });
    await createCommercialBasisLink(
      owner,
      workspace.id,
      project.id,
      completedWork.id,
      { scopeItemRevisionId: retiredBasis.revisionId },
    );
    await updateWorkItem(owner, workspace.id, project.id, completedWork.id, {
      status: "done",
    });
    const canceledWork = await createWorkItem(
      owner,
      workspace.id,
      project.id,
      workInput("Cancel legacy dashboard support", owner.userId),
    );
    await updateWorkPurpose(owner, workspace.id, project.id, canceledWork.id, {
      purpose: "client_delivery",
    });
    await createCommercialBasisLink(
      owner,
      workspace.id,
      project.id,
      canceledWork.id,
      { scopeItemRevisionId: retiredBasis.revisionId },
    );
    await updateWorkItem(owner, workspace.id, project.id, canceledWork.id, {
      status: "canceled",
    });

    const amendmentText =
      "Portal includes SSO. Audit export is unchanged. Legacy dashboard support is retired. Add launch training.";
    const amendmentSource = await createCommercialSource(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pasted_text",
        name: "Signed amendment",
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
        label: "SSO and launch amendment",
        decisionIds: [],
      },
    );
    const draft = await listCommercialOverview(owner, workspace.id, project.id);
    const revisedCopy = draft.scopeItems.find(
      (item) => item.title === "Client portal",
    )!;
    const retiredCopy = draft.scopeItems.find(
      (item) => item.title === "Legacy dashboard support",
    )!;
    const carriedCopy = draft.scopeItems.find(
      (item) => item.title === "Audit export",
    )!;
    const revised = await updateCommercialScopeItem(
      owner,
      workspace.id,
      project.id,
      revisedCopy.id,
      {
        idempotencyKey: randomUUID(),
        kind: "deliverable",
        title: "Client portal with SSO",
        details: null,
        anchors: [
          {
            sourceId: amendmentSource.id,
            startOffset: 0,
            endOffset: "Portal includes SSO.".length,
            label: "Revised deliverable",
          },
        ],
      },
    );
    await setCommercialScopeItemArchived(
      owner,
      workspace.id,
      project.id,
      retiredCopy.id,
      true,
    );
    await createCommercialScopeItem(owner, workspace.id, project.id, {
      idempotencyKey: randomUUID(),
      revisionIdempotencyKey: randomUUID(),
      baselineVersionId: amendment.id,
      kind: "deliverable",
      title: "Launch training",
      details: null,
      anchors: [
        {
          sourceId: amendmentSource.id,
          startOffset: amendmentText.indexOf("Add launch training"),
          endOffset:
            amendmentText.indexOf("Add launch training") +
            "Add launch training".length,
          label: "Added deliverable",
        },
      ],
    });
    await activateCommercialBaselineVersion(
      owner,
      workspace.id,
      project.id,
      amendment.id,
      {},
    );

    await expect(
      getWorkCommercialProvenance(owner, workspace.id, project.id, work.id),
    ).resolves.toMatchObject({
      state: "stale_basis",
      links: [expect.objectContaining({ stale: true, effective: false })],
    });
    await expect(
      getWorkCommercialProvenance(
        owner,
        workspace.id,
        project.id,
        carriedWork.id,
      ),
    ).resolves.toMatchObject({
      state: "linked",
      links: [expect.objectContaining({ stale: false, effective: true })],
    });
    await expect(
      getWorkCommercialProvenance(
        owner,
        workspace.id,
        project.id,
        completedWork.id,
      ),
    ).resolves.toMatchObject({
      links: [
        expect.objectContaining({
          title: "Legacy dashboard support",
          stale: false,
        }),
      ],
    });
    await expect(
      listCommercialDrift(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
        state: "stale_basis",
      }),
    ).resolves.toMatchObject({
      data: [expect.objectContaining({ id: work.id, staleBasisCount: 1 })],
    });
    await expect(
      listWorkItems(owner, workspace.id, project.id, {
        page: 1,
        pageSize: 50,
      }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: work.id,
          commercialStaleBasisCount: 1,
        }),
        expect.objectContaining({
          id: completedWork.id,
          commercialHistoricalBasisCount: 1,
          commercialStaleBasisCount: 0,
        }),
        expect.objectContaining({
          id: canceledWork.id,
          commercialHistoricalBasisCount: 1,
          commercialStaleBasisCount: 0,
        }),
      ]),
    });
    await expect(
      listMyWork(owner, workspace.id, {
        page: 1,
        pageSize: 50,
      }),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: work.id,
          commercialStaleBasisCount: 1,
        }),
      ]),
    });
    await expect(
      listMyWork(owner, workspace.id, {
        page: 1,
        pageSize: 50,
        status: "done",
      }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          id: completedWork.id,
          commercialHistoricalBasisCount: 1,
          commercialStaleBasisCount: 0,
        }),
      ],
    });
    await expect(
      listMyWork(owner, workspace.id, {
        page: 1,
        pageSize: 50,
        status: "canceled",
      }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          id: canceledWork.id,
          commercialHistoricalBasisCount: 1,
          commercialStaleBasisCount: 0,
        }),
      ],
    });
    await expect(
      getWorkItem(owner, workspace.id, project.id, completedWork.id),
    ).resolves.toMatchObject({
      commercialHistoricalBasisCount: 1,
      commercialStaleBasisCount: 0,
    });
    await expect(
      getWorkItem(owner, workspace.id, project.id, canceledWork.id),
    ).resolves.toMatchObject({
      commercialHistoricalBasisCount: 1,
      commercialStaleBasisCount: 0,
    });
    await createCommercialBasisLink(owner, workspace.id, project.id, work.id, {
      scopeItemRevisionId: revised.revisionId,
    });
    await expect(
      getWorkCommercialProvenance(owner, workspace.id, project.id, work.id),
    ).resolves.toMatchObject({ state: "linked" });

    const history = await listCommercialHistory(
      owner,
      workspace.id,
      project.id,
      { page: 1, pageSize: 10 },
    );
    expect(history.data).toEqual([
      expect.objectContaining({
        versionNumber: 2,
        state: "effective",
        lineage: expect.objectContaining({
          carried_forward: 1,
          revised: 1,
          retired: 1,
          added: 1,
        }),
      }),
      expect.objectContaining({ versionNumber: 1, state: "superseded" }),
    ]);
    expect(history.data[0]?.sources).toHaveLength(2);
    expect(history.data[0]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Client portal with SSO",
          lineageKind: "revised",
          workLinks: 1,
        }),
      ]),
    );
    expect(history.data[1]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Legacy dashboard support",
          workLinks: 2,
        }),
      ]),
    );
    expect(carriedCopy.lineageKind).toBe("carried_forward");
  });

  it("serializes competing activations and leaves the effective baseline intact after parser failure", async () => {
    const { owner, workspace, project } = await createFixture();
    const source = await createCommercialSource(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pasted_text",
        name: "Initial terms",
        mediaType: "text/plain",
        contentBase64: Buffer.from("Initial deliverable").toString("base64"),
      },
    );
    const initial = await createCommercialBaseline(
      owner,
      workspace.id,
      project.id,
      { sourceId: source.id },
    );
    await createCommercialScopeItem(owner, workspace.id, project.id, {
      idempotencyKey: randomUUID(),
      revisionIdempotencyKey: randomUUID(),
      baselineVersionId: initial.versionId,
      kind: "deliverable",
      title: "Initial deliverable",
      details: null,
      anchors: [
        { sourceId: source.id, startOffset: 0, endOffset: 19, label: null },
      ],
    });
    await activateCommercialBaselineVersion(
      owner,
      workspace.id,
      project.id,
      initial.versionId,
      {},
    );
    const failedSource = await createCommercialSource(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pdf",
        name: "Unreadable amendment.pdf",
        mediaType: "application/pdf",
        contentBase64: Buffer.from("%PDF-not-a-document").toString("base64"),
      },
    );
    expect(failedSource.parseState).toBe("failed");
    await expect(
      createCommercialAmendment(owner, workspace.id, project.id, {
        sourceId: failedSource.id,
        label: "Unreadable amendment",
        decisionIds: [],
      }),
    ).rejects.toMatchObject({ code: "source_not_ready", status: 409 });
    await expect(
      listCommercialOverview(owner, workspace.id, project.id),
    ).resolves.toMatchObject({
      baseline: { versionNumber: 1, state: "effective" },
    });

    const amendmentSource = await createCommercialSource(
      owner,
      workspace.id,
      project.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pasted_text",
        name: "Readable amendment",
        mediaType: "text/plain",
        contentBase64: Buffer.from("No material change").toString("base64"),
      },
    );
    const firstDraft = await createCommercialAmendment(
      owner,
      workspace.id,
      project.id,
      {
        sourceId: amendmentSource.id,
        label: "Concurrent activation amendment",
        decisionIds: [],
      },
    );
    await expect(
      createCommercialAmendment(owner, workspace.id, project.id, {
        sourceId: amendmentSource.id,
        label: "Competing amendment",
        decisionIds: [],
      }),
    ).rejects.toMatchObject({ code: "baseline_draft_exists", status: 409 });
    await expect(
      activateCommercialBaselineVersion(
        owner,
        workspace.id,
        project.id,
        firstDraft.id,
        { effectiveAt: "2020-01-01T00:00:00.000Z" },
      ),
    ).rejects.toMatchObject({
      code: "baseline_effective_time_order",
      status: 409,
    });
    const results = await Promise.allSettled([
      activateCommercialBaselineVersion(
        owner,
        workspace.id,
        project.id,
        firstDraft.id,
        {},
      ),
      activateCommercialBaselineVersion(
        owner,
        workspace.id,
        project.id,
        firstDraft.id,
        {},
      ),
    ]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const overview = await listCommercialOverview(
      owner,
      workspace.id,
      project.id,
    );
    expect(
      overview.baseline?.versions.filter(
        (version) => version.state === "effective",
      ),
    ).toHaveLength(1);
  });

  it("keeps full commercial evidence manager-only and rejects cross-project graph references", async () => {
    const { owner, member, outsider, workspace, project, work } =
      await createFixture();
    await expect(
      listCommercialDrift(member, workspace.id, project.id, {
        page: 1,
        pageSize: 5,
      }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      listCommercialDrift(outsider, workspace.id, project.id, {
        page: 1,
        pageSize: 5,
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
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
    await activateCommercialBaselineVersion(
      owner,
      workspace.id,
      project.id,
      baseline.versionId,
      {},
    );
    const otherSource = await createCommercialSource(
      owner,
      workspace.id,
      otherProject.id,
      {
        idempotencyKey: randomUUID(),
        kind: "pasted_text",
        name: "Other project amendment",
        mediaType: "text/plain",
        contentBase64: Buffer.from("Other project terms").toString("base64"),
      },
    );
    await expect(
      createCommercialAmendment(owner, workspace.id, project.id, {
        sourceId: otherSource.id,
        label: "Cross-project amendment",
        decisionIds: [],
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    const otherWork = await createWorkItem(
      owner,
      workspace.id,
      otherProject.id,
      workInput("Other project work"),
    );
    const primaryDrift = await listCommercialDrift(
      owner,
      workspace.id,
      project.id,
      { page: 1, pageSize: 50 },
    );
    expect(primaryDrift.data.map((item) => item.id)).not.toContain(
      otherWork.id,
    );
    await expect(
      listCommercialDrift(owner, workspace.id, otherProject.id, {
        page: 1,
        pageSize: 50,
      }),
    ).resolves.toMatchObject({
      data: [expect.objectContaining({ id: otherWork.id })],
    });

    const outsiderWorkspace = await createWorkspace(outsider, {
      name: "Separate commercial tenant",
    });
    const outsiderClient = await createClient(outsider, outsiderWorkspace.id, {
      name: "Separate client",
      internalReference: null,
      summary: null,
    });
    const outsiderProject = await createProject(
      outsider,
      outsiderWorkspace.id,
      {
        clientId: outsiderClient.id,
        key: "SEP",
        name: "Separate project",
        summary: null,
        leadUserId: outsider.userId,
        startDate: null,
        targetDate: null,
      },
    );
    await expect(
      listCommercialDrift(owner, workspace.id, outsiderProject.id, {
        page: 1,
        pageSize: 5,
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
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
    const impacted = await createCommercialImpactAssessment(
      owner,
      workspace.id,
      project.id,
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
    );
    const projectImpact = impacted.impacts.at(-1)!;
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
    const otherRequest = await createCommercialRequest(
      owner,
      workspace.id,
      otherProject.id,
      {
        idempotencyKey: randomUUID(),
        title: "Other project request",
        requestText: "This request belongs only to BOUND.",
        externalRequester: null,
        receivedAt: "2026-08-09T10:35:00.000Z",
        scopeItemIds: [],
        anchors: [],
        impact: null,
      },
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

    await expect(
      db.insert(commercialDecisions).values({
        projectId: otherProject.id,
        requestId: otherRequest.id,
        idempotencyKey: randomUUID(),
        disposition: "paid_change",
        coverageBasis: null,
        rationale: null,
        supersedesDecisionId: decided.currentDecision!.id,
        confirmedAt: new Date("2026-08-09T10:40:00.000Z"),
        createdByUserId: owner.userId,
      }),
    ).rejects.toMatchObject({
      cause: {
        code: "23503",
        constraint: "commercial_decisions_supersedes_project_fk",
      },
    });
    await expect(
      db.insert(commercialImpactAssessments).values({
        projectId: otherProject.id,
        requestId: otherRequest.id,
        decisionId: null,
        idempotencyKey: randomUUID(),
        confidence: "estimate",
        effortMinutes: 30,
        scheduleDeltaDays: null,
        targetDate: null,
        monetaryAmount: null,
        currencyCode: null,
        notes: null,
        supersedesImpactAssessmentId: projectImpact.id,
        createdByUserId: owner.userId,
      }),
    ).rejects.toMatchObject({
      cause: {
        code: "23503",
        constraint: "commercial_impacts_supersedes_project_fk",
      },
    });
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
