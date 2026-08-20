import { notFound } from "next/navigation";

import { CommercialChangeControl } from "@/components/commercial-change-control";
import { CommercialWorkspace } from "@/components/commercial-workspace";
import { ProjectExposureSummary } from "@/components/operations-workspace";
import {
  commercialDriftFiltersSchema,
  commercialHistoryFiltersSchema,
  commercialRequestFiltersSchema,
} from "@/lib/commercial-validation";
import { PlatformError } from "@/lib/platform-errors";
import { parseInput } from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import {
  listCommercialDrift,
  listCommercialOverview,
} from "@/server/commercial";
import { listCommercialRequests } from "@/server/commercial-change-control";
import { listCommercialHistory } from "@/server/commercial-amendments";
import { getProjectByKey } from "@/server/delivery";
import { getProjectCommercialExposure } from "@/server/operations";
import { getWorkspaceBySlug } from "@/server/workspaces";

export default async function CommercialPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string; projectKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug, projectKey } = await params;
  const data = await loadCommercial(
    actor,
    workspaceSlug,
    projectKey,
    await searchParams,
  );
  return (
    <CommercialWorkspace
      key={`${data.drift.page.number}:${data.requests.page.number}:${data.history.page.number}`}
      workspaceId={data.workspace.id}
      workspaceSlug={workspaceSlug}
      project={data.project}
      initialOverview={data.overview}
      drift={data.drift}
      driftSummary={{
        commerciallyUnlinked: data.unlinked.page.total,
        needsClassification: data.unclassified.page.total,
        linked: data.linked.page.total,
        staleBasis: data.stale.page.total,
        supportInternal: data.support.page.total,
      }}
      history={data.history}
      decisionOptions={data.requests.data.flatMap((request) =>
        request.currentDecision
          ? [
              {
                id: request.currentDecision.id,
                requestTitle: request.title,
                disposition: request.currentDecision.disposition,
              },
            ]
          : [],
      )}
      changeControl={
        <CommercialChangeControl
          key="commercial-change-control"
          workspaceId={data.workspace.id}
          workspaceSlug={workspaceSlug}
          projectId={data.project.id}
          projectKey={data.project.key}
          sources={data.overview.sources}
          scopeItems={data.overview.scopeItems}
          ledger={data.requests}
        />
      }
      exposurePanel={<ProjectExposureSummary summary={data.exposure} />}
    />
  );
}

async function loadCommercial(
  actor: { userId: string; email: string },
  workspaceSlug: string,
  projectKey: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  try {
    const filters = parseInput(commercialDriftFiltersSchema, {
      page:
        typeof searchParams.page === "string" ? searchParams.page : undefined,
      pageSize: 50,
    });
    const requestFilters = parseInput(commercialRequestFiltersSchema, {
      page:
        typeof searchParams.requestPage === "string"
          ? searchParams.requestPage
          : undefined,
      pageSize: 25,
    });
    const historyFilters = parseInput(commercialHistoryFiltersSchema, {
      page:
        typeof searchParams.historyPage === "string"
          ? searchParams.historyPage
          : undefined,
      pageSize: 10,
    });
    const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
    const project = await getProjectByKey(
      actor,
      workspace.id,
      projectKey.toUpperCase(),
    );
    const [
      overview,
      drift,
      unlinked,
      unclassified,
      linked,
      stale,
      support,
      requests,
      history,
      exposure,
    ] = await Promise.all([
      listCommercialOverview(actor, workspace.id, project.id),
      listCommercialDrift(actor, workspace.id, project.id, filters),
      listCommercialDrift(actor, workspace.id, project.id, {
        page: 1,
        pageSize: 1,
        state: "commercially_unlinked",
      }),
      listCommercialDrift(actor, workspace.id, project.id, {
        page: 1,
        pageSize: 1,
        state: "needs_classification",
      }),
      listCommercialDrift(actor, workspace.id, project.id, {
        page: 1,
        pageSize: 1,
        state: "linked",
      }),
      listCommercialDrift(actor, workspace.id, project.id, {
        page: 1,
        pageSize: 1,
        state: "stale_basis",
      }),
      listCommercialDrift(actor, workspace.id, project.id, {
        page: 1,
        pageSize: 1,
        state: "support_internal",
      }),
      listCommercialRequests(actor, workspace.id, project.id, requestFilters),
      listCommercialHistory(actor, workspace.id, project.id, historyFilters),
      getProjectCommercialExposure(actor, workspace.id, project.id),
    ]);
    return {
      workspace,
      project,
      overview,
      drift,
      unlinked,
      unclassified,
      linked,
      stale,
      support,
      requests,
      history,
      exposure,
    };
  } catch (error) {
    if (error instanceof PlatformError && error.status === 404) notFound();
    throw error;
  }
}
