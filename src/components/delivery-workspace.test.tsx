import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { BacklogWorkspace, ClientDirectory } from "./delivery-workspace";

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
      <ClientDirectory workspaceId="workspace-id" role="owner" clients={[]} />,
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
            assigneeUserId: "owner-id",
            assigneeName: "Owner",
            estimatePoints: 5,
            targetDate: null,
            milestoneId: null,
            milestoneName: null,
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
        labels={[{ id: "label-id", name: "Frontend", color: "blue" }]}
        dependencies={[]}
        filtered={false}
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
});
