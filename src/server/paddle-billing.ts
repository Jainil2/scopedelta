import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { getAppUrl } from "@/lib/env";
import { PlatformError } from "@/lib/platform-errors";

const paddleResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    checkout: z.object({ url: z.string().url().nullable() }).nullable(),
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
  timeoutMs: number;
};

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
    process.env.PADDLE_API_BASE_URL?.trim() || "https://sandbox-api.paddle.com";
  const parsed = new URL(configuredBase);
  const timeoutMs = Number(process.env.PADDLE_TIMEOUT_MS?.trim() || "8000");
  if (
    !apiKey ||
    (!configuredBase.startsWith("https://") &&
      parsed.hostname !== "localhost") ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 15_000
  ) {
    throw new Error("paddle_sandbox_unconfigured");
  }
  return {
    apiKey,
    apiBaseUrl: configuredBase.replace(/\/$/, ""),
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
  workspaceSlug: string;
  planKey: string;
  priceId: string;
  checkoutAttemptId: string;
}) {
  const returnUrl = `${getAppUrl()}/app/${input.workspaceSlug}/settings/billing?checkout=returned`;
  const payload = paddleResponseSchema.parse(
    await paddleRequest("/transactions", {
      items: [{ price_id: input.priceId, quantity: 1 }],
      collection_mode: "automatic",
      checkout: { url: returnUrl },
      custom_data: {
        scopedelta_workspace_id: input.workspaceId,
        scopedelta_plan_key: input.planKey,
        scopedelta_checkout_attempt_id: input.checkoutAttemptId,
      },
    }),
  );
  if (!payload.data.checkout?.url) {
    throw new PlatformError(
      "billing_checkout_unavailable",
      503,
      "The billing provider did not return a checkout link.",
    );
  }
  return {
    providerTransactionId: payload.data.id,
    checkoutUrl: payload.data.checkout.url,
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
