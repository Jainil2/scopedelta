import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import {
  BacklogWorkspace,
  ClientDirectory,
  CommercialProvenanceBadge,
  ProjectDirectory,
} from "./delivery-workspace";

describe("delivery workspace", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("creates a client through the shared versioned API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "client-id" } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <ClientDirectory
        workspaceId="workspace-id"
        workspaceSlug="northstar"
        role="owner"
        clients={[]}
        pageInfo={{ page: 1, pageSize: 50, total: 0, hasNextPage: false }}
      />,
    );

    await user.click(screen.getByText("New client"));
    await user.type(screen.getByLabelText("Client name"), "Acme Labs");
    await user.click(screen.getByRole("button", { name: "Create client" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/workspaces/workspace-id/clients",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Client created.",
    );
  });

  it("renders a grouped, filterable backlog and opens the work editor", async () => {
    const user = userEvent.setup();
    render(
      <BacklogWorkspace
        workspaceId="workspace-id"
        workspaceSlug="northstar"
        project={{
          id: "project-id",
          key: "ACME",
          name: "Portal rebuild",
          summary: null,
          lifecycle: "active",
          clientName: "Acme Labs",
          leadUserId: "owner-id",
          leadName: "Owner",
          targetDate: null,
        }}
        items={[
          {
            id: "item-id",
            identifier: "ACME-1",
            parentId: null,
            title: "Build authenticated shell",
            description: "Keep it bounded.",
            acceptanceCriteria: "Tenant access is enforced.",
            status: "ready",
            priority: "high",
            purpose: "unclassified",
            commercialBasisCount: 0,
            assigneeUserId: "owner-id",
            assigneeName: "Owner",
            estimatePoints: 5,
            targetDate: null,
            milestoneId: null,
            milestoneName: null,
            cycleId: null,
            cycleName: null,
            cycleLifecycle: null,
            labels: [{ id: "label-id", name: "Frontend", color: "blue" }],
          },
        ]}
        pageInfo={{ page: 1, pageSize: 50, total: 1, hasNextPage: false }}
        members={[
          {
            userId: "owner-id",
            name: "Owner",
            email: "owner@example.test",
          },
        ]}
        milestones={[]}
        cycles={[
          {
            id: "cycle-id",
            sequence: 2,
            name: "August",
            startDate: "2026-08-10",
            endDate: "2026-08-21",
            lifecycle: "active",
            goal: null,
          },
        ]}
        labels={[{ id: "label-id", name: "Frontend", color: "blue" }]}
        dependencies={[]}
        filters={{ page: 1, pageSize: 50 }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Ready" })).toBeVisible();
    expect(screen.getByLabelText("Filter by status")).toBeVisible();
    expect(screen.getAllByText("Frontend").length).toBeGreaterThan(0);
    await user.click(
      screen.getByRole("button", { name: /Build authenticated shell/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit work item" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByLabelText("Acceptance criteria")).toHaveValue(
      "Tenant access is enforced.",
    );
    expect(
      screen.getByRole("button", { name: "Archive work item" }),
    ).toBeVisible();
  });

  it("renders preserved terminal basis as historical authorization", () => {
    const historicalItem = {
      purpose: "client_delivery" as const,
      status: "done" as const,
      archivedAt: null,
      commercialBasisCount: 0,
      commercialHistoricalBasisCount: 1,
      commercialStaleBasisCount: 1,
    };
    const { rerender } = render(
      <CommercialProvenanceBadge item={historicalItem} />,
    );

    expect(screen.getByText("Historically authorized")).toHaveClass(
      "commercial-historical",
    );
    expect(
      screen.queryByText("Stale commercial basis"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Commercially unlinked")).not.toBeInTheDocument();

    rerender(
      <CommercialProvenanceBadge
        item={{ ...historicalItem, status: "canceled" }}
      />,
    );
    expect(screen.getByText("Historically authorized")).toBeVisible();

    rerender(
      <CommercialProvenanceBadge
        item={{ ...historicalItem, status: "ready", archivedAt: new Date() }}
      />,
    );
    expect(screen.getByText("Historically authorized")).toBeVisible();

    rerender(
      <CommercialProvenanceBadge
        item={{
          ...historicalItem,
          status: "in_progress",
          commercialHistoricalBasisCount: 0,
          commercialStaleBasisCount: 0,
        }}
      />,
    );
    expect(screen.getByText("Commercially unlinked")).toHaveClass(
      "commercial-unlinked",
    );
  });

  it("preserves active backlog filters in controls and page links", () => {
    render(
      <BacklogWorkspace
        workspaceId="workspace-id"
        workspaceSlug="northstar"
        project={{
          id: "project-id",
          key: "ACME",
          name: "Portal rebuild",
          summary: null,
          lifecycle: "active",
          clientName: "Acme Labs",
          leadUserId: "owner-id",
          leadName: "Owner",
          targetDate: null,
        }}
        items={[]}
        pageInfo={{ page: 2, pageSize: 25, total: 75, hasNextPage: true }}
        members={[
          {
            userId: "member-id",
            name: "Member",
            email: "member@example.test",
          },
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
        cycles={[
          {
            id: "cycle-id",
            sequence: 2,
            name: "August",
            startDate: "2026-08-10",
            endDate: "2026-08-21",
            lifecycle: "active",
            goal: null,
          },
        ]}
        labels={[{ id: "label-id", name: "Frontend", color: "blue" }]}
        dependencies={[]}
        filters={{
          page: 2,
          pageSize: 25,
          query: "shell",
          status: "ready",
          assigneeUserId: "member-id",
          priority: "high",
          milestoneId: "milestone-id",
          cycleId: "cycle-id",
          labelId: "label-id",
        }}
      />,
    );

    expect(screen.getByLabelText("Filter by status")).toHaveValue("ready");
    expect(screen.getByLabelText("Filter by assignee")).toHaveValue(
      "member-id",
    );
    expect(screen.getByLabelText("Filter by priority")).toHaveValue("high");
    expect(screen.getByLabelText("Filter by milestone")).toHaveValue(
      "milestone-id",
    );
    expect(screen.getByLabelText("Filter by cycle")).toHaveValue("cycle-id");
    expect(screen.getByLabelText("Search work items")).toHaveValue("shell");
    expect(screen.getByLabelText("Filter by label")).toHaveValue("label-id");
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "?status=ready&assigneeUserId=member-id&priority=high&milestoneId=milestone-id&cycleId=cycle-id&labelId=label-id&query=shell&pageSize=25&page=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "?status=ready&assigneeUserId=member-id&priority=high&milestoneId=milestone-id&cycleId=cycle-id&labelId=label-id&query=shell&pageSize=25&page=3",
    );
  });

  it("renders later client directory pages with bounded navigation", () => {
    render(
      <ClientDirectory
        workspaceId="workspace-id"
        workspaceSlug="northstar"
        role="owner"
        clients={[
          {
            id: "client-51",
            name: "Client 051",
            internalReference: null,
            summary: null,
            lifecycle: "active",
          },
        ]}
        pageInfo={{ page: 2, pageSize: 50, total: 120, hasNextPage: true }}
      />,
    );

    expect(screen.getByText("Client 051")).toBeVisible();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/app/northstar/clients?page=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/app/northstar/clients?page=3",
    );
  });

  it("keeps later project and client-option pages reachable", async () => {
    const user = userEvent.setup();
    render(
      <ProjectDirectory
        workspaceId="workspace-id"
        workspaceSlug="northstar"
        lifecycle="current"
        clients={[
          {
            id: "client-105",
            name: "Client 105",
            internalReference: null,
            summary: null,
            lifecycle: "active",
          },
        ]}
        clientPageInfo={{
          page: 3,
          pageSize: 50,
          total: 105,
          hasNextPage: false,
        }}
        members={[
          {
            userId: "owner-id",
            name: "Owner",
            email: "owner@example.test",
          },
        ]}
        projects={[
          {
            id: "project-105",
            key: "P105",
            name: "Project 105",
            summary: null,
            lifecycle: "active",
            clientName: "Client 105",
            leadUserId: "owner-id",
            leadName: "Owner",
            targetDate: null,
          },
        ]}
        projectPageInfo={{
          page: 3,
          pageSize: 50,
          total: 105,
          hasNextPage: false,
        }}
      />,
    );

    expect(screen.getByText("Project 105")).toBeVisible();
    await user.click(screen.getByText("New project"));
    expect(screen.getByRole("option", { name: "Client 105" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Previous clients" }),
    ).toHaveAttribute("href", "/app/northstar/projects?page=3&clientPage=2");
    expect(screen.getByRole("link", { name: /^Previous$/ })).toHaveAttribute(
      "href",
      "/app/northstar/projects?page=2&clientPage=3",
    );
  });
});
