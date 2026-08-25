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

  it("gives admins member-only suspension controls without destructive removal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "suspended" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <MemberManagement
        workspaceId="workspace-id"
        currentUserId="admin-user"
        currentRole="admin"
        workspaceSlug="workspace"
        memberPage={{ number: 1, size: 50, total: 2, pages: 1 }}
        invitationPage={{ number: 1, size: 50, total: 0, pages: 0 }}
        filters={{ query: "", invitationState: "pending" }}
        invitations={[]}
        members={[
          {
            id: "owner-membership",
            userId: "owner-user",
            name: "Workspace Owner",
            email: "owner@example.test",
            role: "owner",
            status: "active",
            joinedAt: new Date().toISOString(),
            suspendedAt: null,
          },
          {
            id: "member-membership",
            userId: "member-user",
            name: "Workspace Member",
            email: "member@example.test",
            role: "member",
            status: "active",
            joinedAt: new Date().toISOString(),
            suspendedAt: null,
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Starting role")).not.toHaveTextContent(
      "Admin",
    );
    expect(
      screen.getAllByRole("button", { name: "Suspend access" }),
    ).toHaveLength(1);
    expect(screen.queryByRole("combobox", { name: /Role for/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Suspend access" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/workspaces/workspace-id/members/member-membership",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "suspended" }),
        }),
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Workspace access suspended",
    );
  });

  it("keeps directory filters while paging and discovering revoked invitations for reissue", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            acceptUrl:
              "http://localhost:3000/invitations/accept#token=rotated-token-with-more-than-32-characters",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <MemberManagement
        workspaceId="workspace-id"
        currentUserId="owner-user"
        currentRole="owner"
        workspaceSlug="workspace"
        memberPage={{ number: 2, size: 50, total: 125, pages: 3 }}
        invitationPage={{ number: 2, size: 50, total: 110, pages: 3 }}
        filters={{
          query: "alex",
          role: "member",
          status: "suspended",
          invitationState: "revoked",
        }}
        members={[]}
        invitations={[
          {
            id: "revoked-invitation",
            email: "alex@example.test",
            role: "member",
            state: "revoked",
            expired: false,
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            emailDeliveryState: "failed",
            emailAttemptCount: 1,
            lastEmailAttemptAt: new Date().toISOString(),
            lastEmailErrorCode: "delivery_failed",
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Next members" })).toHaveAttribute(
      "href",
      "/app/workspace/settings/members?query=alex&role=member&status=suspended&invitationState=revoked&page=3&invitationPage=2",
    );
    expect(
      screen.getByRole("link", { name: "Previous invitations" }),
    ).toHaveAttribute(
      "href",
      "/app/workspace/settings/members?query=alex&role=member&status=suspended&invitationState=revoked&page=2",
    );

    await user.click(screen.getByRole("button", { name: "Reissue" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/workspaces/workspace-id/invitations/revoked-invitation/reissue",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(
      (screen.getByLabelText("One-time invitation link") as HTMLInputElement)
        .value,
    ).toMatch(/rotated-token/);
  });
});
