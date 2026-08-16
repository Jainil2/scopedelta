import { BillingWorkspace } from "@/components/billing-workspace";
import { requireSession } from "@/lib/session";
import { getWorkspaceBillingOverview } from "@/server/billing";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function BillingPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
  const overview = await getWorkspaceBillingOverview(actor, workspace.id);
  const query = await searchParams;
  return (
    <div className="app-content">
      <header className="app-page-header">
        <div>
          <p className="app-eyebrow">Billing and cloud economics</p>
          <h1>Capacity without surprise spend</h1>
          <p>
            Subscription state, managed-resource allowances, and provider-safe
            usage evidence for {workspace.name}.
          </p>
        </div>
      </header>
      <BillingWorkspace
        workspaceId={workspace.id}
        overview={overview}
        returnedFromCheckout={query.checkout === "returned"}
      />
    </div>
  );
}
