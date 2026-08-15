import { z } from "zod";

export const AI_PROMPT_VERSION = "sc-009.v1";

export const evidenceKeySchema = z.string().regex(/^ev_[a-z0-9_]{1,80}$/);
const citedTextSchema = z.object({
  title: z.string().min(1).max(240),
  detail: z.string().min(1).max(4_000),
  evidenceKeys: z.array(evidenceKeySchema).min(1).max(12),
});
const citedProseSchema = z.object({
  text: z.string().min(1).max(4_000),
  evidenceKeys: z.array(evidenceKeySchema).min(1).max(12),
});

export const scopeChangeAnalysisResultSchema = z.object({
  summary: citedProseSchema,
  findings: z.array(citedTextSchema).max(20),
  uncertainties: z.array(citedTextSchema).max(12),
  conflicts: z.array(citedTextSchema).max(12),
  missingQuestions: z.array(z.string().min(1).max(1_000)).max(12),
  draftDecision: citedProseSchema,
  clientSafeWording: citedProseSchema,
  workCandidates: z
    .array(
      z.object({
        candidateKey: z.string().regex(/^work_[a-z0-9_]{1,60}$/),
        title: z.string().min(1).max(240),
        description: z.string().min(1).max(10_000),
        acceptanceCriteria: z.string().max(10_000).nullable(),
        evidenceKeys: z.array(evidenceKeySchema).min(1).max(12),
      }),
    )
    .max(5),
  clarificationCandidates: z
    .array(
      z.object({
        candidateKey: z.string().regex(/^question_[a-z0-9_]{1,60}$/),
        question: z.string().min(1).max(2_000),
        evidenceKeys: z.array(evidenceKeySchema).min(1).max(12),
      }),
    )
    .max(8),
});

export const deliveryRiskBriefResultSchema = z.object({
  interpretation: z.array(citedTextSchema).max(20),
  recommendedActions: z.array(citedTextSchema).max(20),
  watchItems: z.array(citedTextSchema).max(20),
});

export const workContextQaPackResultSchema = z.object({
  contextSummary: citedProseSchema,
  contradictions: z.array(citedTextSchema).max(20),
  missingInformation: z.array(citedTextSchema).max(20),
  testScenarios: z
    .array(
      z.object({
        title: z.string().min(1).max(240),
        preconditions: z.array(z.string().min(1).max(1_000)).max(20),
        steps: z.array(z.string().min(1).max(1_000)).min(1).max(30),
        expectedResult: z.string().min(1).max(2_000),
        evidenceKeys: z.array(evidenceKeySchema).min(1).max(12),
      }),
    )
    .max(20),
});

export const aiJobTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("scope_change_analysis"),
    requestId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("delivery_risk_brief"),
    milestoneId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal("work_context_qa_pack"),
    workItemId: z.string().uuid(),
  }),
]);

export const createAiJobSchema = z.object({
  idempotencyKey: z.string().uuid(),
  target: aiJobTargetSchema,
});

export const aiActionSelectionSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    contextFingerprint: z.string().min(20).max(128),
    workCandidateKeys: z.array(z.string()).max(5).default([]),
    clarificationCandidateKeys: z.array(z.string()).max(8).default([]),
  })
  .superRefine((value, context) => {
    const all = [
      ...value.workCandidateKeys,
      ...value.clarificationCandidateKeys,
    ];
    if (all.length < 1 || all.length > 10 || new Set(all).size !== all.length) {
      context.addIssue({
        code: "custom",
        message: "Select between one and ten unique candidates.",
      });
    }
  });

export const updateClarificationSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
});

export const resultSchemas = {
  scope_change_analysis: scopeChangeAnalysisResultSchema,
  delivery_risk_brief: deliveryRiskBriefResultSchema,
  work_context_qa_pack: workContextQaPackResultSchema,
} as const;

export type AiJobTarget = z.infer<typeof aiJobTargetSchema>;
export type ScopeChangeAnalysisResult = z.infer<
  typeof scopeChangeAnalysisResultSchema
>;
export type AiJobResult =
  | ScopeChangeAnalysisResult
  | z.infer<typeof deliveryRiskBriefResultSchema>
  | z.infer<typeof workContextQaPackResultSchema>;
