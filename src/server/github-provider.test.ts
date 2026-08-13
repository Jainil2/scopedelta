import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getGitHubUserInstallationRepository,
  githubCheckRollup,
  verifyGitHubWebhookSignature,
} from "@/server/github-provider";

const originalEnv = { ...process.env };

describe("GitHub provider webhook boundary", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("accepts only an exact SHA-256 signature for the raw request bytes", () => {
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_SLUG = "scopedelta-test";
    process.env.GITHUB_APP_CLIENT_ID = "Iv1.test-client";
    process.env.GITHUB_APP_CLIENT_SECRET = "test-client-secret";
    process.env.GITHUB_APP_PRIVATE_KEY = "test-key";
    process.env.GITHUB_APP_WEBHOOK_SECRET = "a-test-webhook-secret-long-enough";
    const body = JSON.stringify({ action: "opened", number: 12 });
    const signature = `sha256=${createHmac(
      "sha256",
      process.env.GITHUB_APP_WEBHOOK_SECRET,
    )
      .update(body)
      .digest("hex")}`;

    expect(verifyGitHubWebhookSignature(body, signature)).toBe(true);
    expect(verifyGitHubWebhookSignature(`${body}\n`, signature)).toBe(false);
    expect(verifyGitHubWebhookSignature(body, "sha256=invalid")).toBe(false);
  });

  it("rejects a known installation when the authorizing user cannot access it", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      );
    vi.stubGlobal("fetch", request);

    await expect(
      getGitHubUserInstallationRepository(
        "user-token",
        "4242424242",
        "customer/private-delivery",
      ),
    ).rejects.toThrow("github_provider_404");
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("/user/installations/4242424242/repositories"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer user-token",
        }),
      }),
    );
  });

  it("requires repository-admin authority before accepting an installation grant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          repositories: [
            {
              id: 99,
              name: "private-delivery",
              full_name: "customer/private-delivery",
              html_url: "https://github.com/customer/private-delivery",
              private: true,
              default_branch: "main",
              owner: { login: "customer" },
              permissions: { admin: false },
            },
          ],
        }),
      ),
    );

    await expect(
      getGitHubUserInstallationRepository(
        "collaborator-token",
        "4242424242",
        "customer/private-delivery",
      ),
    ).rejects.toThrow("github_provider_403");
  });

  it("accepts the exact installation repository for an authorizing administrator", async () => {
    const repository = {
      id: 99,
      name: "private-delivery",
      full_name: "customer/private-delivery",
      html_url: "https://github.com/customer/private-delivery",
      private: true,
      default_branch: "main",
      owner: { login: "customer" },
      permissions: { admin: true },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ repositories: [repository] })),
    );

    await expect(
      getGitHubUserInstallationRepository(
        "administrator-token",
        "4242424242",
        "customer/private-delivery",
      ),
    ).resolves.toEqual(repository);
  });

  it("treats absent check and status evidence as unknown", () => {
    expect(
      githubCheckRollup(
        { total_count: 0, check_runs: [] },
        { state: "pending", total_count: 0 },
      ),
    ).toBe("unknown");
  });

  it("never promotes a truncated check-run page to passing", () => {
    expect(
      githubCheckRollup(
        {
          total_count: 101,
          check_runs: Array.from({ length: 100 }, () => ({
            status: "completed",
            conclusion: "success",
          })),
        },
        { state: "success", total_count: 1 },
      ),
    ).toBe("unknown");
  });
});
