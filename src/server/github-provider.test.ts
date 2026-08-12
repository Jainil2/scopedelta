import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { verifyGitHubWebhookSignature } from "@/server/github-provider";

const originalEnv = { ...process.env };

describe("GitHub provider webhook boundary", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("accepts only an exact SHA-256 signature for the raw request bytes", () => {
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_SLUG = "scopedelta-test";
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
});
