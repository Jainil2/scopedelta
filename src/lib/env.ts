import { z } from "zod";

const absoluteUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost";
  }, "Use HTTPS outside localhost.");

export function getAppUrl() {
  const configured = process.env.APP_URL?.trim();
  return absoluteUrlSchema
    .parse(configured || "http://localhost:3000")
    .replace(/\/$/, "");
}

export function getDatabaseUrl(purpose: "runtime" | "migration" = "runtime") {
  const value =
    purpose === "migration"
      ? process.env.DATABASE_MIGRATION_URL?.trim()
      : process.env.DATABASE_URL?.trim();

  if (!value) throw new Error("platform_database_unconfigured");
  return z.string().url().parse(value);
}

export function getAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("platform_auth_unconfigured");
  }
  return secret;
}

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

export function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || "1025");
  const secure = process.env.SMTP_SECURE?.trim() === "true";
  const from = process.env.SMTP_FROM?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();

  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("platform_email_unconfigured");
  }
  if ((user && !password) || (!user && password)) {
    throw new Error("platform_email_unconfigured");
  }

  return { host, port, secure, user, password, from };
}

export type GitHubAppConfig = {
  appId: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
  slug: string;
};

export function getGitHubAppConfig(): GitHubAppConfig {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const clientId = process.env.GITHUB_APP_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replaceAll(
    String.raw`\n`,
    "\n",
  ).trim();
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET?.trim();
  const slug = process.env.GITHUB_APP_SLUG?.trim();
  if (
    !appId ||
    !/^\d+$/.test(appId) ||
    !clientId ||
    !clientSecret ||
    !privateKey ||
    !webhookSecret ||
    !slug
  ) {
    throw new Error("github_app_unconfigured");
  }
  if (webhookSecret.length < 24 || !/^[A-Za-z0-9-]+$/.test(slug)) {
    throw new Error("github_app_unconfigured");
  }
  return { appId, clientId, clientSecret, privateKey, webhookSecret, slug };
}

export function getGitHubAppCallbackUrl() {
  return `${getAppUrl()}/api/v1/integrations/github/callback`;
}

export function getGitHubAppInstallUrl(state: string) {
  const { slug } = getGitHubAppConfig();
  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function getGitHubAppAuthorizeUrl(state: string) {
  const { clientId } = getGitHubAppConfig();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGitHubAppCallbackUrl());
  url.searchParams.set("state", state);
  return url.toString();
}

export function isGitHubAppConfigured() {
  try {
    getGitHubAppConfig();
    return true;
  } catch {
    return false;
  }
}

export type AiProviderName = "openai" | "anthropic" | "gemini" | "ollama";

export type AiConfig = {
  enabled: boolean;
  provider: AiProviderName;
  model: string;
  apiKey?: string;
  baseUrl: string;
  timeoutMs: number;
  responseBytes: number;
  contextCharacters: number;
  outputTokens: number;
  runningPerUser: number;
  runningPerWorkspace: number;
  startsPerUserHour: number;
  startsPerWorkspaceDay: number;
};

function boundedInteger(name: string, fallback: number, hardMaximum: number) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1 || value > hardMaximum) {
    throw new Error("ai_configuration_invalid");
  }
  return value;
}

export function getAiConfig(): AiConfig {
  const enabled = process.env.AI_ENABLED?.trim().toLowerCase() === "true";
  const provider = z
    .enum(["openai", "anthropic", "gemini", "ollama"])
    .parse(process.env.AI_PROVIDER?.trim() || "ollama");
  const model = process.env.AI_MODEL?.trim();
  const values = {
    enabled,
    provider,
    model: model || "",
    timeoutMs: boundedInteger("AI_TIMEOUT_MS", 60_000, 120_000),
    responseBytes: boundedInteger("AI_RESPONSE_MAX_BYTES", 524_288, 1_048_576),
    contextCharacters: boundedInteger(
      "AI_CONTEXT_MAX_CHARACTERS",
      40_000,
      80_000,
    ),
    outputTokens: boundedInteger("AI_OUTPUT_MAX_TOKENS", 4_000, 8_000),
    runningPerUser: boundedInteger("AI_RUNNING_PER_USER", 1, 2),
    runningPerWorkspace: boundedInteger("AI_RUNNING_PER_WORKSPACE", 3, 10),
    startsPerUserHour: boundedInteger("AI_STARTS_PER_USER_HOUR", 10, 50),
    startsPerWorkspaceDay: boundedInteger(
      "AI_STARTS_PER_WORKSPACE_DAY",
      100,
      500,
    ),
  };
  if (enabled && !model) throw new Error("ai_configuration_invalid");

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (enabled && !apiKey) throw new Error("ai_configuration_invalid");
    return {
      ...values,
      apiKey,
      baseUrl:
        process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
    };
  }
  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (enabled && !apiKey) throw new Error("ai_configuration_invalid");
    return {
      ...values,
      apiKey,
      baseUrl:
        process.env.ANTHROPIC_BASE_URL?.trim() ||
        "https://api.anthropic.com/v1",
    };
  }
  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (enabled && !apiKey) throw new Error("ai_configuration_invalid");
    return {
      ...values,
      apiKey,
      baseUrl:
        process.env.GEMINI_BASE_URL?.trim() ||
        "https://generativelanguage.googleapis.com/v1beta",
    };
  }
  return {
    ...values,
    baseUrl: process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434",
  };
}
