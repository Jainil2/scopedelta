import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  actOnClientPacketSchema,
  clientPageSchema,
  createClientDiscussionSchema,
  createClientInvitationSchema,
  publishClientPacketSchema,
  updateClientRequestStateSchema,
} from "@/lib/client-collaboration-validation";
import {
  CLIENT_PROJECT_PROJECTION_KEYS,
  packetRequirementForDisposition,
  type ClientProjectProjection,
} from "@/lib/client-project-projection";

describe("client collaboration boundary", () => {
  it.each([
    ["covered", "informational"],
    ["absorbed", "informational"],
    ["swap", "approval"],
    ["paid_change", "approval"],
    ["deferred", "informational"],
    ["rejected", "informational"],
  ] as const)("maps %s packets to %s", (disposition, requirement) => {
    expect(packetRequirementForDisposition(disposition)).toBe(requirement);
  });

  it("bounds pages, text, UUIDs and participant roles", () => {
    expect(clientPageSchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(clientPageSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(
      createClientInvitationSchema.safeParse({
        idempotencyKey: randomUUID(),
        email: "CLIENT@EXAMPLE.TEST",
        role: "approver",
      }),
    ).toMatchObject({
      success: true,
      data: { email: "client@example.test", sendEmail: false },
    });
    expect(
      createClientDiscussionSchema.safeParse({
        idempotencyKey: randomUUID(),
        target: "request",
        targetId: randomUUID(),
        body: "x".repeat(5_001),
      }).success,
    ).toBe(false);
    expect(
      actOnClientPacketSchema.safeParse({
        idempotencyKey: "retry-one",
        action: "approved",
      }).success,
    ).toBe(false);
    expect(
      updateClientRequestStateSchema.safeParse({
        idempotencyKey: randomUUID(),
        state: "resolved",
      }).success,
    ).toBe(false);
  });

  it("requires confirmed-value selection flags to remain explicit", () => {
    const parsed = publishClientPacketSchema.parse({
      idempotencyKey: randomUUID(),
      decisionId: randomUUID(),
      title: "Launch change",
      requestSummary: "The requested launch change.",
      treatmentSummary: "Handled as a paid change.",
    });
    expect(parsed).toMatchObject({
      includeScheduleDeltaDays: false,
      includeTargetDate: false,
      includeMonetaryAmount: false,
      scopeItemRevisionIds: [],
    });
    expect(parsed).not.toHaveProperty("impactAssessmentId");
  });

  it("defines an allowlisted projection with no internal delivery keys", () => {
    expect(CLIENT_PROJECT_PROJECTION_KEYS).toEqual([
      "project",
      "participant",
      "items",
      "requests",
      "packets",
      "acceptanceTargets",
      "discussion",
      "attention",
      "history",
    ] satisfies ReadonlyArray<keyof ClientProjectProjection>);
    const serialized = JSON.stringify(CLIENT_PROJECT_PROJECTION_KEYS);
    for (const forbidden of [
      "estimate",
      "rationale",
      "evidence",
      "drift",
      "audit",
      "workItems",
      "notes",
      "ai",
      "git",
      "qa",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
