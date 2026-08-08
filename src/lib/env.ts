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
