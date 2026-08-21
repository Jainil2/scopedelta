import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AdoptionWorkspace,
  ImportResultWorkspace,
} from "@/components/adoption-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const member = {
  userId: "0cfeec0e-f5e4-4e07-9cd0-7e6438d843f9",
  name: "Ari Admin",
  email: "ari@example.test",
  role: "admin" as const,
};

describe("adoption workspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders explicit template, import, and portability empty states", () => {
    render(
      <AdoptionWorkspace
        workspaceId="7f960d3a-53a6-44b2-9ffe-adcf7f1ac898"
        workspaceSlug="agency"
        templates={[]}
        imports={[]}
        clients={[]}
        projects={[]}
        members={[member]}
      />,
    );
    expect(screen.getByText("No project templates")).toBeInTheDocument();
    expect(screen.getByText("No import sessions")).toBeInTheDocument();
    expect(
      screen.getByText("Defined portability boundary"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a complete legal, commercial, engineering, QA/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create dry-run preview" }),
    ).toBeInTheDocument();
  });

  it("builds deterministic selected-project export part links", () => {
    const projectId = "fbfd3c92-d242-46c4-ab53-03bbbf84786b";
    render(
      <AdoptionWorkspace
        workspaceId="7f960d3a-53a6-44b2-9ffe-adcf7f1ac898"
        workspaceSlug="agency"
        templates={[]}
        imports={[]}
        clients={[]}
        projects={[
          {
            id: projectId,
            key: "LARGE",
            name: "Large export",
            lifecycle: "active",
          },
        ]}
        members={[member]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Export scope"), {
      target: { value: projectId },
    });
    const part = screen.getByLabelText("Project export part");
    fireEvent.change(part, { target: { value: "2" } });
    expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute(
      "href",
      `/api/v1/workspaces/7f960d3a-53a6-44b2-9ffe-adcf7f1ac898/exports/delivery-core?projectId=${projectId}&page=2`,
    );
  });

  it("shows unresolved identities and row-level warning evidence before confirmation", () => {
    render(
      <ImportResultWorkspace
        workspaceId="7f960d3a-53a6-44b2-9ffe-adcf7f1ac898"
        workspaceSlug="agency"
        members={[member]}
        initialResult={{
          id: "95a9b326-03f8-4981-b218-40b2b60c7f71",
          sourceKind: "jira_csv",
          sourceNamespace: "jira-agency",
          sourceName: "Jira active work",
          fileName: "jira.csv",
          state: "preview_ready",
          totalRows: 1,
          validRows: 0,
          warningRows: 1,
          blockedRows: 0,
          createdProjects: 0,
          createdWorkItems: 0,
          skippedRows: 0,
          failedRows: 0,
          committedAnything: false,
          createdAt: new Date("2026-08-20T00:00:00Z"),
          lastErrorCode: null,
          unsupportedColumns: ["Custom contract note"],
          identities: [
            {
              id: "6cd4ec1d-574d-4fd5-8178-961c96dd3624",
              identityKey: "email:source@example.test",
              displayName: "Source User",
              email: "source@example.test",
              mappedUserId: null,
            },
          ],
          rows: [
            {
              id: "7d2209cc-d590-4c56-9137-555537785f68",
              rowNumber: 2,
              sourceProjectKey: "WEB",
              sourceObjectKey: "WEB-1",
              outcome: "warning",
              normalizedData: { title: "Imported work" },
              messages: [
                {
                  code: "unsupported_columns_preserved",
                  message: "Unsupported values remain migration metadata.",
                },
              ],
              targetProjectId: null,
              targetWorkItemId: null,
            },
          ],
          rowPageInfo: { page: 1, pageSize: 100, total: 1, hasNextPage: false },
        }}
      />,
    );
    expect(screen.getByText("Keep unresolved")).toBeInTheDocument();
    expect(screen.getByText("Custom contract note")).toBeInTheDocument();
    expect(
      screen.getByText("unsupported_columns_preserved"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Confirm import and skip existing source objects",
      }),
    ).toBeInTheDocument();
  });

  it("preserves non-ledger template fields when saving an edited version", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AdoptionWorkspace
        workspaceId="7f960d3a-53a6-44b2-9ffe-adcf7f1ac898"
        workspaceSlug="agency"
        templates={[
          {
            id: "4ad5f9af-f4ad-430e-92ea-5202af5ea0e8",
            name: "API template",
            description: "Created through the API",
            version: 1,
            definition: {
              projectSummary: "Keep this context",
              milestones: [
                {
                  ref: "release",
                  name: "Release",
                  description: "Preserve milestone evidence",
                  targetOffsetDays: 30,
                },
              ],
              cycles: [
                {
                  ref: "cycle-1",
                  name: "Cycle 1",
                  goal: "Preserve the cycle goal",
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
                  description: "Preserve detailed guidance",
                  acceptanceCriteria: "Accepted",
                  status: "in_progress",
                  priority: "high",
                  purpose: "delivery_support",
                  estimatePoints: 8,
                  targetOffsetDays: 21,
                  labels: ["delivery"],
                },
              ],
            },
          },
        ]}
        imports={[]}
        clients={[]}
        projects={[]}
        members={[member]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save new version" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload.definition.milestones[0].description).toBe(
      "Preserve milestone evidence",
    );
    expect(payload.definition.cycles[0].goal).toBe("Preserve the cycle goal");
    expect(payload.definition.workItems[0]).toMatchObject({
      description: "Preserve detailed guidance",
      status: "in_progress",
      priority: "high",
      purpose: "delivery_support",
      estimatePoints: 8,
      targetOffsetDays: 21,
    });
  });
});
