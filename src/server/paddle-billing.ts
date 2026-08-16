import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { PlatformError } from "@/lib/platform-errors";

const paddleResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1),
  }),
});

const portalResponseSchema = z.object({
  data: z.object({
    urls: z.object({ general: z.object({ overview: z.string().url() }) }),
  }),
});

export type PaddleWebhookSubscription = {
  id: string;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled";
  customer_id: string;
  custom_data?: Record<string, unknown> | null;
  current_billing_period?: {
    starts_at: string;
    ends_at: string;
  } | null;
  scheduled_change?: {
    action: "cancel" | "pause" | "resume";
    effective_at: string;
  } | null;
  items: Array<{ price: { id: string } }>;
  updated_at?: string;
};

export type PaddleWebhookEvent = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: PaddleWebhookSubscription;
};

const webhookEventSchema = z.object({
  event_id: z.string().min(1).max(100),
  event_type: z.string().min(1).max(100),
  occurred_at: z.string().datetime({ offset: true }),
  data: z.object({
    id: z.string().min(1).max(100),
    status: z.enum(["active", "trialing", "past_due", "paused", "canceled"]),
    customer_id: z.string().min(1).max(100),
    custom_data: z.record(z.string(), z.unknown()).nullish(),
    current_billing_period: z
      .object({
        starts_at: z.string().datetime({ offset: true }),
        ends_at: z.string().datetime({ offset: true }),
      })
      .nullish(),
    scheduled_change: z
      .object({
        action: z.enum(["cancel", "pause", "resume"]),
        effective_at: z.string().datetime({ offset: true }),
      })
      .nullish(),
    items: z.array(z.object({ price: z.object({ id: z.string().min(1) }) })),
    updated_at: z.string().datetime({ offset: true }).optional(),
  }),
});

type PaddleConfig = {
  apiKey: string;
  apiBaseUrl: string;
  hostedCheckoutUrl: string;
  timeoutMs: number;
};

const PADDLE_SANDBOX_API_ORIGIN = "https://sandbox-api.paddle.com";
const PADDLE_SANDBOX_CHECKOUT_ORIGIN = "https://sandbox.pay.paddle.io";

function requireSandboxEnvironment() {
  const environment = process.env.PADDLE_ENVIRONMENT?.trim() || "sandbox";
  if (environment !== "sandbox") {
    throw new Error("paddle_sandbox_unconfigured");
  }
}

function getPaddleConfig(): PaddleConfig {
  requireSandboxEnvironment();
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  const configuredBase =
    process.env.PADDLE_API_BASE_URL?.trim() || PADDLE_SANDBOX_API_ORIGIN;
  const configuredHostedCheckout =
    process.env.PADDLE_HOSTED_CHECKOUT_URL?.trim();
  const timeoutMs = Number(process.env.PADDLE_TIMEOUT_MS?.trim() || "8000");
  let apiBaseUrl: URL;
  let hostedCheckoutUrl: URL;
  try {
    apiBaseUrl = new URL(configuredBase);
    hostedCheckoutUrl = new URL(configuredHostedCheckout || "invalid:");
  } catch {
    throw new Error("paddle_sandbox_unconfigured");
  }
  if (
    !apiKey ||
    !apiKey.startsWith("pdl_sdbx_") ||
    apiBaseUrl.origin !== PADDLE_SANDBOX_API_ORIGIN ||
    !["", "/"].includes(apiBaseUrl.pathname) ||
    Boolean(apiBaseUrl.search || apiBaseUrl.hash) ||
    Boolean(apiBaseUrl.username || apiBaseUrl.password) ||
    hostedCheckoutUrl.origin !== PADDLE_SANDBOX_CHECKOUT_ORIGIN ||
    !/^\/checkout\/hsc_[A-Za-z0-9_]+$/.test(hostedCheckoutUrl.pathname) ||
    Boolean(hostedCheckoutUrl.search || hostedCheckoutUrl.hash) ||
    Boolean(hostedCheckoutUrl.username || hostedCheckoutUrl.password) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 15_000
  ) {
    throw new Error("paddle_sandbox_unconfigured");
  }
  return {
    apiKey,
    apiBaseUrl: PADDLE_SANDBOX_API_ORIGIN,
    hostedCheckoutUrl: hostedCheckoutUrl.toString(),
    timeoutMs,
  };
}

function getPaddleWebhookSecret() {
  requireSandboxEnvironment();
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new Error("paddle_sandbox_unconfigured");
  }
  return webhookSecret;
}

async function paddleRequest(path: string, body: unknown) {
  const config = getPaddleConfig();
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs),
      redirect: "error",
    });
  } catch {
    throw new PlatformError(
      "billing_provider_unavailable",
      503,
      "The billing provider is temporarily unavailable.",
    );
  }
  if (!response.ok) {
    throw new PlatformError(
      "billing_provider_unavailable",
      503,
      "The billing provider is temporarily unavailable.",
    );
  }
  return response.json() as Promise<unknown>;
}

export async function createPaddleCheckout(input: {
  workspaceId: string;
  planKey: string;
  priceId: string;
  checkoutAttemptId: string;
  customerId?: string | null;
}) {
  const config = getPaddleConfig();
  const payload = paddleResponseSchema.parse(
    await paddleRequest("/transactions", {
      items: [{ price_id: input.priceId, quantity: 1 }],
      collection_mode: "automatic",
      checkout: { url: null },
      ...(input.customerId ? { customer_id: input.customerId } : {}),
      custom_data: {
        scopedelta_workspace_id: input.workspaceId,
        scopedelta_plan_key: input.planKey,
        scopedelta_checkout_attempt_id: input.checkoutAttemptId,
      },
    }),
  );
  const checkoutUrl = new URL(config.hostedCheckoutUrl);
  checkoutUrl.searchParams.set("transaction_id", payload.data.id);
  return {
    providerTransactionId: payload.data.id,
    checkoutUrl: checkoutUrl.toString(),
  };
}

export async function createPaddlePortal(
  customerId: string,
  subscriptionId?: string | null,
) {
  const payload = portalResponseSchema.parse(
    await paddleRequest(
      `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
      {
        ...(subscriptionId ? { subscription_ids: [subscriptionId] } : {}),
      },
    ),
  );
  return payload.data.urls.general.overview;
}

export function verifyPaddleWebhook(
  rawBody: string,
  signatureHeader: string | null,
  now = Date.now(),
) {
  const webhookSecret = getPaddleWebhookSecret();
  if (!signatureHeader) {
    throw new PlatformError("billing_webhook_invalid", 400, "Invalid webhook.");
  }
  const parts = signatureHeader.split(";").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "ts")?.[1];
  const signatures = parts
    .filter(([key]) => key === "h1")
    .map(([, value]) => value)
    .filter(Boolean);
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) {
    throw new PlatformError("billing_webhook_invalid", 400, "Invalid webhook.");
  }
  const ageMs = Math.abs(now - Number(timestamp) * 1_000);
  if (ageMs > 5_000) {
    throw new PlatformError("billing_webhook_stale", 400, "Invalid webhook.");
  }
  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}:${rawBody}`, "utf8")
    .digest();
  const valid = signatures.some((candidate) => {
    if (!/^[a-f\d]{64}$/i.test(candidate)) return false;
    const actual = Buffer.from(candidate, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  });
  if (!valid) {
    throw new PlatformError("billing_webhook_invalid", 400, "Invalid webhook.");
  }
  try {
    return webhookEventSchema.parse(JSON.parse(rawBody)) as PaddleWebhookEvent;
  } catch {
    throw new PlatformError("billing_webhook_invalid", 400, "Invalid webhook.");
  }
}
