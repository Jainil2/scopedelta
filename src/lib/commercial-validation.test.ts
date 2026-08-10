import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createCommercialDecisionSchema,
  createCommercialImpactAssessmentSchema,
} from "@/lib/commercial-validation";

const dispositions = [
  "covered",
  "absorbed",
  "swap",
  "paid_change",
  "deferred",
  "rejected",
] as const;

describe("commercial change-control validation", () => {
  it.each(dispositions)("accepts a valid %s decision", (disposition) => {
    const scopeId = randomUUID();
    const parsed = createCommercialDecisionSchema.safeParse({
      ...decisionInput(disposition),
      coverageBasis: disposition === "covered" ? "baseline" : null,
      swapOffsetScopeItemIds: disposition === "swap" ? [scopeId] : [],
    });
    expect(parsed.success).toBe(true);
  });

  it("requires offsetting scope only for swaps and limits optional coverage basis to covered work", () => {
    expect(
      createCommercialDecisionSchema.safeParse(decisionInput("swap")).success,
    ).toBe(false);
    expect(
      createCommercialDecisionSchema.safeParse({
        ...decisionInput("absorbed"),
        coverageBasis: "defect_or_warranty",
      }).success,
    ).toBe(false);
    expect(
      createCommercialDecisionSchema.safeParse(decisionInput("covered"))
        .success,
    ).toBe(true);
    expect(
      createCommercialDecisionSchema.safeParse({
        ...decisionInput("paid_change"),
        swapOffsetScopeItemIds: [randomUUID()],
      }).success,
    ).toBe(false);
  });

  it("keeps exact money paired with ISO currency and separates estimate from confirmed", () => {
    const valid = createCommercialImpactAssessmentSchema.safeParse({
      idempotencyKey: randomUUID(),
      decisionId: null,
      supersedesImpactAssessmentId: null,
      confidence: "confirmed",
      effortMinutes: null,
      scheduleDeltaDays: null,
      targetDate: null,
      monetaryAmount: "1200.50",
      currencyCode: "usd",
      notes: null,
      anchors: [],
    });
    expect(valid).toMatchObject({
      success: true,
      data: { monetaryAmount: "1200.50", currencyCode: "USD" },
    });
    expect(
      createCommercialImpactAssessmentSchema.safeParse({
        idempotencyKey: randomUUID(),
        confidence: "estimate",
        monetaryAmount: "1.999",
        currencyCode: "USD",
      }).success,
    ).toBe(false);
  });
});

function decisionInput(disposition: (typeof dispositions)[number]) {
  return {
    idempotencyKey: randomUUID(),
    disposition,
    coverageBasis: null,
    rationale: null,
    supersedesDecisionId: null,
    affectedScopeItemIds: [],
    swapOffsetScopeItemIds: [],
    anchors: [],
    impact: null,
  };
}
