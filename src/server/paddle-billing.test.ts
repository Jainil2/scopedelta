import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PlatformError } from "@/lib/platform-errors";

import { verifyPaddleWebhook } from "./paddle-billing";

const originalEnv = { ...process.env };

describe("Paddle sandbox webhook verification", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_API_KEY: "pdl_sdbx_test_key",
      PADDLE_WEBHOOK_SECRET: "pdl_ntfset_test_secret",
      PADDLE_API_BASE_URL: "https://sandbox-api.paddle.com",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("accepts the exact raw body and any valid h1 during signature rotation", () => {
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1_000));
    const body = JSON.stringify(event());
    const signature = createHmac("sha256", process.env.PADDLE_WEBHOOK_SECRET!)
      .update(`${timestamp}:${body}`)
      .digest("hex");

    expect(
      verifyPaddleWebhook(
        body,
        `ts=${timestamp};h1=${"0".repeat(64)};h1=${signature}`,
        now,
      ),
    ).toMatchObject({
      event_id: "evt_current",
      event_type: "subscription.updated",
    });
  });

  it("can reconcile a webhook while the outbound API key is unavailable", () => {
    delete process.env.PADDLE_API_KEY;
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1_000));
    const body = JSON.stringify(event());
    const signature = createHmac("sha256", process.env.PADDLE_WEBHOOK_SECRET!)
      .update(`${timestamp}:${body}`)
      .digest("hex");

    expect(
      verifyPaddleWebhook(body, `ts=${timestamp};h1=${signature}`, now),
    ).toMatchObject({ event_id: "evt_current" });
  });

  it("rejects changed bodies, stale timestamps, and malformed events", () => {
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1_000));
    const body = JSON.stringify(event());
    const signature = createHmac("sha256", process.env.PADDLE_WEBHOOK_SECRET!)
      .update(`${timestamp}:${body}`)
      .digest("hex");

    expect(() =>
      verifyPaddleWebhook(`${body} `, `ts=${timestamp};h1=${signature}`, now),
    ).toThrowError(PlatformError);
    expect(() =>
      verifyPaddleWebhook(body, `ts=${timestamp};h1=${signature}`, now + 6_000),
    ).toThrowError(/Invalid webhook/);

    const malformed = "{}";
    const malformedSignature = createHmac(
      "sha256",
      process.env.PADDLE_WEBHOOK_SECRET!,
    )
      .update(`${timestamp}:${malformed}`)
      .digest("hex");
    expect(() =>
      verifyPaddleWebhook(
        malformed,
        `ts=${timestamp};h1=${malformedSignature}`,
        now,
      ),
    ).toThrowError(PlatformError);
  });
});

function event() {
  return {
    event_id: "evt_current",
    event_type: "subscription.updated",
    occurred_at: "2026-08-16T00:00:00.000Z",
    data: {
      id: "sub_test",
      status: "active",
      customer_id: "ctm_test",
      custom_data: { scopedelta_workspace_id: "workspace" },
      current_billing_period: {
        starts_at: "2026-08-01T00:00:00.000Z",
        ends_at: "2026-09-01T00:00:00.000Z",
      },
      scheduled_change: null,
      items: [{ price: { id: "pri_test" } }],
    },
  };
}
