import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildCsvPreview,
  CsvBoundaryError,
  csvRecord,
  parseBoundedCsv,
  suggestCsvMapping,
} from "@/lib/adoption";
import {
  importRowPaginationSchema,
  projectTemplateDefinitionSchema,
} from "@/lib/adoption-validation";

describe("bounded migration parsing", () => {
  it("allows bounded 100-row evidence pages but rejects larger requests", () => {
    expect(
      importRowPaginationSchema.parse({ page: 1, pageSize: 100 }).pageSize,
    ).toBe(100);
    expect(
      importRowPaginationSchema.safeParse({ page: 1, pageSize: 101 }).success,
    ).toBe(false);
  });

  it("parses quoted Jira rows, maps standard values, and preserves unsupported fields", () => {
    const csv = [
      "Project key,Project name,Issue key,Summary,Description,Issue Type,Status,Priority,Assignee,Reporter,Parent,Labels,Due date,Story Points,Issue URL,Custom contract note",
      'WEB,Website,WEB-1,Build shell,"Line one, still one field",Story,In Progress,High,"Sam <sam@example.test>",pat@example.test,,frontend;client,2026-09-01,8,https://jira.example.test/browse/WEB-1,"Carry this context"',
    ].join("\n");
    const preview = buildCsvPreview({
      csvText: csv,
      sourceKind: "jira_csv",
      options: {
        clientId: "client",
        defaultLeadUserId: "lead",
        defaultProjectKey: null,
        defaultProjectName: null,
      },
    });

    expect(preview.counts).toEqual({
      total: 1,
      valid: 0,
      warning: 1,
      blocked: 0,
    });
    expect(preview.unsupportedColumns).toEqual(["Custom contract note"]);
    expect(preview.rows[0].normalized).toMatchObject({
      sourceProjectKey: "WEB",
      projectName: "Website",
      sourceObjectKey: "WEB-1",
      title: "Build shell",
      status: "in_progress",
      priority: "high",
      estimatePoints: 8,
      targetDate: "2026-09-01",
      labels: ["frontend", "client"],
      assigneeIdentity: {
        identityKey: "email:sam@example.test",
        displayName: "Sam",
        email: "sam@example.test",
      },
      reporterIdentity: {
        identityKey: "email:pat@example.test",
      },
      unsupported: { "Custom contract note": "Carry this context" },
    });
  });

  it("allows a parent after its child while blocking missing or deep hierarchy", () => {
    const preview = buildCsvPreview({
      csvText: readFileSync("fixtures/migration/hierarchy-errors.csv", "utf8"),
      sourceKind: "jira_csv",
      options: {
        clientId: "client",
        defaultLeadUserId: "lead",
        defaultProjectKey: null,
        defaultProjectName: "Website",
      },
    });

    expect(preview.rows[0].outcome).toBe("valid");
    expect(preview.rows[2].outcome).toBe("blocked");
    expect(preview.rows[2].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported_hierarchy_depth" }),
      ]),
    );
    expect(preview.rows[3].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_parent" }),
      ]),
    );
  });

  it("keeps identical issue keys distinct across source projects", () => {
    const preview = buildCsvPreview({
      csvText: [
        "Project key,Project name,Issue key,Summary,Status",
        "WEB,Website,ONE-1,Website item,Open",
        "APP,Application,ONE-1,Application item,Open",
      ].join("\n"),
      sourceKind: "jira_csv",
      options: {
        clientId: "client",
        defaultLeadUserId: "lead",
        defaultProjectKey: null,
        defaultProjectName: null,
      },
    });
    expect(preview.rows.every((row) => row.outcome !== "blocked")).toBe(true);
  });

  it("requires explicit mapping for unknown Jira statuses", () => {
    const preview = buildCsvPreview({
      csvText:
        "Project key,Issue key,Summary,Status\nWEB,WEB-1,Blocked item,Awaiting CAB",
      sourceKind: "jira_csv",
      options: {
        clientId: "client",
        defaultLeadUserId: "lead",
        defaultProjectKey: null,
        defaultProjectName: "Website",
      },
    });
    expect(preview.rows[0].outcome).toBe("blocked");
    expect(preview.rows[0].messages).toContainEqual(
      expect.objectContaining({ code: "unmapped_status" }),
    );
  });

  it("supports generic explicit column and enum mappings", () => {
    const mapping = suggestCsvMapping(
      ["Project", "ID", "Task", "Stage"],
      "generic_csv",
    );
    expect(mapping.columns).toEqual({});
    const preview = buildCsvPreview({
      csvText: "Project,ID,Task,Stage\nOPS,42,Run migration,Queued",
      sourceKind: "generic_csv",
      mapping: {
        columns: {
          projectKey: "Project",
          issueKey: "ID",
          title: "Task",
          status: "Stage",
        },
        statusValues: { Queued: "ready" },
        priorityValues: {},
      },
      options: {
        clientId: "client",
        defaultLeadUserId: "lead",
        defaultProjectKey: null,
        defaultProjectName: "Operations",
      },
    });
    expect(preview.rows[0].normalized.status).toBe("ready");
    expect(preview.rows[0].outcome).toBe("valid");
  });

  it("rejects malformed CSV and neutralizes spreadsheet formulas on export", () => {
    expect(() =>
      parseBoundedCsv(readFileSync("fixtures/migration/malformed.csv", "utf8")),
    ).toThrowError(CsvBoundaryError);
    expect(csvRecord(['=HYPERLINK("https://bad")', "+cmd", "normal"])).toBe(
      '"\'=HYPERLINK(""https://bad"")","\'+cmd","normal"',
    );
  });

  it("rejects ragged rows that contain more fields than the header", () => {
    expect(() =>
      parseBoundedCsv("Project,Title\nOPS,Safe,unexpected trailing value"),
    ).toThrowError(
      expect.objectContaining({ code: "csv_row_too_many_fields" }),
    );
  });

  it("scopes inferred row identities to the exact source file", () => {
    const input = {
      sourceKind: "generic_csv" as const,
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
        clientId: "client",
        defaultLeadUserId: "lead",
        defaultProjectKey: null,
        defaultProjectName: null,
      },
    };
    const firstCsv = "Project,Project name,Title\nOPS,Operations,First batch";
    const secondCsv = "Project,Project name,Title\nOPS,Operations,Second batch";
    const first = buildCsvPreview({ ...input, csvText: firstCsv });
    const retry = buildCsvPreview({ ...input, csvText: firstCsv });
    const second = buildCsvPreview({ ...input, csvText: secondCsv });

    expect(retry.rows[0].normalized.sourceObjectKey).toBe(
      first.rows[0].normalized.sourceObjectKey,
    );
    expect(second.rows[0].normalized.sourceObjectKey).not.toBe(
      first.rows[0].normalized.sourceObjectKey,
    );
  });
});

describe("project template snapshots", () => {
  it("accepts one-level work skeletons and rejects invalid references", () => {
    const valid = {
      projectSummary: "A repeatable delivery shape",
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
          goal: null,
          startOffsetDays: 0,
          durationDays: 14,
        },
      ],
      workItems: [
        {
          ref: "parent",
          parentRef: null,
          milestoneRef: "release",
          cycleRef: "cycle-1",
          title: "Deliver parent",
          description: null,
          acceptanceCriteria: "Accepted",
          status: "backlog",
          priority: "none",
          purpose: "client_delivery",
          estimatePoints: null,
          targetOffsetDays: null,
          labels: [],
        },
        {
          ref: "child",
          parentRef: "parent",
          milestoneRef: null,
          cycleRef: null,
          title: "Verify child",
          description: null,
          acceptanceCriteria: null,
          status: "backlog",
          priority: "none",
          purpose: "client_delivery",
          estimatePoints: null,
          targetOffsetDays: null,
          labels: ["qa"],
        },
      ],
    };
    expect(projectTemplateDefinitionSchema.safeParse(valid).success).toBe(true);
    const invalid = structuredClone(valid);
    invalid.workItems[1].parentRef = "missing";
    expect(projectTemplateDefinitionSchema.safeParse(invalid).success).toBe(
      false,
    );
  });
});
