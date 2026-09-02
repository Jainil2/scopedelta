import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  usePathname: () => "/app/northstar-delivery-a1b2c3d4/clients",
}));

import { AppShell } from "./app-shell";

describe("authenticated application shell", () => {
  it("exposes workspace switching, role, navigation, and keyboard landmarks", async () => {
    const user = userEvent.setup();
    render(
      <AppShell
        current={{
          id: "workspace-one",
          name: "Northstar Delivery",
          slug: "northstar-delivery-a1b2c3d4",
          role: "owner",
        }}
        workspaces={[
          {
            id: "workspace-one",
            name: "Northstar Delivery",
            slug: "northstar-delivery-a1b2c3d4",
            role: "owner",
          },
          {
            id: "workspace-two",
            name: "River Studio",
            slug: "river-studio-e5f6a7b8",
            role: "member",
          },
        ]}
        userId="user-one"
        userName="Alex Rivera"
      >
        <h1>Workspace overview</h1>
      </AppShell>,
    );

    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeVisible();
    await user.click(
      screen.getByText("Northstar Delivery", { selector: "strong" }),
    );
    expect(await screen.findByText("Switch workspace")).toBeVisible();
    expect(screen.getAllByText("owner")).not.toHaveLength(0);
    expect(
      screen.getByRole("menuitem", { name: /River Studio/ }),
    ).toHaveAttribute("href", "/app/river-studio-e5f6a7b8");
    expect(
      screen.getByRole("menuitem", { name: /New workspace/ }),
    ).toHaveAttribute("href", "/onboarding");
    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("link", { name: "Clients" })).toHaveAttribute(
      "href",
      "/app/northstar-delivery-a1b2c3d4/clients",
    );
    expect(screen.getByRole("link", { name: "Clients" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("heading", { name: "Delivery" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Communication" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Administration" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Workspace" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute(
      "href",
      "/app/northstar-delivery-a1b2c3d4/projects",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(screen.getByText("Browser tools unavailable")).toBeVisible();
  });

  it("opens the mobile workspace navigation as an accessible sheet", async () => {
    const user = userEvent.setup();
    render(
      <AppShell
        current={{
          id: "workspace-one",
          name: "Northstar Delivery",
          slug: "northstar-delivery-a1b2c3d4",
          role: "owner",
        }}
        workspaces={[]}
        userId="user-one"
        userName="Alex Rivera"
      >
        <h1>Workspace overview</h1>
      </AppShell>,
    );

    await user.click(
      screen.getByRole("button", { name: "Open workspace navigation" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Workspace navigation" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
  });
});
