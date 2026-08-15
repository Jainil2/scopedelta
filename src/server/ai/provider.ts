import "server-only";

import type { AiConfig, AiProviderName } from "@/lib/env";

export type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
};

export type AiGeneration = {
  output: unknown;
  providerRequestId?: string;
  usage: AiUsage;
  durationMs: number;
  provider: AiProviderName;
  model: string;
};

export type AiGenerateInput = {
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  prompt: string;
};

export interface AiProvider {
  generate(input: AiGenerateInput): Promise<AiGeneration>;
}

export class AiProviderError extends Error {
  constructor(
    readonly code:
      | "provider_authentication"
      | "provider_rate_limited"
      | "provider_refusal"
      | "provider_timeout"
      | "provider_response_too_large"
      | "provider_malformed_response"
      | "provider_unavailable",
    message: string,
  ) {
    super(message);
  }
}

async function boundedJson(response: Response, maximumBytes: number) {
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > maximumBytes) {
    throw new AiProviderError(
      "provider_response_too_large",
      "The AI provider response exceeded the configured limit.",
    );
  }
  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new AiProviderError(
        "provider_response_too_large",
        "The AI provider response exceeded the configured limit.",
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
  } catch {
    throw new AiProviderError(
      "provider_malformed_response",
      "The AI provider returned an unreadable response.",
    );
  }
}

function textJson(value: unknown) {
  if (typeof value !== "string") {
    throw new AiProviderError(
      "provider_malformed_response",
      "The AI provider did not return structured output.",
    );
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new AiProviderError(
      "provider_malformed_response",
      "The AI provider returned invalid structured output.",
    );
  }
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function statusError(status: number) {
  if (status === 401 || status === 403) {
    return new AiProviderError(
      "provider_authentication",
      "The configured AI provider rejected authentication.",
    );
  }
  if (status === 429) {
    return new AiProviderError(
      "provider_rate_limited",
      "The AI provider rate limit was reached.",
    );
  }
  return new AiProviderError(
    "provider_unavailable",
    "The AI provider is temporarily unavailable.",
  );
}

abstract class HttpAiProvider implements AiProvider {
  constructor(
    protected readonly config: AiConfig,
    protected readonly fetcher: typeof fetch,
  ) {}

  protected async post(url: string, headers: HeadersInit, body: unknown) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const started = performance.now();
    try {
      const response = await this.fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await boundedJson(response, this.config.responseBytes);
      if (!response.ok) throw statusError(response.status);
      return { json, durationMs: Math.round(performance.now() - started) };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (controller.signal.aborted) {
        throw new AiProviderError(
          "provider_timeout",
          "The AI provider did not respond before the timeout.",
        );
      }
      throw new AiProviderError(
        "provider_unavailable",
        "The AI provider is temporarily unavailable.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  abstract generate(input: AiGenerateInput): Promise<AiGeneration>;
}

class OpenAiProvider extends HttpAiProvider {
  async generate(input: AiGenerateInput): Promise<AiGeneration> {
    const { json, durationMs } = await this.post(
      `${this.config.baseUrl.replace(/\/$/, "")}/responses`,
      { authorization: `Bearer ${this.config.apiKey}` },
      {
        model: this.config.model,
        store: false,
        max_output_tokens: this.config.outputTokens,
        input: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        text: {
          format: {
            type: "json_schema",
            name: input.schemaName,
            strict: true,
            schema: input.schema,
          },
        },
      },
    );
    const output = array(json.output);
    const contents = output.flatMap((item) => array(record(item).content));
    const refusal = contents.find((item) => record(item).type === "refusal");
    if (refusal) {
      throw new AiProviderError(
        "provider_refusal",
        "The AI provider refused this job.",
      );
    }
    const text = contents
      .filter((item) => record(item).type === "output_text")
      .map((item) => record(item).text)
      .find((value) => typeof value === "string");
    const usage = record(json.usage);
    const inputDetails = record(usage.input_tokens_details);
    return {
      output: textJson(text),
      providerRequestId: typeof json.id === "string" ? json.id : undefined,
      usage: {
        inputTokens: numberValue(usage.input_tokens),
        outputTokens: numberValue(usage.output_tokens),
        cachedInputTokens: numberValue(inputDetails.cached_tokens),
      },
      durationMs,
      provider: "openai",
      model: this.config.model,
    };
  }
}

class AnthropicProvider extends HttpAiProvider {
  async generate(input: AiGenerateInput): Promise<AiGeneration> {
    const { json, durationMs } = await this.post(
      `${this.config.baseUrl.replace(/\/$/, "")}/messages`,
      {
        "x-api-key": this.config.apiKey || "",
        "anthropic-version": "2023-06-01",
      },
      {
        model: this.config.model,
        max_tokens: this.config.outputTokens,
        system: input.system,
        messages: [{ role: "user", content: input.prompt }],
        output_config: {
          format: { type: "json_schema", schema: input.schema },
        },
      },
    );
    if (json.stop_reason === "refusal") {
      throw new AiProviderError(
        "provider_refusal",
        "The AI provider refused this job.",
      );
    }
    const content = array(json.content);
    const text = content
      .filter((item) => record(item).type === "text")
      .map((item) => record(item).text)
      .find((value) => typeof value === "string");
    const usage = record(json.usage);
    return {
      output: textJson(text),
      providerRequestId: typeof json.id === "string" ? json.id : undefined,
      usage: {
        inputTokens: numberValue(usage.input_tokens),
        outputTokens: numberValue(usage.output_tokens),
        cachedInputTokens: numberValue(usage.cache_read_input_tokens),
      },
      durationMs,
      provider: "anthropic",
      model: this.config.model,
    };
  }
}

class GeminiProvider extends HttpAiProvider {
  async generate(input: AiGenerateInput): Promise<AiGeneration> {
    const base = this.config.baseUrl.replace(/\/$/, "");
    const { json, durationMs } = await this.post(
      `${base}/models/${encodeURIComponent(this.config.model)}:generateContent`,
      { "x-goog-api-key": this.config.apiKey || "" },
      {
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: {
          maxOutputTokens: this.config.outputTokens,
          responseMimeType: "application/json",
          responseJsonSchema: input.schema,
        },
      },
    );
    const candidate = record(array(json.candidates)[0]);
    if (
      candidate.finishReason === "SAFETY" ||
      candidate.finishReason === "RECITATION"
    ) {
      throw new AiProviderError(
        "provider_refusal",
        "The AI provider refused this job.",
      );
    }
    const parts = array(record(candidate.content).parts);
    const text = parts
      .map((item) => record(item).text)
      .find((value) => typeof value === "string");
    const usage = record(json.usageMetadata);
    return {
      output: textJson(text),
      providerRequestId:
        typeof json.responseId === "string" ? json.responseId : undefined,
      usage: {
        inputTokens: numberValue(usage.promptTokenCount),
        outputTokens: numberValue(usage.candidatesTokenCount),
        cachedInputTokens: numberValue(usage.cachedContentTokenCount),
      },
      durationMs,
      provider: "gemini",
      model: this.config.model,
    };
  }
}

class OllamaProvider extends HttpAiProvider {
  async generate(input: AiGenerateInput): Promise<AiGeneration> {
    const { json, durationMs } = await this.post(
      `${this.config.baseUrl.replace(/\/$/, "")}/api/chat`,
      {},
      {
        model: this.config.model,
        stream: false,
        format: input.schema,
        options: { num_predict: this.config.outputTokens },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
      },
    );
    const message = record(json.message);
    return {
      output: textJson(message.content),
      usage: {
        inputTokens: numberValue(json.prompt_eval_count),
        outputTokens: numberValue(json.eval_count),
      },
      durationMs,
      provider: "ollama",
      model: this.config.model,
    };
  }
}

export function createAiProvider(
  config: AiConfig,
  fetcher = fetch,
): AiProvider {
  if (config.provider !== "ollama" && !config.apiKey) {
    throw new Error("ai_configuration_invalid");
  }
  if (config.provider === "openai") return new OpenAiProvider(config, fetcher);
  if (config.provider === "anthropic")
    return new AnthropicProvider(config, fetcher);
  if (config.provider === "gemini") return new GeminiProvider(config, fetcher);
  return new OllamaProvider(config, fetcher);
}
