import { describe, expect, it } from "vitest";

import { recoveryGuidance } from "@/server/self-service";

describe("self-service recovery guidance", () => {
  it("maps safe failure classes without exposing provider content", () => {
    expect(
      recoveryGuidance("ai", "provider_configuration_missing", "/settings/ai"),
    ).toEqual({
      failureClass: "configuration",
      authoritativeState: "unchanged",
      retry: "safe_after_configuration",
      summary:
        "The operation failed before changing authoritative delivery state and can be retried safely.",
      nextAction: {
        label: "Review configuration",
        href: "/settings/ai",
      },
      adminRequired: true,
    });
  });

  it("distinguishes partially committed import recovery", () => {
    expect(
      recoveryGuidance("import", "validation", "/imports/session", true),
    ).toMatchObject({
      failureClass: "provider",
      authoritativeState: "partially_committed",
      retry: "safe_now",
      adminRequired: false,
    });
  });

  it("treats delivery evidence as preserved for email retries", () => {
    expect(
      recoveryGuidance("email", "provider_rejected", "/settings/members"),
    ).toMatchObject({
      failureClass: "delivery",
      authoritativeState: "preserved",
      retry: "safe_now",
    });
  });
});
