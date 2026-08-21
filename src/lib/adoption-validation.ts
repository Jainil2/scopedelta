import { z } from "zod";

import {
  createProjectSchema,
  workItemPrioritySchema,
  workItemStatusSchema,
} from "@/lib/delivery-validation";
import { migrationFields } from "@/lib/adoption";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .nullable()
    .transform((value) => value || null);

const templateRefSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_-]{0,39}$/, "Use a short stable reference.");

const templateDefinitionBase = z.object({
  projectSummary: optionalText(5_000),
  milestones: z
    .array(
      z.object({
        ref: templateRefSchema,
        name: z.string().trim().min(2).max(160),
        description: optionalText(5_000),
        targetOffsetDays: z
          .number()
          .int()
          .min(0)
          .max(3_650)
          .nullable()
          .default(null),
      }),
    )
    .max(30)
    .default([]),
  cycles: z
    .array(
      z.object({
        ref: templateRefSchema,
        name: z.string().trim().min(2).max(160),
        goal: optionalText(5_000),
        startOffsetDays: z.number().int().min(0).max(3_650).default(0),
        durationDays: z.number().int().min(1).max(84),
      }),
    )
    .max(20)
    .default([]),
  workItems: z
    .array(
      z.object({
        ref: templateRefSchema,
        parentRef: templateRefSchema.nullable().default(null),
        milestoneRef: templateRefSchema.nullable().default(null),
        cycleRef: templateRefSchema.nullable().default(null),
        title: z.string().trim().min(1).max(240),
        description: optionalText(10_000),
        acceptanceCriteria: optionalText(10_000),
        status: workItemStatusSchema.default("backlog"),
        priority: workItemPrioritySchema.default("none"),
        purpose: z
          .enum([
            "unclassified",
            "client_delivery",
            "delivery_support",
            "internal",
          ])
          .default("unclassified"),
        estimatePoints: z
          .number()
          .int()
          .min(1)
          .max(100)
          .nullable()
          .default(null),
        targetOffsetDays: z
          .number()
          .int()
          .min(0)
          .max(3_650)
          .nullable()
          .default(null),
        labels: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
      }),
    )
    .max(100)
    .default([]),
});

export const projectTemplateDefinitionSchema =
  templateDefinitionBase.superRefine((definition, context) => {
    checkUniqueRefs(definition.milestones, "milestones", context);
    checkUniqueRefs(definition.cycles, "cycles", context);
    checkUniqueRefs(definition.workItems, "workItems", context);
    const milestones = new Set(definition.milestones.map((item) => item.ref));
    const cycles = new Set(definition.cycles.map((item) => item.ref));
    const work = new Map(definition.workItems.map((item) => [item.ref, item]));
    definition.workItems.forEach((item, index) => {
      const labels = new Set<string>();
      item.labels.forEach((label, labelIndex) => {
        const normalized = label.toLocaleLowerCase("en-US");
        if (labels.has(normalized)) {
          context.addIssue({
            code: "custom",
            path: ["workItems", index, "labels", labelIndex],
            message: "Labels must be unique ignoring case.",
          });
        }
        labels.add(normalized);
      });
      if (item.milestoneRef && !milestones.has(item.milestoneRef)) {
        context.addIssue({
          code: "custom",
          path: ["workItems", index, "milestoneRef"],
          message: "Milestone reference does not exist in this template.",
        });
      }
      if (item.cycleRef && !cycles.has(item.cycleRef)) {
        context.addIssue({
          code: "custom",
          path: ["workItems", index, "cycleRef"],
          message: "Cycle reference does not exist in this template.",
        });
      }
      if (item.parentRef) {
        const parent = work.get(item.parentRef);
        if (!parent || parent.ref === item.ref || parent.parentRef) {
          context.addIssue({
            code: "custom",
            path: ["workItems", index, "parentRef"],
            message:
              "Parent must be a different top-level work item in this template.",
          });
        }
      }
    });
  });

function checkUniqueRefs(
  items: Array<{ ref: string }>,
  path: string,
  context: z.RefinementCtx,
) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.ref)) {
      context.addIssue({
        code: "custom",
        path: [path, index, "ref"],
        message: "References must be unique within this template section.",
      });
    }
    seen.add(item.ref);
  });
}

export const createProjectTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: optionalText(2_000),
  definition: projectTemplateDefinitionSchema,
});

export const updateProjectTemplateSchema =
  createProjectTemplateSchema.partial();

export const applyProjectTemplateSchema = createProjectSchema.extend({
  templateId: z.string().uuid(),
});

const mappingColumnsSchema = z
  .object(
    Object.fromEntries(
      migrationFields.map((field) => [
        field,
        z.string().trim().min(1).max(240).optional(),
      ]),
    ) as Record<(typeof migrationFields)[number], z.ZodOptional<z.ZodString>>,
  )
  .partial();

export const importPreviewSchema = z.object({
  sourceKind: z.enum(["generic_csv", "jira_csv"]),
  sourceNamespace: z.string().trim().min(1).max(160),
  sourceName: z.string().trim().min(1).max(160),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .transform(
      (value) => value.replaceAll("\\", "/").split("/").at(-1) ?? "import.csv",
    ),
  csvText: z
    .string()
    .min(1)
    .max(10 * 1024 * 1024),
  mapping: z
    .object({
      columns: mappingColumnsSchema.default({}),
      statusValues: z
        .record(z.string().trim().min(1).max(120), workItemStatusSchema)
        .default({}),
      priorityValues: z
        .record(z.string().trim().min(1).max(120), workItemPrioritySchema)
        .default({}),
    })
    .partial()
    .optional(),
  options: z.object({
    clientId: z.string().uuid(),
    defaultLeadUserId: z.string().uuid(),
    defaultProjectKey: optionalText(10),
    defaultProjectName: optionalText(160),
  }),
});

export const confirmImportSchema = z.object({
  duplicateStrategy: z.literal("skip_existing").default("skip_existing"),
  identityMappings: z
    .record(z.string().uuid(), z.string().uuid().nullable())
    .default({}),
});

export const adoptionPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const importRowPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
});

export const deliveryExportFilterSchema = z.object({
  projectId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(25).default(25),
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type CreateProjectTemplateInput = z.output<
  typeof createProjectTemplateSchema
>;
export type UpdateProjectTemplateInput = z.output<
  typeof updateProjectTemplateSchema
>;
export type ApplyProjectTemplateInput = z.output<
  typeof applyProjectTemplateSchema
>;
export type ImportPreviewInput = z.output<typeof importPreviewSchema>;
export type ConfirmImportInput = z.output<typeof confirmImportSchema>;
export type DeliveryExportFilters = z.output<typeof deliveryExportFilterSchema>;
