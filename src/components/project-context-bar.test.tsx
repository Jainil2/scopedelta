import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/app/northstar/projects/NOVA/backlog",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

import { ProjectContextBar } from "./project-context-bar";

const project = {
  key: "NOVA",
  name: "Wholesale portal",
  clientName: "Nova Wholesale",
  leadName: "Alex Rivera",
  lifecycle: "active",
};

describe("project context navigation", () => {
  beforeEach(() => {
    navigation.pathname = "/app/northstar/projects/NOVA/backlog";
  });

  it("shows identity, active routes, manager links, and immediate loading feedback", async () => {
    const user = userEvent.setup();
    render(
      <ProjectContextBar
        workspaceSlug="northstar"
        project={project}
        canManageProject
      />,
    );

    expect(
      screen.getByRole("region", { name: "Project context" }),
    ).toHaveTextContent("Nova Wholesale");
    expect(screen.getByRole("link", { name: "Backlog" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Commercial" })).toBeVisible();
    const moreTrigger = screen.getByRole("button", { name: "More" });
    await user.click(moreTrigger);
    expect(
      await screen.findByRole("menuitem", { name: "Engineering & QA" }),
    ).toHaveAttribute("href", "/app/northstar/projects/NOVA/engineering");
    expect(moreTrigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("menuitem", { name: "Client collaboration" }),
    ).toHaveAttribute("href", "/app/northstar/projects/NOVA/client");

    window.addEventListener("click", (event) => event.preventDefault(), {
      capture: true,
      once: true,
    });
    await user.click(screen.getByRole("menuitem", { name: "Activity" }));
    await waitFor(() =>
      expect(moreTrigger).toHaveAttribute("aria-expanded", "false"),
    );

    window.addEventListener("click", (event) => event.preventDefault(), {
      capture: true,
      once: true,
    });
    await user.click(screen.getByRole("link", { name: "Board" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading project workspace…",
    );
  });

  it("hides manager-only routes from ordinary members and identifies an active secondary route", async () => {
    const user = userEvent.setup();
    navigation.pathname = "/app/northstar/projects/NOVA/activity";
    render(
      <ProjectContextBar
        workspaceSlug="northstar"
        project={project}
        canManageProject={false}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Commercial" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Client collaboration" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("More · Activity")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "More · Activity" }));
    expect(
      await screen.findByRole("menuitem", { name: "Activity" }),
    ).toHaveAttribute("aria-current", "page");
  });
});
