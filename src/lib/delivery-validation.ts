import { z } from "zod";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .nullable()
    .transform((value) => value || null);

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.")
  .optional()
  .nullable();

export const clientLifecycleSchema = z.enum(["active", "archived"]);
export const projectLifecycleSchema = z.enum([
  "active",
  "completed",
  "archived",
]);
export const milestoneStatusSchema = z.enum([
  "planned",
  "in_progress",
  "completed",
  "archived",
]);
export const cycleLifecycleSchema = z.enum([
  "planned",
  "active",
  "completed",
  "archived",
]);
export const workItemStatusSchema = z.enum([
  "backlog",
  "ready",
  "in_progress",
  "in_review",
  "done",
  "canceled",
]);
export const workItemPrioritySchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "urgent",
]);

export const createClientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  internalReference: optionalText(80),
  summary: optionalText(2_000),
});

export const updateClientSchema = createClientSchema.partial().extend({
  lifecycle: clientLifecycleSchema.optional(),
});

export const createProjectSchema = z.object({
  clientId: z.string().uuid(),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, "Use 2–10 uppercase letters or numbers."),
  name: z.string().trim().min(2).max(160),
  summary: optionalText(5_000),
  leadUserId: z.string().uuid(),
  startDate: optionalDate,
  targetDate: optionalDate,
});

export const updateProjectSchema = createProjectSchema
  .omit({ clientId: true, key: true })
  .partial()
  .extend({ lifecycle: projectLifecycleSchema.optional() });

export const projectMemberSchema = z.object({ userId: z.string().uuid() });

export const createMilestoneSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: optionalText(5_000),
  targetDate: optionalDate,
});

export const updateMilestoneSchema = createMilestoneSchema.partial().extend({
  status: milestoneStatusSchema.optional(),
});

export const createCycleSchema = z.object({
  name: z.string().trim().min(2).max(160),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format."),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format."),
  goal: optionalText(5_000),
});

export const updateCycleSchema = createCycleSchema.partial().extend({
  lifecycle: cycleLifecycleSchema.optional(),
});

export const createLabelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .enum(["slate", "blue", "green", "amber", "red", "violet"])
    .default("slate"),
});

export const createWorkItemSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: optionalText(10_000),
  acceptanceCriteria: optionalText(10_000),
  status: workItemStatusSchema.default("backlog"),
  priority: workItemPrioritySchema.default("none"),
  assigneeUserId: z.string().uuid().optional().nullable(),
  estimatePoints: z.number().int().min(1).max(100).optional().nullable(),
  targetDate: optionalDate,
  milestoneId: z.string().uuid().optional().nullable(),
  cycleId: z.string().uuid().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  labelIds: z.array(z.string().uuid()).max(20).default([]),
});

export const updateWorkItemSchema = createWorkItemSchema.partial().extend({
  status: workItemStatusSchema.optional(),
  priority: workItemPrioritySchema.optional(),
  labelIds: z.array(z.string().uuid()).max(20).optional(),
  archived: z.boolean().optional(),
});

export const createDependencySchema = z.object({
  blockedWorkItemId: z.string().uuid(),
});

export const reorderWorkItemSchema = z.object({
  direction: z.enum(["up", "down"]),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const workItemFilterSchema = paginationSchema.extend({
  query: z.string().trim().max(120).optional(),
  status: workItemStatusSchema.optional(),
  priority: workItemPrioritySchema.optional(),
  assigneeUserId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
  cycleId: z.string().uuid().optional(),
  labelId: z.string().uuid().optional(),
});

export const cycleFilterSchema = paginationSchema.extend({
  lifecycle: cycleLifecycleSchema.optional(),
});

export const myWorkFilterSchema = workItemFilterSchema.extend({
  projectKey: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/)
    .optional(),
});

export const projectListFilterSchema = paginationSchema.extend({
  query: z.string().trim().max(120).optional(),
  lifecycle: z
    .enum(["current", "active", "completed", "archived", "all"])
    .default("current"),
});

export type CreateClientInput = z.output<typeof createClientSchema>;
export type UpdateClientInput = z.output<typeof updateClientSchema>;
export type CreateProjectInput = z.output<typeof createProjectSchema>;
export type UpdateProjectInput = z.output<typeof updateProjectSchema>;
export type CreateMilestoneInput = z.output<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.output<typeof updateMilestoneSchema>;
export type CreateCycleInput = z.output<typeof createCycleSchema>;
export type UpdateCycleInput = z.output<typeof updateCycleSchema>;
export type CreateLabelInput = z.output<typeof createLabelSchema>;
export type CreateWorkItemInput = z.output<typeof createWorkItemSchema>;
export type UpdateWorkItemInput = z.output<typeof updateWorkItemSchema>;
export type WorkItemFilters = z.output<typeof workItemFilterSchema>;
export type CycleFilters = z.output<typeof cycleFilterSchema>;
export type MyWorkFilters = z.output<typeof myWorkFilterSchema>;
