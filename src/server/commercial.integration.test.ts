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
        commercial_basis_links,
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

async function createUser(email: string, name: string) {
  const userId = randomUUID();
  await db
    .insert(users)
    .values({ id: userId, email, name, emailVerified: true });
  return { userId, email };
}
