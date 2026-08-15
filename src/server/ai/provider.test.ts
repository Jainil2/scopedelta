import { describe, expect, it, vi } from "vitest";

import type { AiConfig, AiProviderName } from "@/lib/env";

import { AiProviderError, createAiProvider } from "./provider";

function config(provider: AiProviderName): AiConfig {
  return {
    enabled: true,
    provider,
    model: "test-model",
    apiKey: provider === "ollama" ? undefined : "test-secret",
    baseUrl:
      provider === "ollama"
        ? "http://127.0.0.1:11434"
        : "https://provider.test/v1",
    timeoutMs: 50,
    responseBytes: 10_000,
    contextCharacters: 40_000,
    outputTokens: 4_000,
    runningPerUser: 1,
    runningPerWorkspace: 3,
    startsPerUserHour: 10,
    startsPerWorkspaceDay: 100,
  };
}

const input = {
  schemaName: "delivery_risk_brief",
  schema: {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
    additionalProperties: false,
  },
  system: "Use evidence.",
  prompt: '{"facts":[]}',
};

describe("AI provider boundary", () => {
  it("normalizes OpenAI Responses structured output and disables storage", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        id: "resp_123",
        output: [
          { content: [{ type: "output_text", text: '{"answer":"ok"}' }] },
        ],
        usage: {
          input_tokens: 21,
          output_tokens: 7,
          input_tokens_details: { cached_tokens: 5 },
        },
      }),
    );
    const result = await createAiProvider(config("openai"), fetcher).generate(
      input,
    );
    expect(result).toMatchObject({
      output: { answer: "ok" },
      providerRequestId: "resp_123",
      usage: { inputTokens: 21, outputTokens: 7, cachedInputTokens: 5 },
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
  });

  it("normalizes Anthropic Messages structured output", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        id: "msg_123",
        content: [{ type: "text", text: '{"answer":"ok"}' }],
        usage: {
          input_tokens: 10,
          output_tokens: 4,
          cache_read_input_tokens: 3,
        },
      }),
    );
    const result = await createAiProvider(
      config("anthropic"),
      fetcher,
    ).generate(input);
    expect(result).toMatchObject({
      output: { answer: "ok" },
      providerRequestId: "msg_123",
      usage: { inputTokens: 10, outputTokens: 4, cachedInputTokens: 3 },
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.output_config.format).toMatchObject({ type: "json_schema" });
  });

  it("normalizes Gemini generateContent structured output", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        responseId: "gemini_123",
        candidates: [
          {
            content: { parts: [{ text: '{"answer":"ok"}' }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 8,
          candidatesTokenCount: 3,
          cachedContentTokenCount: 2,
        },
      }),
    );
    const result = await createAiProvider(config("gemini"), fetcher).generate(
      input,
    );
    expect(result).toMatchObject({
      output: { answer: "ok" },
      providerRequestId: "gemini_123",
      usage: { inputTokens: 8, outputTokens: 3, cachedInputTokens: 2 },
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      responseJsonSchema: input.schema,
    });
  });

  it("normalizes Ollama chat structured output without an API key", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        message: { role: "assistant", content: '{"answer":"ok"}' },
        prompt_eval_count: 9,
        eval_count: 4,
      }),
    );
    const result = await createAiProvider(config("ollama"), fetcher).generate(
      input,
    );
    expect(result).toMatchObject({
      output: { answer: "ok" },
      usage: { inputTokens: 9, outputTokens: 4 },
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ stream: false, format: input.schema });
  });

  it("normalizes refusals and rate limits without leaking provider bodies", async () => {
    const refusal = vi.fn().mockResolvedValue(
      Response.json({
        output: [{ content: [{ type: "refusal", refusal: "private reason" }] }],
      }),
    );
    await expect(
      createAiProvider(config("openai"), refusal).generate(input),
    ).rejects.toMatchObject({ code: "provider_refusal" });

    const limited = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { message: "secret provider detail" } },
          { status: 429 },
        ),
      );
    await expect(
      createAiProvider(config("openai"), limited).generate(input),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AiProviderError>>({
        code: "provider_rate_limited",
        message: "The AI provider rate limit was reached.",
      }),
    );
  });

  it("rejects malformed, oversized, and timed-out provider responses", async () => {
    const malformed = vi
      .fn()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(
      createAiProvider(config("ollama"), malformed).generate(input),
    ).rejects.toMatchObject({ code: "provider_malformed_response" });

    const oversizedConfig = { ...config("ollama"), responseBytes: 10 };
    const oversized = vi.fn().mockResolvedValue(
      new Response('{"message":{"content":"too long"}}', {
        headers: { "content-length": "40" },
      }),
    );
    await expect(
      createAiProvider(oversizedConfig, oversized).generate(input),
    ).rejects.toMatchObject({ code: "provider_response_too_large" });

    const timeoutConfig = { ...config("ollama"), timeoutMs: 5 };
    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    await expect(
      createAiProvider(timeoutConfig, hanging as typeof fetch).generate(input),
    ).rejects.toMatchObject({ code: "provider_timeout" });
  });
});
