import { afterEach, describe, expect, it, vi } from "vitest";

import { requireSameOrigin } from "@/server/api-auth";

describe("API origin boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts only the canonical same-origin mutation source", () => {
    vi.stubEnv("APP_URL", "https://app.example.test");

    expect(() =>
      requireSameOrigin(
        new Request("https://app.example.test/api/v1/workspaces", {
          method: "POST",
          headers: { origin: "https://app.example.test" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      requireSameOrigin(
        new Request("https://app.example.test/api/v1/workspaces", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_origin" }));
    expect(() =>
      requireSameOrigin(
        new Request("https://app.example.test/api/v1/workspaces", {
          method: "POST",
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_origin" }));
  });
});
