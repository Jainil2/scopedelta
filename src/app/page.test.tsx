import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("states the customer, commercial promise, and paid-pilot action", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Turn scope creep into approved, billable work.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/software agencies & senior freelancers/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /apply for a paid pilot/i }).length,
    ).toBeGreaterThan(0);
  });

  it("labels the example as synthetic and keeps decisions human-reviewed", () => {
    render(<Home />);

    expect(screen.getByText("partially_in_scope")).toBeInTheDocument();
    expect(
      screen.getByText(/illustrative synthetic example/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/agency review is mandatory/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not make the final scope decision/i),
    ).toBeInTheDocument();
  });

  it("warns pilot applicants not to share confidential materials", () => {
    render(<Home />);

    expect(
      screen.getByText(/do not submit contracts, statements of work/i),
    ).toBeInTheDocument();
  });
});
