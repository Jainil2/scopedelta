import { describe, expect, it } from "vitest";

import { initials } from "./utils";

describe("initials", () => {
  it("is a server-safe formatter for account and workspace names", () => {
    expect(initials("Alex Rivera")).toBe("AR");
    expect(initials(" ScopeDelta   Studio ")).toBe("SS");
    expect(initials("")).toBe("");
  });
});
