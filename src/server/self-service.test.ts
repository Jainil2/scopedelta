import { describe, expect, it } from "vitest";

import {
  buildOperatorSignalExport,
  recoveryGuidance,
} from "@/server/self-service";

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
      failureClass: "validation",
      authoritativeState: "partially_committed",
      retry: "not_applicable",
      summary:
        "Some valid records were preserved, but the remaining source or input must be corrected before continuing.",
      nextAction: {
        label: "Correct source or input",
        href: "/imports/session",
      },
      adminRequired: false,
    });
  });

  it("keeps authoritative state unchanged for pre-commit validation failures", () => {
    expect(
      recoveryGuidance("import", "invalid_source", "/imports/session"),
    ).toMatchObject({
      failureClass: "validation",
      authoritativeState: "unchanged",
      retry: "not_applicable",
      summary:
        "Authoritative state is unchanged. Correct the source or input before trying again.",
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

describe("operator signal export projection", () => {
  it("keeps every bounded query category under its intended label", () => {
    const buckets = {
      funnel: [{ eventType: "workspace_created", workspaces: 4 }],
      ai: [{ id: "ai", status: "failed" }],
      imports: [{ id: "import", status: "failed" }],
      billing: [{ id: "billing", status: "rejected" }],
      checkouts: [{ id: "checkout", status: "failed" }],
      provider: [{ id: "provider", status: "failed" }],
      repositories: [{ id: "repository", status: "revoked" }],
      usage: [{ workspaceId: "workspace", units: 80 }],
      alertDelivery: [{ id: "alert", status: "failed" }],
      workspaceEmail: [{ id: "workspace-email", status: "failed" }],
      clientEmail: [{ id: "client-email", status: "failed" }],
      notificationEmail: [{ workspaceId: "workspace", failures: 3 }],
      lifecycle: [{ id: "lifecycle", intent: "closure" }],
      repeated: [{ eventType: "entitlement_denied", occurrenceCount: 5 }],
    };

    expect(buildOperatorSignalExport(buckets)).toEqual({
      funnel: buckets.funnel,
      attention: {
        ai: buckets.ai,
        imports: buckets.imports,
        billing: buckets.billing,
        billingCheckouts: buckets.checkouts,
        provider: buckets.provider,
        repositories: buckets.repositories,
        managedUsage: buckets.usage,
        alertDelivery: buckets.alertDelivery,
        email: {
          workspaceInvitations: buckets.workspaceEmail,
          clientInvitations: buckets.clientEmail,
          notifications: buckets.notificationEmail,
        },
        lifecycle: buckets.lifecycle,
        repeated: buckets.repeated,
      },
    });
  });
});
