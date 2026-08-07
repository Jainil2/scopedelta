// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_LEAD_BODY_BYTES } from "@/lib/leads";

import { POST } from "./route";

const submissionId = "8f250d9e-01b8-47ad-84ce-e3215eca4cbe";
const validSubmission = {
  submissionId,
  name: "  Alex Rivera  ",
  email: " Alex@Example.com ",
  businessType: "agency",
  company: "  River Studio  ",
  scopeChallenge:
    "  Requests arrive in chat and get built before the commercial conversation.  ",
  website: "",
};

function leadRequest(body: unknown, headers?: HeadersInit) {
  return new Request("http://localhost:3000/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/leads", () => {
  it("forwards one normalized, versioned event with an idempotency key", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "https://example.test/pilot-leads");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(leadRequest(validSubmission));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe("https://example.test/pilot-leads");
    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("error");
    expect(request.headers).toMatchObject({
      "Content-Type": "application/json",
      "Idempotency-Key": submissionId,
      "X-ScopeDelta-Event": "pilot_interest.submitted",
    });

    const event = JSON.parse(request.body as string);
    expect(event).toMatchObject({
      event: "pilot_interest.submitted",
      schemaVersion: "1.0",
      submissionId,
      source: "scopedelta_landing_page",
      lead: {
        name: "Alex Rivera",
        email: "alex@example.com",
        businessType: "agency",
        company: "River Studio",
        scopeChallenge:
          "Requests arrive in chat and get built before the commercial conversation.",
      },
    });
    expect(event.submittedAt).toEqual(expect.any(String));
  });

  it("returns field errors without forwarding invalid input", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "https://example.test/pilot-leads");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      leadRequest({
        ...validSubmission,
        email: "not-an-email",
        scopeChallenge: "short",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      code: "validation_error",
      fieldErrors: {
        email: expect.any(String),
        scopeChallenge: expect.any(String),
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized body before parsing or forwarding", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      leadRequest(validSubmission, {
        "Content-Length": String(MAX_LEAD_BODY_BYTES + 1),
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "payload_too_large",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a recoverable error when the webhook is not configured", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(leadRequest(validSubmission));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "submission_unavailable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "http://example.test/pilot-leads",
    "http://localhost.example.test/pilot-leads",
  ])(
    "rejects the insecure non-local webhook %s without forwarding",
    async (webhookUrl) => {
      vi.stubEnv("LEAD_WEBHOOK_URL", webhookUrl);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(leadRequest(validSubmission));

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        ok: false,
        code: "submission_unavailable",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    "http://localhost:3901/pilot-leads",
    "http://127.42.0.2:3901/pilot-leads",
    "http://[::1]:3901/pilot-leads",
  ])("allows the local development webhook %s", async (webhookUrl) => {
    vi.stubEnv("LEAD_WEBHOOK_URL", webhookUrl);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(leadRequest(validSubmission));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0][0] as URL).href).toBe(webhookUrl);
  });

  it("does not expose upstream details when the webhook rejects the event", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "https://example.test/pilot-leads");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("provider account disabled", { status: 500 }),
        ),
    );

    const response = await POST(leadRequest(validSubmission));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ ok: false, code: "submission_unavailable" });
    expect(JSON.stringify(body)).not.toContain("provider account disabled");
  });

  it("returns the same safe response when the upstream request times out", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "https://example.test/pilot-leads");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")),
    );

    const response = await POST(leadRequest(validSubmission));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "submission_unavailable",
    });
  });

  it("accepts honeypot submissions without validation or forwarding", async () => {
    vi.stubEnv("LEAD_WEBHOOK_URL", "https://example.test/pilot-leads");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(leadRequest({ website: "spam.example" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
