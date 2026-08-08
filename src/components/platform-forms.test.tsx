import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import {
  InvitationAcceptance,
  MemberManagement,
  WorkspaceCreateForm,
  WorkspaceSettingsForm,
} from "./platform-forms";

describe("platform forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    history.replaceState(null, "", "/");
  });

  it("creates a workspace through the versioned API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { slug: "river-studio-a1b2c3d4" } }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WorkspaceCreateForm />);

    await user.type(screen.getByLabelText(/Workspace name/), "River Studio");
    await user.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/app/river-studio-a1b2c3d4"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/workspaces",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("stages a fragment token before asking an unauthenticated invitee to sign in", async () => {
    history.replaceState(
      null,
      "",
      "/invitations/accept#token=synthetic-token-with-more-than-32-characters",
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { staged: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<InvitationAcceptance signedIn={false} />);

    expect(await screen.findByText(/sign in or create/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/invitations/stage",
      expect.objectContaining({ method: "POST" }),
    );
    expect(window.location.hash).toBe("");
  });

  it("keeps workspace settings read-only for members", () => {
    render(
      <WorkspaceSettingsForm
        workspace={{
          id: "workspace-id",
          name: "River Studio",
          timezone: "UTC",
          role: "member",
        }}
      />,
    );

    expect(screen.getByLabelText("Workspace name")).toBeDisabled();
    expect(screen.getByLabelText(/Default time zone/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save settings" })).toBeNull();
    expect(screen.getByText(/Members can view/)).toBeInTheDocument();
  });

  it("gives admins member-only controls without exposing admin or owner mutation", () => {
    render(
      <MemberManagement
        workspaceId="workspace-id"
        currentUserId="admin-user"
        currentRole="admin"
        invitations={[]}
        members={[
          {
            id: "owner-membership",
            userId: "owner-user",
            name: "Workspace Owner",
            email: "owner@example.test",
            role: "owner",
            joinedAt: new Date().toISOString(),
          },
          {
            id: "member-membership",
            userId: "member-user",
            name: "Workspace Member",
            email: "member@example.test",
            role: "member",
            joinedAt: new Date().toISOString(),
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Starting role")).not.toHaveTextContent(
      "Admin",
    );
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
    expect(screen.queryByRole("combobox", { name: /Role for/ })).toBeNull();
  });
});
