import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BillingWorkspace } from "@/components/billing-workspace";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BillingWorkspace", () => {
  it("shows non-billable clients and only the configured sandbox checkout", () => {
    render(
      <BillingWorkspace
        workspaceId="workspace"
        overview={overview("managed_cloud")}
        returnedFromCheckout={false}
      />,
    );
    expect(screen.getByText("2 · non-billable")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open sandbox checkout" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Manage with provider" }),
    ).toBeNull();
  });

  it("explains that a self-host deployment has no cloud checkout dependency", () => {
    render(
      <BillingWorkspace
        workspaceId="workspace"
        overview={overview("self_host")}
        returnedFromCheckout={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Open sandbox checkout" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "Self-host core" }),
    ).toBeInTheDocument();
  });
});

function overview(mode: "self_host" | "managed_cloud") {
  const entitlements = {
    softwareCapabilities: ["*"],
    activeProjects: mode === "self_host" ? null : 1,
    internalUsers: null,
    managedAiCredits: mode === "self_host" ? 0 : 5,
    managedEmails: mode === "self_host" ? 0 : 10,
    storageBytes: 0,
    processingUnits: 0,
  };
  return {
    mode,
    canManage: true,
    portalAvailable: false,
    subscription: {
      planKey: mode === "self_host" ? "self_host" : "entry_test",
      pendingPlanKey: null,
      status: "entry",
      paidThrough: null,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      effectiveEntitlements: entitlements,
    },
    plans: [
      {
        key: mode === "self_host" ? "self_host" : "entry_test",
        label: mode === "self_host" ? "Self-host core" : "Entry test",
        description: "Current entitlement.",
        displayPrice: null,
        checkoutAvailable: false,
        current: true,
        entitlements,
      },
      ...(mode === "managed_cloud"
        ? [
            {
              key: "paid_test",
              label: "Paid sandbox test",
              description: "Configured test entitlement.",
              displayPrice: null,
              checkoutAvailable: true,
              current: false,
              entitlements: { ...entitlements, activeProjects: 10 },
            },
          ]
        : []),
    ],
    economics: {
      activeProjects: 1,
      internalUsers: 1,
      externalParticipants: 2,
      managedUsage: {
        periodStartsAt: "2026-08-01T00:00:00.000Z",
        periodEndsAt: "2026-09-01T00:00:00.000Z",
        reserved: 0,
        consumed: 0,
      },
      aiProviderUsage: {
        attempts: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        durationMs: 0,
      },
      emailUsage: { attempts: 0, failures: 0 },
      rejectedOrFailedBillingEvents: 0,
    },
  };
}
