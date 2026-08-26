// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/v1/desktop/bootstrap", () => {
  it("returns only the protocol identity and canonical origin", async () => {
    vi.stubEnv("APP_URL", "https://app.example.test/some-configured-path/");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).not.toContain("public");
    expect(await response.json()).toEqual({
      product: "scopedelta",
      protocolVersion: 1,
      canonicalOrigin: "https://app.example.test",
    });
  });
});
