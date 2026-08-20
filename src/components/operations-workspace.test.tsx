import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CapacityLedger,
  ExposureLedger,
  PortfolioLedger,
  TimeLedger,
} from "@/components/operations-workspace";

describe("operations ledger projection", () => {
  it("keeps estimate, availability, planning, actuals, and masked work distinct", () => {
    render(
      <CapacityLedger
        data={{
          startWeek: "2026-08-17",
          weeks: ["2026-08-17"],
          canManageAvailability: false,
          members: [
            {
              id: "member",
              name: "Sam",
              email: "sam@example.test",
              estimateContext: {
                assignedWorkCount: 2,
                estimatePoints: 8,
                unscheduledCount: 1,
              },
              weeks: [
                {
                  week: "2026-08-17",
                  availableMinutes: 2_400,
                  allocatedMinutes: 3_000,
                  actualMinutes: 900,
                  overallocatedMinutes: 600,
                  allocations: [
                    {
                      id: "masked",
                      memberUserId: "member",
                      projectId: null,
                      projectKey: null,
                      projectName: "Other committed work",
                      leadUserId: "other",
                      startWeek: "2026-08-17",
                      endWeek: "2026-08-17",
                      plannedMinutesPerWeek: 3_000,
                      roleLabel: null,
                    },
                  ],
                },
              ],
            },
          ],
          page: { number: 1, size: 25, total: 1, pages: 1 },
        }}
      />,
    );
    expect(
      screen.getByText(/Unscheduled work · 2 items · 8 points/),
    ).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByText("Actual")).toBeInTheDocument();
    expect(screen.getByText("Other committed work")).toBeInTheDocument();
    expect(screen.getByText("10h")).toBeInTheDocument();
  });

  it("renders exact portfolio drill targets", () => {
    render(
      <PortfolioLedger
        workspaceSlug="agency"
        data={{
          items: [
            {
              id: "project",
              key: "WEB",
              name: "Website",
              lifecycle: "active",
              targetDate: null,
              clientId: "client",
              clientName: "Acme",
              leadUserId: "lead",
              leadName: "Lead",
              nextMilestoneId: "milestone",
              nextMilestoneName: "Launch",
              nextMilestoneTargetDate: "2026-08-18",
              canViewCommercial: true,
              signals: [
                {
                  category: "unresolved_defect",
                  count: 2,
                  href: "/app/agency/projects/WEB/engineering#defects",
                },
              ],
            },
          ],
          page: { number: 1, size: 25, total: 1, pages: 1 },
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /Open defect/ })).toHaveAttribute(
      "href",
      "/app/agency/projects/WEB/engineering#defects",
    );
  });

  it("provides explicit empty states", () => {
    const { rerender } = render(
      <PortfolioLedger
        workspaceSlug="agency"
        data={{ items: [], page: { number: 1, size: 25, total: 0, pages: 1 } }}
      />,
    );
    expect(screen.getByText("No active projects")).toBeInTheDocument();
    rerender(
      <TimeLedger
        data={{
          items: [],
          aggregate: { billableMinutes: 0, nonBillableMinutes: 0 },
          page: { number: 1, size: 25, total: 0, pages: 1 },
        }}
      />,
    );
    expect(screen.getByText("No delivery time")).toBeInTheDocument();
    rerender(
      <ExposureLedger
        data={{ items: [], page: { number: 1, size: 25, total: 0, pages: 1 } }}
      />,
    );
    expect(screen.getByText("No commercial data")).toBeInTheDocument();
  });
});
