"use client";

import { useState } from "react";

type Entitlements = {
  softwareCapabilities: string[];
  activeProjects: number | null;
  internalUsers: number | null;
  managedAiCredits: number;
  managedEmails: number;
  storageBytes: number;
  processingUnits: number;
};

type BillingOverview = {
  mode: "self_host" | "managed_cloud";
  canManage: boolean;
  portalAvailable: boolean;
  subscription: {
    planKey: string;
    pendingPlanKey: string | null;
    status: string;
    paidThrough: string | Date | null;
    graceEndsAt: string | Date | null;
    cancelAtPeriodEnd: boolean;
    effectiveEntitlements: Entitlements;
  };
  plans: Array<{
    key: string;
    label: string;
    description: string;
    displayPrice: string | null;
    checkoutAvailable: boolean;
    current: boolean;
    entitlements: Entitlements;
  }>;
  economics: {
    activeProjects: number;
    internalUsers: number;
    externalParticipants: number;
    managedUsage: {
      periodStartsAt: string | Date;
      periodEndsAt: string | Date;
      reserved: number;
      consumed: number;
    };
    aiProviderUsage: {
      attempts: number;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      durationMs: number;
    };
    emailUsage: { attempts: number; failures: number };
    rejectedOrFailedBillingEvents: number;
  };
};

type ApiResult<T> = { data: T } | { error: { message: string } };

async function post<T>(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = (await response.json()) as ApiResult<T>;
  if (!response.ok || "error" in result) {
    throw new Error(
      "error" in result ? result.error.message : "Request failed.",
    );
  }
  return result.data;
}

function limit(value: number | null) {
  return value === null ? "No software limit" : value.toLocaleString();
}

export function BillingWorkspace({
  workspaceId,
  overview,
  returnedFromCheckout,
}: Readonly<{
  workspaceId: string;
  overview: BillingOverview;
  returnedFromCheckout: boolean;
}>) {
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState(
    returnedFromCheckout
      ? "Checkout returned. Paid access changes only after the signed provider webhook is processed."
      : "",
  );

  async function checkout(planKey: string) {
    if (pending) return;
    setPending(planKey);
    setMessage("");
    try {
      const result = await post<{ checkoutUrl: string }>(
        `/api/v1/workspaces/${workspaceId}/billing/checkout`,
        { planKey, idempotencyKey: crypto.randomUUID() },
      );
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed.");
      setPending(null);
    }
  }

  async function portal() {
    if (pending) return;
    setPending("portal");
    setMessage("");
    try {
      const result = await post<{ portalUrl: string }>(
        `/api/v1/workspaces/${workspaceId}/billing/portal`,
      );
      window.location.assign(result.portalUrl);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Portal unavailable.",
      );
      setPending(null);
    }
  }

  const economics = overview.economics;
  const entitlements = overview.subscription.effectiveEntitlements;
  const currentPlan = overview.plans.find((plan) => plan.current);
  return (
    <div className="billing-stack">
      {message ? (
        <p className="platform-status billing-notice" role="status">
          {message}
        </p>
      ) : null}

      <section className="settings-section" aria-labelledby="billing-state">
        <div className="billing-section-heading">
          <div>
            <p className="app-eyebrow">Current entitlement</p>
            <h2 id="billing-state">
              {currentPlan?.label ?? overview.subscription.planKey}
            </h2>
            <p>
              Status:{" "}
              <strong>
                {overview.subscription.status.replaceAll("_", " ")}
              </strong>
              {overview.subscription.cancelAtPeriodEnd
                ? " · cancellation scheduled at period end"
                : ""}
            </p>
          </div>
          {overview.mode === "managed_cloud" &&
          overview.canManage &&
          overview.portalAvailable ? (
            <button
              className="app-secondary-button"
              type="button"
              onClick={portal}
              disabled={Boolean(pending)}
            >
              {pending === "portal" ? "Opening…" : "Manage with provider"}
            </button>
          ) : null}
        </div>
        <dl className="billing-metrics">
          <div>
            <dt>Active projects</dt>
            <dd>
              {economics.activeProjects} / {limit(entitlements.activeProjects)}
            </dd>
          </div>
          <div>
            <dt>Internal users</dt>
            <dd>
              {economics.internalUsers} / {limit(entitlements.internalUsers)}
            </dd>
          </div>
          <div>
            <dt>External participants</dt>
            <dd>{economics.externalParticipants} · non-billable</dd>
          </div>
          <div>
            <dt>Managed AI credits · current period</dt>
            <dd>
              {economics.managedUsage.consumed} consumed ·{" "}
              {economics.managedUsage.reserved} reserved /{" "}
              {entitlements.managedAiCredits}
            </dd>
          </div>
        </dl>
      </section>

      <section className="settings-section" aria-labelledby="billing-plans">
        <div className="billing-section-heading">
          <div>
            <p className="app-eyebrow">Configured catalog</p>
            <h2 id="billing-plans">Plans and managed allowances</h2>
          </div>
        </div>
        <div className="billing-plan-grid">
          {overview.plans.map((plan) => (
            <article className="billing-plan-card" key={plan.key}>
              <div>
                <p className="app-eyebrow">
                  {plan.current ? "Current" : "Available"}
                </p>
                <h3>{plan.label}</h3>
                <p>{plan.description}</p>
                {plan.displayPrice ? (
                  <strong>{plan.displayPrice}</strong>
                ) : null}
              </div>
              <ul>
                <li>
                  {limit(plan.entitlements.activeProjects)} active projects
                </li>
                <li>{limit(plan.entitlements.internalUsers)} internal users</li>
                <li>{plan.entitlements.managedAiCredits} managed AI credits</li>
                <li>{plan.entitlements.managedEmails} managed email sends</li>
              </ul>
              {overview.mode === "managed_cloud" &&
              overview.canManage &&
              plan.checkoutAvailable &&
              !plan.current ? (
                <button
                  className="app-primary-button"
                  type="button"
                  onClick={() => checkout(plan.key)}
                  disabled={Boolean(pending)}
                >
                  {pending === plan.key
                    ? "Preparing…"
                    : "Open sandbox checkout"}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="billing-economics">
        <p className="app-eyebrow">Operator-safe evidence</p>
        <h2 id="billing-economics">Managed resource activity</h2>
        <dl className="billing-metrics">
          <div>
            <dt>AI attempts</dt>
            <dd>{economics.aiProviderUsage.attempts}</dd>
          </div>
          <div>
            <dt>Raw AI tokens</dt>
            <dd>
              {economics.aiProviderUsage.inputTokens.toLocaleString()} in ·{" "}
              {economics.aiProviderUsage.outputTokens.toLocaleString()} out ·{" "}
              {economics.aiProviderUsage.cachedInputTokens.toLocaleString()}{" "}
              cached
            </dd>
          </div>
          <div>
            <dt>Email attempts</dt>
            <dd>
              {economics.emailUsage.attempts} · {economics.emailUsage.failures}{" "}
              failed
            </dd>
          </div>
          <div>
            <dt>Billing event exceptions</dt>
            <dd>{economics.rejectedOrFailedBillingEvents}</dd>
          </div>
        </dl>
        <p className="settings-readonly">
          These totals contain identifiers and usage counts only—no customer
          documents, request bodies, mail content, or provider payloads.
        </p>
      </section>
    </div>
  );
}
