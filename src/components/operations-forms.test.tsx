import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimeEntryForm } from "@/components/operations-forms";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("operations forms", () => {
  it("uses the workspace-local date supplied by the server", () => {
    render(
      <TimeEntryForm
        workspaceId="workspace"
        projects={[{ id: "project", key: "OPS", name: "Operations" }]}
        defaultWorkDate="2026-08-19"
      />,
    );

    expect(screen.getByLabelText("Work date")).toHaveValue("2026-08-19");
  });
});
