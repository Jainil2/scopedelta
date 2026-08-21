import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { and, count, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb, getPool } from "@/db";
import {
  memberships,
  migrationImportRows,
  migrationImportSessionIdentities,
  migrationSourceIdentities,
  migrationSourceObjects,
  projectLabels,
  projectTemplateApplications,
  projects,
  projectTemplates,
  users,
  workItemLabels,
  workItems,
  type ProjectTemplateDefinition,
} from "@/db/schema";
import {
  applyProjectTemplate,
  confirmImport,
  createImportPreview,
  createProjectTemplate,
  exportDeliveryCore,
  getImportSession,
  updateProjectTemplate,
} from "@/server/adoption";
import { createClient } from "@/server/delivery";
import { createWorkspace } from "@/server/workspaces";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!/scopedelta_test(?:\?|$)/.test(databaseUrl)) {
  throw new Error(
    "Integration tests require a dedicated scopedelta_test database.",
  );
}

const db = getDb();

describe("template and migration adoption boundary", () => {
  beforeEach(async () => {
    await db.execute(sql`truncate table users, workspaces cascade`);
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("applies immutable template snapshots while later versions affect only new projects", async () => {
    const fixture = await createFixture();
    const template = await createProjectTemplate(
      fixture.admin,
      fixture.workspace.id,
      {
        name: "Agency launch",
        description: "Repeatable launch shape",
        definition: templateDefinition("Original acceptance"),
      },
    );
    const firstProject = await applyProjectTemplate(
      fixture.admin,
      fixture.workspace.id,
      {
        templateId: template.id,
        clientId: fixture.client.id,
        key: "FIRST",
        name: "First launch",
        summary: null,
        leadUserId: fixture.member.userId,
        startDate: "2026-08-24",
        targetDate: "2026-10-01",
      },
    );
    await updateProjectTemplate(
      fixture.owner,
      fixture.workspace.id,
      template.id,
      {
        definition: templateDefinition("Revised acceptance"),
      },
    );
    const secondProject = await applyProjectTemplate(
      fixture.owner,
      fixture.workspace.id,
      {
        templateId: template.id,
        clientId: fixture.client.id,
        key: "SECOND",
        name: "Second launch",
        summary: null,
        leadUserId: fixture.owner.userId,
        startDate: "2026-09-07",
        targetDate: null,
      },
    );

    const [firstWork, secondWork, applications, persistedTemplate] =
      await Promise.all([
        db
          .select()
          .from(workItems)
          .where(eq(workItems.projectId, firstProject.id)),
        db
          .select()
          .from(workItems)
          .where(eq(workItems.projectId, secondProject.id)),
        db.select().from(projectTemplateApplications),
        db
          .select()
          .from(projectTemplates)
          .where(eq(projectTemplates.id, template.id)),
      ]);
    expect(firstWork).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ acceptanceCriteria: "Original acceptance" }),
      ]),
    );
    expect(secondWork).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ acceptanceCriteria: "Revised acceptance" }),
      ]),
    );
    expect(
      applications.map((application) => application.templateVersion).sort(),
    ).toEqual([1, 2]);
    expect(
      applications.find(
        (application) => application.projectId === firstProject.id,
      )?.snapshot.workItems[0].acceptanceCriteria,
    ).toBe("Original acceptance");
    expect(persistedTemplate[0].version).toBe(2);

    await expect(
      createProjectTemplate(fixture.member, fixture.workspace.id, {
        name: "Forbidden",
        description: null,
        definition: templateDefinition("No"),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const outsider = await createUser("outsider@example.test", "Outsider");
    await expect(
      applyProjectTemplate(outsider, fixture.workspace.id, {
        templateId: template.id,
        clientId: fixture.client.id,
        key: "OUT",
        name: "Outside",
        summary: null,
        leadUserId: fixture.owner.userId,
        startDate: null,
        targetDate: null,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("requires a start date for milestone and work-item offsets without cycles", async () => {
    const fixture = await createFixture();
    const definition = templateDefinition("Accepted");
    definition.cycles = [];
    definition.workItems[0].cycleRef = null;
    const template = await createProjectTemplate(
      fixture.owner,
      fixture.workspace.id,
      {
        name: "Offset-only template",
        description: null,
        definition,
      },
    );

    await expect(
      applyProjectTemplate(fixture.owner, fixture.workspace.id, {
        templateId: template.id,
        clientId: fixture.client.id,
        key: "OFFSET",
        name: "Offset project",
        summary: null,
        leadUserId: fixture.member.userId,
        startDate: null,
        targetDate: null,
      }),
    ).rejects.toMatchObject({ code: "template_date_start_required" });
  });

  it("applies a bypass-created template with one canonical case-insensitive label", async () => {
    const fixture = await createFixture();
    const definition = templateDefinition("Accepted");
    definition.workItems[0].labels = ["Bug", "bug", "BUG"];
    const template = await createProjectTemplate(
      fixture.owner,
      fixture.workspace.id,
      {
        name: "Canonical labels",
        description: null,
        definition,
      },
    );
    const project = await applyProjectTemplate(
      fixture.owner,
      fixture.workspace.id,
      {
        templateId: template.id,
        clientId: fixture.client.id,
        key: "LABELS",
        name: "Canonical labels",
        summary: null,
        leadUserId: fixture.member.userId,
        startDate: "2026-08-24",
        targetDate: null,
      },
    );

    expect(
      await db
        .select({ name: projectLabels.name })
        .from(projectLabels)
        .where(eq(projectLabels.projectId, project.id)),
    ).toEqual([{ name: "Bug" }]);
    expect(
      await db
        .select({ total: count() })
        .from(workItemLabels)
        .where(eq(workItemLabels.projectId, project.id)),
    ).toEqual([{ total: 1 }]);
  });

  it("previews without delivery mutation, imports parent-after-child safely, and retries idempotently", async () => {
    const fixture = await createFixture();
    const before = await db.select({ total: count() }).from(projects);
    const preview = await createImportPreview(
      fixture.admin,
      fixture.workspace.id,
      jiraPreviewInput(
        readFileSync("fixtures/migration/jira-active-project.csv", "utf8"),
      ),
    );
    const afterPreview = await db.select({ total: count() }).from(projects);
    expect(afterPreview).toEqual(before);
    expect(preview.state).toBe("preview_ready");
    expect(preview.unsupportedColumns).toEqual(["Custom contract note"]);
    expect(preview.identities).toHaveLength(2);

    const completed = await confirmImport(
      fixture.admin,
      fixture.workspace.id,
      preview.id,
      { duplicateStrategy: "skip_existing", identityMappings: {} },
    );
    expect(completed).toMatchObject({
      state: "completed",
      createdProjects: 1,
      createdWorkItems: 2,
      skippedRows: 0,
      committedAnything: true,
    });
    const importedProject = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, fixture.workspace.id),
          eq(projects.key, "WEB"),
        ),
      );
    const importedWork = await db
      .select()
      .from(workItems)
      .where(eq(workItems.projectId, importedProject[0].id));
    const parent = importedWork.find(
      (work) => work.title === "Delivery shell",
    )!;
    expect(
      importedWork.find((work) => work.title === "Responsive child"),
    ).toMatchObject({
      parentId: parent.id,
      assigneeUserId: null,
    });
    expect(
      await db
        .select()
        .from(memberships)
        .where(eq(memberships.workspaceId, fixture.workspace.id)),
    ).toHaveLength(3);
    expect(
      await db
        .select()
        .from(migrationSourceIdentities)
        .where(eq(migrationSourceIdentities.workspaceId, fixture.workspace.id)),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identityKey: "email:missing@example.test",
          mappedUserId: null,
        }),
      ]),
    );

    const retry = await confirmImport(
      fixture.owner,
      fixture.workspace.id,
      preview.id,
      { duplicateStrategy: "skip_existing", identityMappings: {} },
    );
    expect(retry.createdWorkItems).toBe(2);
    expect(
      await db
        .select({ total: count() })
        .from(workItems)
        .where(eq(workItems.projectId, importedProject[0].id)),
    ).toEqual([{ total: 2 }]);

    const replayPreview = await createImportPreview(
      fixture.owner,
      fixture.workspace.id,
      jiraPreviewInput(
        "Project key,Project name,Issue key,Summary,Status\nWEB,Website,WEB-1,Changed title,Open",
      ),
    );
    expect(replayPreview.rows[0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "source_already_imported" }),
      ]),
    );
    const replay = await confirmImport(
      fixture.owner,
      fixture.workspace.id,
      replayPreview.id,
      { duplicateStrategy: "skip_existing", identityMappings: {} },
    );
    expect(replay).toMatchObject({ createdWorkItems: 0, skippedRows: 1 });
  });

  it("deduplicates exact no-key file retries without colliding across batches", async () => {
    const fixture = await createFixture();
    const firstCsv =
      "Project,Project name,Title\nNOKEY,No-key project,First batch item";
    const secondCsv =
      "Project,Project name,Title\nNOKEY,No-key project,Second batch item";

    const firstPreview = await createImportPreview(
      fixture.owner,
      fixture.workspace.id,
      genericNoKeyPreviewInput(firstCsv),
    );
    const first = await confirmImport(
      fixture.owner,
      fixture.workspace.id,
      firstPreview.id,
      { duplicateStrategy: "skip_existing", identityMappings: {} },
    );
    expect(first).toMatchObject({ createdWorkItems: 1, skippedRows: 0 });

    const retryPreview = await createImportPreview(
      fixture.admin,
      fixture.workspace.id,
      genericNoKeyPreviewInput(firstCsv),
    );
    expect(retryPreview.rows[0].sourceObjectKey).toBe(
      firstPreview.rows[0].sourceObjectKey,
    );
    const retry = await confirmImport(
      fixture.admin,
      fixture.workspace.id,
      retryPreview.id,
      { duplicateStrategy: "skip_existing", identityMappings: {} },
    );
    expect(retry).toMatchObject({ createdWorkItems: 0, skippedRows: 1 });

    const secondPreview = await createImportPreview(
      fixture.owner,
      fixture.workspace.id,
      genericNoKeyPreviewInput(secondCsv),
    );
    expect(secondPreview.rows[0].sourceObjectKey).not.toBe(
      firstPreview.rows[0].sourceObjectKey,
    );
    const second = await confirmImport(
      fixture.owner,
      fixture.workspace.id,
      secondPreview.id,
      { duplicateStrategy: "skip_existing", identityMappings: {} },
    );
    expect(second).toMatchObject({ createdWorkItems: 1, skippedRows: 0 });

    const importedProject = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, fixture.workspace.id),
          eq(projects.key, "NOKEY"),
        ),
      );
    expect(
      await db
        .select({ total: count() })
        .from(workItems)
        .where(eq(workItems.projectId, importedProject[0].id)),
    ).toEqual([{ total: 2 }]);
  });

  it("treats case-only source-key and label changes as the same identities", async () => {
    const fixture = await createFixture();
    const firstPreview = await createImportPreview(
      fixture.owner,
      fixture.workspace.id,
      jiraPreviewInput(
        'Project key,Project name,Issue key,Summary,Status,Labels\nCASE,Case project,CASE-1,Original,Open,"Bug,bug"',
      ),
    );
    const first = await confirmImport(
      fixture.owner,
      fixture.workspace.id,
      firstPreview.id,
      { duplicateStrategy: "skip_existing", identityMappings: {} },
    );
    expect(first).toMatchObject({ createdWorkItems: 1, failedRows: 0 });

    const replayPreview = await createImportPreview(
      fixture.admin,
      fixture.workspace.id,
      jiraPreviewInput(
        "Project key,Project name,Issue key,Summary,Status,Labels\nCASE,Case project,case-1,Changed,Open,BUG",
      ),
    );
    expect(replayPreview.rows[0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "source_already_imported" }),
      ]),
    );
    const replay = await confirmImport(
      fixture.admin,
      fixture.workspace.id,
      replayPreview.id,
      { duplicateStrategy: "skip_existing", identityMappings: {} },
    );
    expect(replay).toMatchObject({ createdWorkItems: 0, skippedRows: 1 });
    expect(
      await db
        .select({ total: count() })
        .from(workItems)
        .innerJoin(projects, eq(projects.id, workItems.projectId))
        .where(eq(projects.key, "CASE")),
    ).toEqual([{ total: 1 }]);
  });

  it("associates a recurring source identity with every preview session", async () => {
    const fixture = await createFixture();
    const input = jiraPreviewInput(
      "Project key,Project name,Issue key,Summary,Status,Assignee\nEVID,Evidence,EVID-1,Identity evidence,Open,member@example.test",
    );
    const first = await createImportPreview(
      fixture.owner,
      fixture.workspace.id,
      input,
    );
    const middle = await createImportPreview(
      fixture.admin,
      fixture.workspace.id,
      input,
    );
    const last = await createImportPreview(
      fixture.owner,
      fixture.workspace.id,
      input,
    );

    const middleResult = await getImportSession(
      fixture.owner,
      fixture.workspace.id,
      middle.id,
    );
    expect(middleResult.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identityKey: "email:member@example.test",
        }),
      ]),
    );
    expect(
      await db
        .select({ total: count() })
        .from(migrationImportSessionIdentities)
        .where(
          eq(
            migrationImportSessionIdentities.identityId,
            middleResult.identities[0].id,
          ),
        ),
    ).toEqual([{ total: 3 }]);
    expect(new Set([first.id, middle.id, last.id]).size).toBe(3);
  });

  it("maps only existing members explicitly and keeps blocked rows recoverable", async () => {
    const fixture = await createFixture();
    const preview = await createImportPreview(
      fixture.owner,
      fixture.workspace.id,
      jiraPreviewInput(
        [
          "Project key,Project name,Issue key,Summary,Status,Assignee,Parent",
          "MAP,Mapping,MAP-1,Assigned item,Open,member@example.test,",
          "MAP,Mapping,MAP-2,Blocked child,Open,,MAP-404",
        ].join("\n"),
      ),
    );
    const identity = preview.identities.find(
      (candidate) => candidate.identityKey === "email:member@example.test",
    )!;
    const result = await confirmImport(
      fixture.owner,
      fixture.workspace.id,
      preview.id,
      {
        duplicateStrategy: "skip_existing",
        identityMappings: { [identity.id]: fixture.member.userId },
      },
    );
    expect(result).toMatchObject({
      state: "completed_with_errors",
      createdWorkItems: 1,
      blockedRows: 1,
      committedAnything: true,
    });
    const assigned = await db
      .select()
      .from(workItems)
      .where(eq(workItems.title, "Assigned item"));
    expect(assigned[0].assigneeUserId).toBe(fixture.member.userId);
    const mapping = await db
      .select()
      .from(migrationSourceIdentities)
      .where(eq(migrationSourceIdentities.id, identity.id));
    expect(mapping[0].mappedUserId).toBe(fixture.member.userId);
    expect(
      await db
        .select()
        .from(migrationImportRows)
        .where(eq(migrationImportRows.sessionId, preview.id)),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: "blocked", targetWorkItemId: null }),
      ]),
    );
  });

  it("serializes concurrent sessions for the same source identity", async () => {
    const fixture = await createFixture();
    const input = jiraPreviewInput(
      "Project key,Project name,Issue key,Summary,Status\nCON,Concurrent,CON-1,One source object,Open",
    );
    const [leftPreview, rightPreview] = await Promise.all([
      createImportPreview(fixture.owner, fixture.workspace.id, input),
      createImportPreview(fixture.admin, fixture.workspace.id, input),
    ]);
    const [left, right] = await Promise.all([
      confirmImport(fixture.owner, fixture.workspace.id, leftPreview.id, {
        duplicateStrategy: "skip_existing",
        identityMappings: {},
      }),
      confirmImport(fixture.admin, fixture.workspace.id, rightPreview.id, {
        duplicateStrategy: "skip_existing",
        identityMappings: {},
      }),
    ]);
    expect(left.createdWorkItems + right.createdWorkItems).toBe(1);
    expect(left.skippedRows + right.skippedRows).toBe(1);
    expect(
      await db
        .select({ total: count() })
        .from(migrationSourceObjects)
        .where(
          and(
            eq(migrationSourceObjects.workspaceId, fixture.workspace.id),
            eq(migrationSourceObjects.objectKind, "work_item"),
            eq(migrationSourceObjects.sourceProjectKey, "CON"),
          ),
        ),
    ).toEqual([{ total: 1 }]);
  });

  it("keeps an interrupted later batch inspectable and safely retryable", async () => {
    const fixture = await createFixture();
    const csv = [
      "Project key,Project name,Issue key,Summary,Status",
      ...Array.from(
        { length: 101 },
        (_, index) =>
          `REC,Recovery,REC-${index + 1},Recovery row ${index + 1},Open`,
      ),
    ].join("\n");
    const preview = await createImportPreview(
      fixture.owner,
      fixture.workspace.id,
      jiraPreviewInput(csv),
    );
    await db.execute(sql`
      update ${migrationImportRows}
      set normalized_data = jsonb_set(normalized_data, '{title}', 'null'::jsonb)
      where session_id = ${preview.id} and row_number = 102
    `);
    const partial = await confirmImport(
      fixture.owner,
      fixture.workspace.id,
      preview.id,
      { duplicateStrategy: "skip_existing", identityMappings: {} },
    );
    expect(partial).toMatchObject({
      state: "completed_with_errors",
      committedAnything: true,
      createdProjects: 1,
      createdWorkItems: 100,
      failedRows: 1,
    });
    const retry = await confirmImport(
      fixture.admin,
      fixture.workspace.id,
      preview.id,
      { duplicateStrategy: "skip_existing", identityMappings: {} },
    );
    expect(retry).toMatchObject({
      state: "completed_with_errors",
      createdWorkItems: 100,
      failedRows: 1,
    });
    const secondPage = await getImportSession(
      fixture.owner,
      fixture.workspace.id,
      preview.id,
      2,
      100,
    );
    expect(secondPage.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 102,
          outcome: "failed",
          targetWorkItemId: null,
        }),
      ]),
    );
  });

  it("exports a bounded portable core with neutralized formulas and source references", async () => {
    const fixture = await createFixture();
    const preview = await createImportPreview(
      fixture.owner,
      fixture.workspace.id,
      jiraPreviewInput(
        'Project key,Project name,Issue key,Summary,Status,Issue URL\nSAFE,Safe export,SAFE-1,"=HYPERLINK(""https://bad"")",Open,https://jira.example.test/browse/SAFE-1',
      ),
    );
    await confirmImport(fixture.owner, fixture.workspace.id, preview.id, {
      duplicateStrategy: "skip_existing",
      identityMappings: {},
    });
    const exported = await exportDeliveryCore(
      fixture.admin,
      fixture.workspace.id,
      {
        page: 1,
        pageSize: 25,
        includeArchived: false,
      },
    );
    expect(exported.csv).toContain("core_delivery_not_legal_audit");
    expect(exported.csv).toContain("SAFE-1");
    expect(exported.csv).toContain("jira_csv");
    expect(exported.csv).toContain("jira-agency");
    expect(exported.csv).toContain("'=HYPERLINK");
    expect(exported.csv).not.toMatch(/margin|profit|revenue/i);
    expect(exported.recordCount).toBeLessThanOrEqual(5_000);

    await expect(
      exportDeliveryCore(fixture.member, fixture.workspace.id, {
        page: 1,
        pageSize: 25,
        includeArchived: false,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const otherWorkspace = await createWorkspace(
      await createUser("other-owner@example.test", "Other Owner"),
      { name: "Other workspace" },
    );
    await expect(
      getImportSession(fixture.owner, otherWorkspace.id, preview.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("pages every record from a project above the export response cap", async () => {
    const fixture = await createFixture();
    const preview = await createImportPreview(
      fixture.owner,
      fixture.workspace.id,
      jiraPreviewInput(
        "Project key,Project name,Issue key,Summary,Status\nLARGE,Large export,LARGE-1,Imported first item,Open",
      ),
    );
    await confirmImport(fixture.owner, fixture.workspace.id, preview.id, {
      duplicateStrategy: "skip_existing",
      identityMappings: {},
    });
    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, fixture.workspace.id),
          eq(projects.key, "LARGE"),
        ),
      );
    for (let offset = 0; offset < 5_000; offset += 500) {
      await db.insert(workItems).values(
        Array.from({ length: 500 }, (_, index) => {
          const number = offset + index + 2;
          return {
            id: randomUUID(),
            projectId: project[0].id,
            number,
            title: `Bulk export ${number}`,
            status: "backlog" as const,
            priority: "none" as const,
            purpose: "unclassified" as const,
            sortOrder: number - 1,
          };
        }),
      );
    }
    await db
      .update(projects)
      .set({ nextWorkItemNumber: 5_002 })
      .where(eq(projects.id, project[0].id));

    const first = await exportDeliveryCore(
      fixture.owner,
      fixture.workspace.id,
      {
        projectId: project[0].id,
        page: 1,
        pageSize: 25,
        includeArchived: false,
      },
    );
    const second = await exportDeliveryCore(
      fixture.owner,
      fixture.workspace.id,
      {
        projectId: project[0].id,
        page: 2,
        pageSize: 25,
        includeArchived: false,
      },
    );

    expect(first).toMatchObject({
      recordCount: 5_000,
      page: 1,
      totalPages: 2,
      hasNextPage: true,
    });
    expect(first.fileName).toContain("part-1-of-2");
    expect(first.csv).toContain("LARGE-4998");
    expect(first.csv).not.toContain("LARGE-4999");
    expect(second).toMatchObject({
      recordCount: 5,
      page: 2,
      totalPages: 2,
      hasNextPage: false,
    });
    expect(second.fileName).toContain("part-2-of-2");
    expect(second.csv).toContain("LARGE-4999");
    expect(second.csv).toContain("LARGE-5001");
    expect(second.csv).not.toContain("LARGE-4998");
    await expect(
      exportDeliveryCore(fixture.owner, fixture.workspace.id, {
        projectId: project[0].id,
        page: 3,
        pageSize: 25,
        includeArchived: false,
      }),
    ).rejects.toMatchObject({ code: "export_page_not_found" });
  });
});

function templateDefinition(
  acceptanceCriteria: string,
): ProjectTemplateDefinition {
  return {
    projectSummary: "Template context",
    milestones: [
      {
        ref: "release",
        name: "Release",
        description: null,
        targetOffsetDays: 30,
      },
    ],
    cycles: [
      {
        ref: "cycle-1",
        name: "Cycle 1",
        goal: "Ship safely",
        startOffsetDays: 0,
        durationDays: 14,
      },
    ],
    workItems: [
      {
        ref: "delivery",
        parentRef: null,
        milestoneRef: "release",
        cycleRef: "cycle-1",
        title: "Delivery skeleton",
        description: null,
        acceptanceCriteria,
        status: "backlog" as const,
        priority: "medium" as const,
        purpose: "client_delivery" as const,
        estimatePoints: 5,
        targetOffsetDays: 21,
        labels: ["delivery"],
      },
    ],
  };
}

function jiraPreviewInput(csvText: string) {
  return {
    sourceKind: "jira_csv" as const,
    sourceNamespace: "jira-agency",
    sourceName: "Jira active work",
    fileName: "jira.csv",
    csvText,
    mapping: undefined,
    options: {
      clientId: fixtureState.clientId,
      defaultLeadUserId: fixtureState.leadUserId,
      defaultProjectKey: null,
      defaultProjectName: null,
    },
  };
}

function genericNoKeyPreviewInput(csvText: string) {
  return {
    sourceKind: "generic_csv" as const,
    sourceNamespace: "generic-agency",
    sourceName: "Generic active work",
    fileName: "generic.csv",
    csvText,
    mapping: {
      columns: {
        projectKey: "Project",
        projectName: "Project name",
        title: "Title",
      },
      statusValues: {},
      priorityValues: {},
    },
    options: {
      clientId: fixtureState.clientId,
      defaultLeadUserId: fixtureState.leadUserId,
      defaultProjectKey: null,
      defaultProjectName: null,
    },
  };
}

const fixtureState = { clientId: "", leadUserId: "" };

async function createFixture() {
  const owner = await createUser("owner@example.test", "Owner");
  const admin = await createUser("admin@example.test", "Admin");
  const member = await createUser("member@example.test", "Member");
  const workspace = await createWorkspace(owner, { name: "Adoption" });
  await db.insert(memberships).values([
    {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: admin.userId,
      role: "admin",
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
    internalReference: "CLIENT-1",
    summary: null,
  });
  fixtureState.clientId = client.id;
  fixtureState.leadUserId = owner.userId;
  return { owner, admin, member, workspace, client };
}

async function createUser(email: string, name: string) {
  const userId = randomUUID();
  await db
    .insert(users)
    .values({ id: userId, email, name, emailVerified: true });
  return { userId, email };
}
