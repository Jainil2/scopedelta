import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import {
  BoardWorkspace,
  CyclesWorkspace,
  MyWorkWorkspace,
} from "./planning-workspace";

const project = {
  id: "project-id",
  key: "ACME",
  name: "Portal rebuild",
  summary: null,
  lifecycle: "active" as const,
  clientName: "Acme Labs",
  leadUserId: "member-id",
  leadName: "Member",
  targetDate: null,
};

const cycle = {
  id: "cycle-id",
  sequence: 4,
  name: "August delivery",
  startDate: "2026-08-10",
  endDate: "2026-08-21",
  lifecycle: "active" as const,
  goal: "Ship the authenticated shell",
};

const item = {
  id: "item-id",
  identifier: "ACME-12",
  parentId: null,
  title: "Build authenticated shell",
  description: "Private description",
  acceptanceCriteria: "Tenant access is enforced.",
  status: "backlog" as const,
  priority: "high" as const,
  assigneeUserId: "member-id",
  assigneeName: "Member",
  estimatePoints: 5,
  targetDate: "2026-08-15",
  milestoneId: "milestone-id",
  milestoneName: "Launch",
  cycleId: "cycle-id",
  cycleName: "August delivery",
  cycleLifecycle: "active" as const,
  labels: [{ id: "label-id", name: "Frontend", color: "blue" }],
};

describe("planning workspace", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("moves board work and contains editor focus in both Tab directions", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: item }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <BoardWorkspace
        workspaceId="workspace-id"
        workspaceSlug="northstar"
        project={project}
        items={[item]}
        pageInfo={{ page: 1, pageSize: 100, total: 1, hasNextPage: false }}
        members={[
          { userId: "member-id", name: "Member", email: "member@example.test" },
        ]}
        milestones={[
          {
            id: "milestone-id",
            name: "Launch",
            description: null,
            targetDate: null,
            status: "planned",
          },
        ]}
        cycles={[cycle]}
        labels={[{ id: "label-id", name: "Frontend", color: "blue" }]}
        filters={{ page: 1, pageSize: 100 }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Backlog" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "In review" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Ready →" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/workspaces/workspace-id/projects/project-id/work-items/item-id",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "ready" }),
      }),
    );
    await user.click(screen.getByTitle("Move down"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/workspaces/workspace-id/projects/project-id/work-items/item-id/reorder",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ direction: "down" }),
        }),
      ),
    );

    const opener = screen.getByRole("button", {
      name: /Build authenticated shell/,
    });
    await user.click(opener);
    const editor = screen.getByRole("dialog", { name: "Edit work item" });
    const closeEditor = within(editor).getByRole("button", { name: "Close" });
    const saveChanges = within(editor).getByRole("button", {
      name: "Save changes",
    });
    expect(editor).toBeVisible();
    expect(closeEditor).toHaveFocus();
    await user.tab({ shift: true });
    expect(saveChanges).toHaveFocus();
    await user.tab();
    expect(closeEditor).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("supports an explicit no-cycle project and creates the first cycle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: cycle }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <CyclesWorkspace
        workspaceId="workspace-id"
        workspaceSlug="northstar"
        project={project}
        cycles={[]}
        pageInfo={{ page: 1, pageSize: 50, total: 0, hasNextPage: false }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No open cycles" }),
    ).toBeVisible();
    await user.click(screen.getByText("New cycle"));
    await user.type(screen.getByLabelText("Cycle name"), "August delivery");
    await user.type(screen.getByLabelText("Start date"), "2026-08-10");
    await user.type(screen.getByLabelText("End date"), "2026-08-21");
    await user.click(screen.getByRole("button", { name: "Create cycle" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/workspaces/workspace-id/projects/project-id/cycles",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the board unchanged and exposes the server error when a move fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "Canceled work cannot be reopened." },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <BoardWorkspace
        workspaceId="workspace-id"
        workspaceSlug="northstar"
        project={project}
        items={[item]}
        pageInfo={{ page: 1, pageSize: 100, total: 1, hasNextPage: false }}
        members={[]}
        milestones={[]}
        cycles={[]}
        labels={[]}
        filters={{ page: 1, pageSize: 100 }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ready →" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Canceled work cannot be reopened.",
    );
    expect(screen.getByRole("option", { name: /historical/ })).toHaveValue(
      "cycle-id",
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Backlog" })).toBeVisible();
  });

  it("keeps My work filter state shareable and updates status in place", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: item }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <MyWorkWorkspace
        workspaceId="workspace-id"
        workspaceSlug="northstar"
        items={[
          {
            ...item,
            projectId: "project-id",
            projectKey: "ACME",
            projectName: "Portal rebuild",
            clientName: "Acme Labs",
          },
        ]}
        pageInfo={{ page: 2, pageSize: 25, total: 60, hasNextPage: true }}
        filters={{
          page: 2,
          pageSize: 25,
          query: "shell",
          projectKey: "ACME",
          status: "backlog",
          priority: "high",
          milestoneId: "milestone-id",
          cycleId: "cycle-id",
          labelId: "label-id",
        }}
        facets={{
          projects: [
            {
              projectId: "project-id",
              projectKey: "ACME",
              projectName: "Portal rebuild",
              clientName: "Acme Labs",
            },
          ],
          milestones: [
            { id: "milestone-id", name: "Launch", projectKey: "ACME" },
          ],
          cycles: [
            { id: "cycle-id", name: "August delivery", projectKey: "ACME" },
          ],
          labels: [],
        }}
      />,
    );

    expect(screen.getByLabelText("Search my work")).toHaveValue("shell");
    expect(screen.getByLabelText("Filter by project")).toHaveValue("ACME");
    expect(screen.getByLabelText("Filter by label")).toHaveValue("label-id");
    expect(
      screen.getByRole("option", { name: "Unavailable label" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "?query=shell&projectKey=ACME&status=backlog&priority=high&milestoneId=milestone-id&cycleId=cycle-id&labelId=label-id&pageSize=25&page=1",
    );
    const row = screen
      .getByRole("link", { name: /Build authenticated shell/ })
      .closest("article");
    expect(row).not.toBeNull();
    await user.selectOptions(within(row!).getByLabelText("Status"), "ready");
    await user.click(within(row!).getByRole("button", { name: "Update" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
