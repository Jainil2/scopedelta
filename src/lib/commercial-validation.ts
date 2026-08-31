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

export const commercialRequestStateSchema = z.enum([
  "open",
  "needs_clarification",
  "resolved",
  "withdrawn",
]);

export const commercialDecisionDispositionSchema = z.enum([
  "covered",
  "absorbed",
  "swap",
  "paid_change",
  "deferred",
  "rejected",
]);

export const commercialCoverageBasisSchema = z.enum([
  "baseline",
  "defect_or_warranty",
  "revision_allowance",
  "other_existing_obligation",
]);

export const commercialImpactConfidenceSchema = z.enum([
  "estimate",
  "confirmed",
]);

export const workPurposeSchema = z.enum([
  "unclassified",
  "client_delivery",
  "delivery_support",
  "internal",
]);

export const createCommercialSourceSchema = z.object({
  idempotencyKey: z.string().uuid(),
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

export const createCommercialAmendmentSchema = z.object({
  sourceId: z.string().uuid(),
  label: z.string().trim().min(1).max(160),
  decisionIds: z.array(z.string().uuid()).max(50).default([]),
});

export const activateCommercialBaselineVersionSchema = z.object({
  effectiveAt: z.string().datetime({ offset: true }).optional(),
});

export const commercialHistoryFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const commercialEvidenceAnchorInputSchema = z.object({
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
  anchors: z.array(commercialEvidenceAnchorInputSchema).min(1).max(10),
});

export const createCommercialScopeItemSchema = scopeItemContentSchema.extend({
  idempotencyKey: z.string().uuid(),
  revisionIdempotencyKey: z.string().uuid(),
  baselineVersionId: z.string().uuid(),
});

export const updateCommercialScopeItemSchema = scopeItemContentSchema.extend({
  idempotencyKey: z.string().uuid(),
});

export const updateWorkPurposeSchema = z.object({
  purpose: workPurposeSchema,
});

export const createCommercialBasisLinkSchema = z.union([
  z.object({
    basisType: z.literal("baseline_scope_item"),
    scopeItemRevisionId: z.string().uuid(),
  }),
  z.object({ scopeItemRevisionId: z.string().uuid() }).transform((value) => ({
    basisType: "baseline_scope_item" as const,
    scopeItemRevisionId: value.scopeItemRevisionId,
  })),
  z.object({
    basisType: z.literal("commercial_decision"),
    decisionId: z.string().uuid(),
  }),
]);

const nullableTrimmed = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .nullable()
    .transform((value) => value || null);

const impactContentSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    confidence: commercialImpactConfidenceSchema,
    effortMinutes: z
      .number()
      .int()
      .min(0)
      .max(100_000_000)
      .optional()
      .nullable(),
    scheduleDeltaDays: z
      .number()
      .int()
      .min(-3650)
      .max(3650)
      .optional()
      .nullable(),
    targetDate: z.iso.date().optional().nullable(),
    monetaryAmount: z
      .string()
      .trim()
      .regex(/^\d{1,16}(?:\.\d{1,2})?$/)
      .optional()
      .nullable(),
    currencyCode: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .optional()
      .nullable(),
    notes: nullableTrimmed(5000),
    anchors: z.array(commercialEvidenceAnchorInputSchema).max(10).default([]),
  })
  .superRefine((value, context) => {
    if (
      value.effortMinutes == null &&
      value.scheduleDeltaDays == null &&
      value.targetDate == null &&
      value.monetaryAmount == null
    ) {
      context.addIssue({
        code: "custom",
        message: "Record at least one impact value.",
      });
    }
    if ((value.monetaryAmount == null) !== (value.currencyCode == null)) {
      context.addIssue({
        code: "custom",
        message: "Amount and currency must be recorded together.",
      });
    }
  });

export const createCommercialRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  requestText: z.string().trim().min(1).max(10_000),
  externalRequester: nullableTrimmed(160),
  receivedAt: z.iso.datetime({ offset: true }),
  scopeItemIds: z.array(z.string().uuid()).max(20).default([]),
  anchors: z.array(commercialEvidenceAnchorInputSchema).max(10).default([]),
  impact: impactContentSchema.optional().nullable(),
});

export const updateCommercialRequestStateSchema = z.object({
  state: z.enum(["open", "needs_clarification", "withdrawn"]),
});

export const createCommercialDecisionSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    disposition: commercialDecisionDispositionSchema,
    coverageBasis: commercialCoverageBasisSchema.optional().nullable(),
    rationale: nullableTrimmed(10_000),
    supersedesDecisionId: z.string().uuid().optional().nullable(),
    affectedScopeItemIds: z.array(z.string().uuid()).max(20).default([]),
    swapOffsetScopeItemIds: z.array(z.string().uuid()).max(20).default([]),
    anchors: z.array(commercialEvidenceAnchorInputSchema).max(10).default([]),
    impact: impactContentSchema.optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.disposition !== "covered" && value.coverageBasis != null) {
      context.addIssue({
        code: "custom",
        path: ["coverageBasis"],
        message: "Coverage basis applies only to covered decisions.",
      });
    }
    if (
      value.disposition === "swap" &&
      value.swapOffsetScopeItemIds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["swapOffsetScopeItemIds"],
        message: "A swap requires at least one offsetting scope item.",
      });
    }
    if (
      value.disposition !== "swap" &&
      value.swapOffsetScopeItemIds.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["swapOffsetScopeItemIds"],
        message: "Offsetting scope applies only to swap decisions.",
      });
    }
  });

export const createCommercialImpactAssessmentSchema =
  impactContentSchema.extend({
    decisionId: z.string().uuid().optional().nullable(),
    supersedesImpactAssessmentId: z.string().uuid().optional().nullable(),
  });

export const commercialRequestFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  state: commercialRequestStateSchema.optional(),
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
      "stale_basis",
      "linked",
      "support_internal",
    ])
    .optional(),
});

export const commercialDriftSummaryFiltersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(5).default(5),
});

export type CreateCommercialSourceInput = z.output<
  typeof createCommercialSourceSchema
>;
export type CreateCommercialBaselineInput = z.output<
  typeof createCommercialBaselineSchema
>;
export type CreateCommercialAmendmentInput = z.output<
  typeof createCommercialAmendmentSchema
>;
export type ActivateCommercialBaselineVersionInput = z.output<
  typeof activateCommercialBaselineVersionSchema
>;
export type CommercialHistoryFilters = z.output<
  typeof commercialHistoryFiltersSchema
>;
export type CreateCommercialScopeItemInput = z.output<
  typeof createCommercialScopeItemSchema
>;
export type UpdateCommercialScopeItemInput = z.output<
  typeof updateCommercialScopeItemSchema
>;
export type WorkPurposeInput = z.output<typeof updateWorkPurposeSchema>;
export type CommercialBasisLinkInput = z.input<
  typeof createCommercialBasisLinkSchema
>;
export type CommercialDriftFilters = z.output<
  typeof commercialDriftFiltersSchema
>;
export type CreateCommercialRequestInput = z.output<
  typeof createCommercialRequestSchema
>;
export type UpdateCommercialRequestStateInput = z.output<
  typeof updateCommercialRequestStateSchema
>;
export type CreateCommercialDecisionInput = z.output<
  typeof createCommercialDecisionSchema
>;
export type CreateCommercialImpactAssessmentInput = z.output<
  typeof createCommercialImpactAssessmentSchema
>;
export type CommercialRequestFilters = z.output<
  typeof commercialRequestFiltersSchema
>;
