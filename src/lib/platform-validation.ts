import { z } from "zod";

import { PlatformError } from "@/lib/platform-errors";

const workspaceName = z.string().trim().min(2).max(100);
const workspaceRole = z.enum(["owner", "admin", "member"]);

export const createWorkspaceSchema = z.object({ name: workspaceName });

export const updateWorkspaceSchema = z.object({
  name: workspaceName,
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isValidTimeZone, "Choose a valid IANA time zone."),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["admin", "member"]),
});

export const updateMemberSchema = z.object({ role: workspaceRole });

export const invitationTokenSchema = z.object({
  token: z.string().min(32).max(256),
});

export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  throw new PlatformError(
    "validation_error",
    400,
    "Check the submitted fields and try again.",
    fieldErrors,
  );
}

function isValidTimeZone(value: string) {
  try {
    Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
