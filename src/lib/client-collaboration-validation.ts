import { z } from "zod";

export const clientParticipantRoleSchema = z.enum(["collaborator", "approver"]);
export const clientPacketActionSchema = z.enum([
  "approved",
  "rejected",
  "clarification_requested",
]);
export const clientAcceptanceActionSchema = z.enum([
  "accepted",
  "needs_changes",
]);
export const clientDiscussionTargetSchema = z.enum([
  "request",
  "packet",
  "acceptance_target",
]);

const idempotencyKey = z.string().uuid();
const optionalSafeText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .nullable()
    .transform((value) => value || null);

export const clientPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const createClientInvitationSchema = z.object({
  idempotencyKey,
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  role: clientParticipantRoleSchema,
  sendEmail: z.boolean().default(false),
});

export const updateClientParticipantSchema = z.object({
  role: clientParticipantRoleSchema,
});

export const reissueClientInvitationSchema = z.object({
  idempotencyKey,
  sendEmail: z.boolean().default(false),
});

export const updateClientProjectProfileSchema = z.object({
  summary: z.string().trim().min(1).max(2_000),
});

export const createClientProjectItemSchema = z.discriminatedUnion("target", [
  z.object({
    idempotencyKey,
    target: z.literal("milestone"),
    milestoneId: z.string().uuid(),
    clientSummary: z.string().trim().min(1).max(2_000),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  }),
  z.object({
    idempotencyKey,
    target: z.literal("deliverable"),
    scopeItemRevisionId: z.string().uuid(),
    clientSummary: z.string().trim().min(1).max(2_000),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  }),
]);

export const createClientRequestSchema = z.object({
  idempotencyKey,
  title: z.string().trim().min(1).max(240),
  requestText: z.string().trim().min(1).max(10_000),
});

export const updateClientRequestStateSchema = z.discriminatedUnion("state", [
  z.object({
    idempotencyKey,
    state: z.literal("needs_clarification"),
    prompt: z.string().trim().min(1).max(5_000),
  }),
  z.object({
    idempotencyKey,
    state: z.enum(["open", "withdrawn"]),
  }),
]);

export const createClientDiscussionSchema = z.object({
  idempotencyKey,
  target: clientDiscussionTargetSchema,
  targetId: z.string().uuid(),
  body: z.string().trim().min(1).max(5_000),
});

export const publishClientPacketSchema = z.object({
  idempotencyKey,
  decisionId: z.string().uuid(),
  impactAssessmentId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(240),
  requestSummary: z.string().trim().min(1).max(5_000),
  treatmentSummary: z.string().trim().min(1).max(5_000),
  scopeSummary: optionalSafeText(5_000),
  assumptions: optionalSafeText(5_000),
  includeScheduleDeltaDays: z.boolean().default(false),
  includeTargetDate: z.boolean().default(false),
  includeMonetaryAmount: z.boolean().default(false),
  scopeItemRevisionIds: z.array(z.string().uuid()).max(50).default([]),
});

export const actOnClientPacketSchema = z.object({
  idempotencyKey,
  action: clientPacketActionSchema,
  comment: optionalSafeText(5_000),
});

export const publishClientAcceptanceSchema = z.object({
  idempotencyKey,
  projectItemId: z.string().uuid(),
  snapshotTitle: z.string().trim().min(1).max(240),
  snapshotSummary: z.string().trim().min(1).max(5_000),
  packetIds: z.array(z.string().uuid()).max(50).default([]),
});

export const actOnClientAcceptanceSchema = z.object({
  idempotencyKey,
  action: clientAcceptanceActionSchema,
  comment: optionalSafeText(5_000),
});

export const stageClientInvitationSchema = z.object({
  token: z.string().min(32).max(256),
});

export type CreateClientInvitationInput = z.infer<
  typeof createClientInvitationSchema
>;
export type CreateClientProjectItemInput = z.infer<
  typeof createClientProjectItemSchema
>;
export type CreateClientRequestInput = z.infer<
  typeof createClientRequestSchema
>;
export type CreateClientDiscussionInput = z.infer<
  typeof createClientDiscussionSchema
>;
export type PublishClientPacketInput = z.infer<
  typeof publishClientPacketSchema
>;
export type ActOnClientPacketInput = z.infer<typeof actOnClientPacketSchema>;
export type PublishClientAcceptanceInput = z.infer<
  typeof publishClientAcceptanceSchema
>;
export type ActOnClientAcceptanceInput = z.infer<
  typeof actOnClientAcceptanceSchema
>;
