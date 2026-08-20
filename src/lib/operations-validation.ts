import { z } from "zod";

import {
  isIsoMonday,
  parseIsoDate,
  PORTFOLIO_ATTENTION_CATEGORIES,
} from "@/lib/operations";

const isoDate = z
  .string()
  .refine(
    (value) => Boolean(parseIsoDate(value)),
    "Use a valid YYYY-MM-DD date.",
  );
const isoMonday = isoDate.refine(
  isIsoMonday,
  "Choose a Monday so weekly planning stays explicit.",
);
const optionalUuid = z.string().uuid().optional();
const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .nullable()
    .transform((value) => value || null);

export const operationsPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const portfolioFiltersSchema = operationsPaginationSchema.extend({
  query: z.string().trim().max(120).optional(),
  clientId: optionalUuid,
  personId: optionalUuid,
  attention: z.enum(PORTFOLIO_ATTENTION_CATEGORIES).optional(),
  lifecycle: z
    .enum(["active", "completed", "archived", "all"])
    .default("active"),
});

export const capacityFiltersSchema = operationsPaginationSchema.extend({
  startWeek: isoMonday.optional(),
  weeks: z.coerce.number().int().min(1).max(26).default(8),
  memberId: optionalUuid,
  projectId: optionalUuid,
  query: z.string().trim().max(120).optional(),
});

export const availabilityInputSchema = z.object({
  weeklyMinutes: z.number().int().min(0).max(10_080),
  effectiveFrom: isoMonday,
});

const allocationFieldsSchema = z.object({
  memberUserId: z.string().uuid(),
  projectId: z.string().uuid(),
  startWeek: isoMonday,
  endWeek: isoMonday,
  plannedMinutesPerWeek: z.number().int().min(1).max(10_080),
  roleLabel: optionalText(80),
});

export const allocationInputSchema = allocationFieldsSchema.refine(
  (value) => value.startWeek <= value.endWeek,
  {
    path: ["endWeek"],
    message: "End week must not be before start week.",
  },
);

export const updateAllocationSchema = allocationFieldsSchema.partial();

export const timeClassificationSchema = z.enum(["billable", "non_billable"]);

export const timeEntryInputSchema = z.object({
  projectId: z.string().uuid(),
  workItemId: z.string().uuid().optional().nullable(),
  workDate: isoDate,
  durationMinutes: z.number().int().min(1).max(1_440),
  classification: timeClassificationSchema,
  note: optionalText(500),
});

export const updateTimeEntrySchema = timeEntryInputSchema
  .omit({ projectId: true })
  .partial();

export const timeEntryFiltersSchema = operationsPaginationSchema.extend({
  projectId: optionalUuid,
  memberId: optionalUuid,
  workItemId: optionalUuid,
  from: isoDate.optional(),
  to: isoDate.optional(),
  classification: timeClassificationSchema.optional(),
});

export type PortfolioFilters = z.output<typeof portfolioFiltersSchema>;
export type CapacityFilters = z.output<typeof capacityFiltersSchema>;
export type AvailabilityInput = z.output<typeof availabilityInputSchema>;
export type AllocationInput = z.output<typeof allocationInputSchema>;
export type UpdateAllocationInput = z.output<typeof updateAllocationSchema>;
export type TimeEntryInput = z.output<typeof timeEntryInputSchema>;
export type UpdateTimeEntryInput = z.output<typeof updateTimeEntrySchema>;
export type TimeEntryFilters = z.output<typeof timeEntryFiltersSchema>;
