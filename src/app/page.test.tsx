import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("states the customer, commercial promise, and paid-pilot action", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Make every scope change visible before margin disappears.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/small software agencies and senior freelancers/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /apply for a paid pilot/i }).length,
    ).toBeGreaterThan(0);
  });

  it("labels the example as synthetic and keeps decisions human-reviewed", () => {
    render(<Home />);

    expect(screen.getAllByText(/partially in scope/i).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByText(/illustrative synthetic example/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/human review required/i)).toBeInTheDocument();
    expect(
      screen.getByText(/without letting AI make the final call/i),
    ).toBeInTheDocument();
  });

  it("warns pilot applicants not to share confidential materials", () => {
    render(<Home />);

    expect(
      screen.getByText(/do not submit contracts, statements of work/i),
    ).toBeInTheDocument();
  });
});
