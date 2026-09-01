import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/current", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));

import { NavigationFeedback } from "./navigation-feedback";

describe("navigation feedback", () => {
  it("announces an internal route transition until the route changes", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/current");
    const { container, rerender } = render(
      <>
        <NavigationFeedback />
        <a href="/next" onClick={(event) => event.preventDefault()}>
          Next view
        </a>
      </>,
    );

    await user.click(screen.getByRole("link", { name: "Next view" }));

    expect(container.querySelector(".navigation-feedback")).toHaveAttribute(
      "data-active",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the next view…",
    );

    route.pathname = "/next";
    rerender(
      <>
        <NavigationFeedback />
        <a href="/next">Next view</a>
      </>,
    );

    expect(container.querySelector(".navigation-feedback")).not.toHaveAttribute(
      "data-active",
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
