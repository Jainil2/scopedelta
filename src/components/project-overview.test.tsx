import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ProjectOverview } from "./delivery-workspace";

const baseProps = {
  workspaceId: "workspace-one",
  workspaceSlug: "northstar",
  project: {
    id: "project-one",
    key: "NOVA",
    name: "Wholesale portal",
    summary: "Make wholesale changes reviewable.",
    lifecycle: "active" as const,
    clientName: "Nova Wholesale",
    leadUserId: "user-lead",
    leadName: "Alex Rivera",
    startDate: "2026-08-01",
    targetDate: "2026-09-30",
    counts: [
      { status: "backlog", total: 3 },
      { status: "in_progress", total: 2 },
    ],
  },
  milestones: [],
  cycles: [],
  attention: {
    items: [],
    pageInfo: { page: 1, pageSize: 5, total: 0, hasNextPage: false },
  },
  commercial: null,
  projectMembers: [
    {
      userId: "user-lead",
      name: "Alex Rivera",
      email: "alex@example.com",
      workspaceRole: "member",
    },
  ],
  workspaceMembers: [],
  workspaceMemberPageInfo: { number: 1, size: 50, total: 0, pages: 0 },
  canManage: false,
};

describe("project command center", () => {
  it("renders factual empty plan, attention, and single-lead team states", () => {
    render(<ProjectOverview {...baseProps} />);

    expect(
      screen.getByRole("region", { name: "Delivery status" }),
    ).toHaveTextContent("3Backlog");
    expect(
      screen.getByText("No actionable project work is assigned to you."),
    ).toBeVisible();
    expect(screen.getByText("No active or planned cycle")).toBeVisible();
    expect(screen.getByText("No unfinished milestone")).toBeVisible();
    expect(screen.getByText("1 members")).toBeVisible();
    expect(screen.queryByText("Delivery drift")).not.toBeInTheDocument();
  });

  it("shows assigned attention, current delivery horizon, baseline, and all drift counts", () => {
    render(
      <ProjectOverview
        {...baseProps}
        cycles={[
          {
            id: "cycle-one",
            sequence: 2,
            name: "Review sprint",
            startDate: "2026-08-24",
            endDate: "2026-09-04",
            lifecycle: "active",
            goal: "Close wholesale review gaps",
          },
        ]}
        milestones={[
          {
            id: "milestone-one",
            name: "Buyer review",
            description: null,
            targetDate: "2026-09-08",
            status: "planned",
          },
        ]}
        attention={{
          items: [
            {
              id: "work-one",
              identifier: "NOVA-7",
              title: "Confirm wholesale change-order review",
              status: "in_review",
              priority: "high",
              targetDate: "2026-09-01",
            },
          ],
          pageInfo: { page: 1, pageSize: 5, total: 1, hasNextPage: false },
        }}
        commercial={{
          counts: {
            linked: 8,
            stale_basis: 2,
            commercially_unlinked: 3,
            needs_classification: 1,
            support_internal: 4,
          },
          affectedTotal: 6,
          baseline: {
            versionId: "baseline-one",
            versionNumber: 3,
            label: "Signed scope",
            state: "published",
            effectiveAt: "2026-08-20T00:00:00.000Z",
          },
        }}
      />,
    );

    expect(
      screen.getByRole("link", {
        name: /Confirm wholesale change-order review/,
      }),
    ).toBeVisible();
    expect(screen.getByText("Review sprint")).toBeVisible();
    expect(screen.getByText(/Buyer review · 2026-09-08/)).toBeVisible();
    expect(screen.getByText("Signed scope · version 3")).toBeVisible();
    const drift = screen
      .getByRole("heading", { name: "Delivery drift" })
      .closest("section");
    expect(drift).toHaveTextContent("Unlinked3");
    expect(drift).toHaveTextContent("Stale basis2");
    expect(drift).toHaveTextContent("Classify1");
    expect(drift).toHaveTextContent("Linked8");
    expect(drift).toHaveTextContent("Support / internal4");
  });
});
