import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkEngineeringPanel } from "@/components/engineering-workspace";

describe("work engineering evidence trace", () => {
  it("labels a historically passed verification as stale", () => {
    render(
      <WorkEngineeringPanel
        trace={{
          work: { identifier: "ENG-12" },
          implementation: [],
          verification: [
            {
              id: "verification-1",
              category: "QA regression",
              result: "passed",
              notes: null,
              referenceUrl: null,
              recordedAt: new Date("2026-08-12T10:00:00.000Z"),
              stale: true,
            },
          ],
          defects: [],
          acceptance: [],
        }}
      />,
    );

    expect(screen.getByText(/QA regression · passed .* · stale/)).toBeVisible();
  });
});
