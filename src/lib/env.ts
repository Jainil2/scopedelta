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
  privateKey: string;
  webhookSecret: string;
  slug: string;
};

export function getGitHubAppConfig(): GitHubAppConfig {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  ).trim();
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET?.trim();
  const slug = process.env.GITHUB_APP_SLUG?.trim();
  if (
    !appId ||
    !/^\d+$/.test(appId) ||
    !privateKey ||
    !webhookSecret ||
    !slug
  ) {
    throw new Error("github_app_unconfigured");
  }
  if (webhookSecret.length < 24 || !/^[A-Za-z0-9-]+$/.test(slug)) {
    throw new Error("github_app_unconfigured");
  }
  return { appId, privateKey, webhookSecret, slug };
}

export function getGitHubAppInstallUrl() {
  const slug = process.env.GITHUB_APP_SLUG?.trim();
  return slug && /^[A-Za-z0-9-]+$/.test(slug)
    ? `https://github.com/apps/${slug}/installations/new`
    : null;
}

export function isGitHubAppConfigured() {
  try {
    getGitHubAppConfig();
    return true;
  } catch {
    return false;
  }
}
