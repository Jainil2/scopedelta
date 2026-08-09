import { z } from "zod";

export const MAX_COMMERCIAL_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_COMMERCIAL_EXTRACTED_CHARACTERS = 500_000;

export const commercialSourceKindSchema = z.enum([
  "pasted_text",
  "pdf",
  "docx",
]);

export const commercialScopeKindSchema = z.enum([
  "deliverable",
  "requirement",
  "exclusion",
  "constraint",
]);

export const workPurposeSchema = z.enum([
  "unclassified",
  "client_delivery",
  "delivery_support",
  "internal",
]);

export const createCommercialSourceSchema = z.object({
  requestId: z.string().uuid(),
  kind: commercialSourceKindSchema,
  name: z.string().trim().min(1).max(160),
  mediaType: z.string().trim().min(1).max(120),
  contentBase64: z
    .string()
    .min(1)
    .max(Math.ceil((MAX_COMMERCIAL_SOURCE_BYTES * 4) / 3) + 8),
});

export const createCommercialBaselineSchema = z.object({
  sourceId: z.string().uuid(),
});

const evidenceAnchorSchema = z.object({
  sourceId: z.string().uuid(),
  startOffset: z
    .number()
    .int()
    .min(0)
    .max(MAX_COMMERCIAL_EXTRACTED_CHARACTERS - 1),
  endOffset: z.number().int().min(1).max(MAX_COMMERCIAL_EXTRACTED_CHARACTERS),
  label: z.string().trim().max(120).optional().nullable(),
});

const scopeItemContentSchema = z.object({
  kind: commercialScopeKindSchema,
  title: z.string().trim().min(1).max(240),
  details: z
    .string()
    .trim()
    .max(10_000)
    .optional()
    .nullable()
    .transform((value) => value || null),
  anchors: z.array(evidenceAnchorSchema).min(1).max(10),
});

export const createCommercialScopeItemSchema = scopeItemContentSchema.extend({
  requestId: z.string().uuid(),
  revisionRequestId: z.string().uuid(),
  baselineVersionId: z.string().uuid(),
});

export const updateCommercialScopeItemSchema = scopeItemContentSchema.extend({
  requestId: z.string().uuid(),
});

export const updateWorkPurposeSchema = z.object({
  purpose: workPurposeSchema,
});

export const createCommercialBasisLinkSchema = z.object({
  scopeItemRevisionId: z.string().uuid(),
});

export const setCommercialScopeItemArchiveSchema = z.object({
  archived: z.boolean(),
});

export const commercialDriftFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  state: z
    .enum([
      "commercially_unlinked",
      "needs_classification",
      "linked",
      "support_internal",
    ])
    .optional(),
});

export type CreateCommercialSourceInput = z.output<
  typeof createCommercialSourceSchema
>;
export type CreateCommercialBaselineInput = z.output<
  typeof createCommercialBaselineSchema
>;
export type CreateCommercialScopeItemInput = z.output<
  typeof createCommercialScopeItemSchema
>;
export type UpdateCommercialScopeItemInput = z.output<
  typeof updateCommercialScopeItemSchema
>;
export type WorkPurposeInput = z.output<typeof updateWorkPurposeSchema>;
export type CommercialBasisLinkInput = z.output<
  typeof createCommercialBasisLinkSchema
>;
export type CommercialDriftFilters = z.output<
  typeof commercialDriftFiltersSchema
>;
