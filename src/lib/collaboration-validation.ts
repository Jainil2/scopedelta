import { z } from "zod";

import { paginationSchema } from "@/lib/delivery-validation";

const content = (maximum: number) => z.string().trim().min(1).max(maximum);

export const createCommentSchema = z.object({
  requestId: z.string().uuid(),
  body: content(10_000),
  parentCommentId: z.string().uuid().optional().nullable(),
});

export const updateCommentSchema = z.object({
  body: content(10_000),
});

export const createProjectNoteSchema = z.object({
  requestId: z.string().uuid(),
  title: content(120),
  body: content(20_000),
});

export const updateProjectNoteSchema = z
  .object({
    title: content(120).optional(),
    body: content(20_000).optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Provide at least one change.",
  });

export const projectNoteFilterSchema = paginationSchema.extend({
  archived: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default(false),
});

export const activityFilterSchema = paginationSchema;

export const notificationFilterSchema = paginationSchema.extend({
  unread: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const updateSubscriptionSchema = z.object({
  watching: z.boolean(),
});

export const updateNotificationSchema = z.object({
  read: z.boolean(),
});

export const updateNotificationBatchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  read: z.boolean(),
});

export type CreateCommentInput = z.output<typeof createCommentSchema>;
export type UpdateCommentInput = z.output<typeof updateCommentSchema>;
export type CreateProjectNoteInput = z.output<typeof createProjectNoteSchema>;
export type UpdateProjectNoteInput = z.output<typeof updateProjectNoteSchema>;
export type ProjectNoteFilters = z.output<typeof projectNoteFilterSchema>;
export type ActivityFilters = z.output<typeof activityFilterSchema>;
export type NotificationFilters = z.output<typeof notificationFilterSchema>;
