import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders the application foundation message", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Application foundation is ready.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/web application can be developed, tested, and built/i),
    ).toBeInTheDocument();
  });
});
