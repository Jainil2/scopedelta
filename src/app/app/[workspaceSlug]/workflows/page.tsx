import { WorkflowExplorer } from "@/components/workflow-explorer";
import { WORKFLOW_CATALOG } from "@/webmcp/workflow-catalog";

export default async function WorkflowsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const root = `/app/${encodeURIComponent(workspaceSlug)}`;
  const targets: Record<string, string> = {
    workspace_setup: "/onboarding",
    workspace_settings: `${root}/settings`,
    workspace_members: `${root}/settings/members`,
    workspace_invitations: `${root}/settings/members`,
    workspace_onboarding: `${root}/settings/getting-started`,
    workspace_lifecycle: `${root}/settings`,
    workspace_billing: `${root}/settings/billing`,
    client_accounts: `${root}/clients`,
    assigned_work: `${root}/my-work`,
    workspace_inbox: `${root}/inbox`,
    portfolio_review: `${root}/operations`,
    capacity_planning: `${root}/operations/capacity`,
    project_allocations: `${root}/operations/capacity`,
    time_tracking: `${root}/operations/time`,
    commercial_exposure: `${root}/operations/exposure`,
    project_templates: `${root}/settings/adoption`,
    delivery_import: `${root}/settings/adoption`,
    workspace_exports: `${root}/settings`,
  };
  const flows = WORKFLOW_CATALOG.map((flow) => ({
    name: flow.name,
    title: flow.title,
    category: flow.category,
    description: flow.description,
    actions: flow.operations.map((operation) => ({
      name: operation.action,
      confirmation: Boolean(operation.confirmation),
      handoff: Boolean(operation.handoff),
    })),
    href: flow.surfaces.includes("client")
      ? "/client"
      : (targets[flow.name] ?? `${root}/projects`),
  }));
  return <WorkflowExplorer flows={flows} workspaceSlug={workspaceSlug} />;
}
