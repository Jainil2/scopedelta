import {
  MAX_LEAD_BODY_BYTES,
  type LeadApiResponse,
  validateLeadSubmission,
} from "@/lib/leads";

export const runtime = "nodejs";

const webhookTimeoutMs = 8_000;

function json(body: LeadApiResponse, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readLimitedBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_LEAD_BODY_BYTES) {
    return null;
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > MAX_LEAD_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

function getWebhookUrl() {
  const configuredUrl = process.env.LEAD_WEBHOOK_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    if (url.protocol === "https:") return url;

    return url.protocol === "http:" && isLoopbackHostname(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (normalizedHostname === "localhost" || normalizedHostname === "::1") {
    return true;
  }

  const ipv4Parts = normalizedHostname.split(".");
  return (
    ipv4Parts.length === 4 &&
    ipv4Parts[0] === "127" &&
    ipv4Parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      const value = Number(part);
      return value >= 0 && value <= 255;
    })
  );
}

export async function POST(request: Request) {
  const rawBody = await readLimitedBody(request);
  if (rawBody === null) {
    return json(
      {
        ok: false,
        code: "payload_too_large",
        message:
          "That submission is too large. Shorten your response and retry.",
      },
      413,
    );
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return json(
      {
        ok: false,
        code: "validation_error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: {},
      },
      400,
    );
  }

  const rawWebsite =
    typeof input === "object" &&
    input !== null &&
    typeof (input as Record<string, unknown>).website === "string"
      ? (input as Record<string, string>).website.trim()
      : "";

  if (rawWebsite) return json({ ok: true }, 200);

  const result = validateLeadSubmission(input);
  if (!result.success) {
    return json(
      {
        ok: false,
        code: "validation_error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: result.fieldErrors,
      },
      400,
    );
  }

  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return json(
      {
        ok: false,
        code: "submission_unavailable",
        message:
          "We could not send your application. Your answers are still here—please try again shortly.",
      },
      503,
    );
  }

  const lead = result.data;
  const event = {
    event: "pilot_interest.submitted",
    schemaVersion: "1.0",
    submissionId: lead.submissionId,
    submittedAt: new Date().toISOString(),
    source: "scopedelta_landing_page",
    lead: {
      name: lead.name,
      email: lead.email,
      businessType: lead.businessType,
      company: lead.company,
      scopeChallenge: lead.scopeChallenge,
    },
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": lead.submissionId,
        "X-ScopeDelta-Event": event.event,
      },
      body: JSON.stringify(event),
      redirect: "error",
      signal: AbortSignal.timeout(webhookTimeoutMs),
    });

    if (!response.ok) {
      return json(
        {
          ok: false,
          code: "submission_unavailable",
          message:
            "We could not send your application. Your answers are still here—please try again shortly.",
        },
        502,
      );
    }
  } catch {
    return json(
      {
        ok: false,
        code: "submission_unavailable",
        message:
          "We could not send your application. Your answers are still here—please try again shortly.",
      },
      502,
    );
  }

  return json({ ok: true }, 200);
}
