import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformError } from "@/lib/platform-errors";

import { createPaddleCheckout, verifyPaddleWebhook } from "./paddle-billing";

const originalEnv = { ...process.env };

describe("Paddle sandbox webhook verification", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_API_KEY: "pdl_sdbx_test_key",
      PADDLE_WEBHOOK_SECRET: "pdl_ntfset_test_secret",
      PADDLE_API_BASE_URL: "https://sandbox-api.paddle.com",
      PADDLE_HOSTED_CHECKOUT_URL:
        "https://sandbox.pay.paddle.io/checkout/hsc_scope_delta_test",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
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

describe("Paddle sandbox checkout configuration", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      APP_URL: "https://app.scopedelta.test",
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_API_KEY: "pdl_sdbx_test_key",
      PADDLE_API_BASE_URL: "https://sandbox-api.paddle.com",
      PADDLE_HOSTED_CHECKOUT_URL:
        "https://sandbox.pay.paddle.io/checkout/hsc_scope_delta_test",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("opens the created transaction on Paddle's sandbox-hosted payment flow", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          id: "txn_test",
          checkout: {
            url: "https://app.scopedelta.test/settings/billing?_ptxn=txn_test",
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkout({ customerId: "ctm_test" })).resolves.toEqual({
      providerTransactionId: "txn_test",
      checkoutUrl:
        "https://sandbox.pay.paddle.io/checkout/hsc_scope_delta_test?transaction_id=txn_test",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://sandbox-api.paddle.com/transactions",
    );
    const request = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    ) as Record<string, unknown>;
    expect(request).toMatchObject({
      collection_mode: "automatic",
      checkout: { url: null },
      customer_id: "ctm_test",
    });
    expect(JSON.stringify(request)).not.toContain("app.scopedelta.test");
  });

  it.each([
    ["live environment", "PADDLE_ENVIRONMENT", "live"],
    ["live API origin", "PADDLE_API_BASE_URL", "https://api.paddle.com"],
    ["live API key", "PADDLE_API_KEY", "pdl_live_test_key"],
    [
      "live hosted checkout",
      "PADDLE_HOSTED_CHECKOUT_URL",
      "https://pay.paddle.io/checkout/hsc_scope_delta_test",
    ],
  ])("rejects a %s before calling Paddle", async (_label, name, value) => {
    process.env[name] = value;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkout()).rejects.toThrow("paddle_sandbox_unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function checkout(input: { customerId?: string } = {}) {
  return createPaddleCheckout({
    workspaceId: "workspace",
    planKey: "paid_test",
    priceId: "pri_test",
    checkoutAttemptId: "attempt",
    customerId: input.customerId,
  });
}

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
