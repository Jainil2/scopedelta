import "server-only";

import { z } from "zod";

import type { EffectiveEntitlements } from "@/db/schema";

const planKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);
const nonNegativeLimit = z.number().int().min(0);

const entitlementsSchema = z.object({
  softwareCapabilities: z.array(z.string().min(1).max(100)).max(100),
  activeProjects: z.number().int().min(1).nullable(),
  internalUsers: z.number().int().min(1).nullable(),
  managedAiCredits: nonNegativeLimit,
  managedEmails: nonNegativeLimit,
  storageBytes: nonNegativeLimit,
  processingUnits: nonNegativeLimit,
});

const planDefinitionSchema = z.object({
  key: planKeySchema,
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(280),
  providerPriceId: z.string().min(1).max(100).optional(),
  displayPrice: z.string().min(1).max(80).optional(),
  entitlements: entitlementsSchema,
});

const planCatalogSchema = z.array(planDefinitionSchema).min(1).max(20);

export type PlanDefinition = z.infer<typeof planDefinitionSchema>;

export type DistributionConfig =
  | {
      mode: "self_host";
      entryPlanKey: "self_host";
      plans: Map<string, PlanDefinition>;
      managedAi: false;
      managedEmail: false;
      graceDays: number;
      allowManagedActionsDuringGrace: false;
    }
  | {
      mode: "managed_cloud";
      entryPlanKey: string;
      plans: Map<string, PlanDefinition>;
      managedAi: boolean;
      managedEmail: boolean;
      graceDays: number;
      allowManagedActionsDuringGrace: boolean;
    };

const selfHostPlan: PlanDefinition = {
  key: "self_host",
  label: "Self-host core",
  description:
    "Customer-operated Local/LAN capability with no ScopeDelta Cloud billing dependency.",
  entitlements: {
    softwareCapabilities: ["*"],
    activeProjects: null,
    internalUsers: null,
    managedAiCredits: 0,
    managedEmails: 0,
    storageBytes: 0,
    processingUnits: 0,
  },
};

function booleanValue(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("billing_configuration_invalid");
}

function graceDays() {
  const value = Number(process.env.BILLING_GRACE_DAYS?.trim() || "7");
  if (!Number.isInteger(value) || value < 1 || value > 30) {
    throw new Error("billing_configuration_invalid");
  }
  return value;
}

export function getDistributionConfig(): DistributionConfig {
  const mode = z
    .enum(["self_host", "managed_cloud"])
    .parse(process.env.DISTRIBUTION_MODE?.trim() || "self_host");
  if (mode === "self_host") {
    return {
      mode,
      entryPlanKey: "self_host",
      plans: new Map([[selfHostPlan.key, selfHostPlan]]),
      managedAi: false,
      managedEmail: false,
      graceDays: graceDays(),
      allowManagedActionsDuringGrace: false,
    };
  }

  const rawCatalog = process.env.BILLING_PLANS_JSON?.trim();
  const entryPlanKey = planKeySchema.parse(
    process.env.BILLING_ENTRY_PLAN_KEY?.trim(),
  );
  if (!rawCatalog) throw new Error("billing_configuration_invalid");

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawCatalog);
  } catch {
    throw new Error("billing_configuration_invalid");
  }
  const catalog = planCatalogSchema.parse(decoded);
  const plans = new Map(catalog.map((plan) => [plan.key, plan]));
  const providerPriceIds = catalog.flatMap((plan) =>
    plan.providerPriceId ? [plan.providerPriceId] : [],
  );
  if (
    plans.size !== catalog.length ||
    !plans.has(entryPlanKey) ||
    new Set(providerPriceIds).size !== providerPriceIds.length
  ) {
    throw new Error("billing_configuration_invalid");
  }

  return {
    mode,
    entryPlanKey,
    plans,
    managedAi: booleanValue("MANAGED_AI", false),
    managedEmail: booleanValue("MANAGED_EMAIL", false),
    graceDays: graceDays(),
    allowManagedActionsDuringGrace: booleanValue(
      "BILLING_ALLOW_MANAGED_ACTIONS_DURING_GRACE",
      false,
    ),
  };
}

export function getPlan(planKey: string, config = getDistributionConfig()) {
  const plan = config.plans.get(planKey);
  if (!plan) throw new Error("billing_plan_unavailable");
  return plan;
}

export function effectiveEntitlements(plan: PlanDefinition) {
  return structuredClone(plan.entitlements) satisfies EffectiveEntitlements;
}

export function publicPlan(plan: PlanDefinition, currentPlanKey: string) {
  return {
    key: plan.key,
    label: plan.label,
    description: plan.description,
    displayPrice: plan.displayPrice ?? null,
    checkoutAvailable: Boolean(plan.providerPriceId),
    current: plan.key === currentPlanKey,
    entitlements: plan.entitlements,
  };
}
