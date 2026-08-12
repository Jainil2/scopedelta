import { z } from "zod";

const optionalUuid = z.string().uuid().optional().nullable();

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .nullable()
    .transform((value) => value || null);

export const connectGitHubRepositorySchema = z.object({
  installationId: z
    .string()
    .trim()
    .regex(/^\d{1,30}$/),
  repositoryFullName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/),
});

export const manualImplementationLinkSchema = z.object({
  workItemId: z.string().uuid(),
  artifactId: z.string().uuid(),
});

export const createVerificationSchema = z
  .object({
    workItemId: optionalUuid,
    scopeItemRevisionId: optionalUuid,
    artifactId: optionalUuid,
    milestoneId: optionalUuid,
    acceptanceTargetId: optionalUuid,
    method: z.enum(["manual", "automated_reference"]),
    category: z.string().trim().min(1).max(80),
    result: z.enum(["pending", "passed", "failed", "blocked"]),
    referenceUrl: z
      .string()
      .trim()
      .url()
      .max(2_000)
      .optional()
      .nullable()
      .transform((value) => value || null),
    notes: optionalText(5_000),
  })
  .refine(
    (value) =>
      Boolean(
        value.workItemId ||
        value.scopeItemRevisionId ||
        value.artifactId ||
        value.milestoneId ||
        value.acceptanceTargetId,
      ),
    { message: "Choose at least one delivery target." },
  );

export const createDefectSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: optionalText(10_000),
  severity: z.enum(["low", "medium", "high", "critical"]),
  workItemId: optionalUuid,
  scopeItemRevisionId: optionalUuid,
  commercialRequestId: optionalUuid,
  commercialDecisionId: optionalUuid,
  artifactId: optionalUuid,
  verificationId: optionalUuid,
  milestoneId: optionalUuid,
  acceptanceTargetId: optionalUuid,
});

export const resolveDefectSchema = z.object({
  status: z.enum(["open", "resolved"]),
});

export const engineeringCoverageFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  milestoneId: z.string().uuid().optional(),
});

export type ConnectGitHubRepositoryInput = z.output<
  typeof connectGitHubRepositorySchema
>;
export type ManualImplementationLinkInput = z.output<
  typeof manualImplementationLinkSchema
>;
export type CreateVerificationInput = z.output<typeof createVerificationSchema>;
export type CreateDefectInput = z.output<typeof createDefectSchema>;
export type EngineeringCoverageFilters = z.output<
  typeof engineeringCoverageFiltersSchema
>;
