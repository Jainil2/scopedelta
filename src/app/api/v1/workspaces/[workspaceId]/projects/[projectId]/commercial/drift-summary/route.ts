import { apiData, apiError } from "@/lib/api";
import { commercialDriftSummaryFiltersSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { getCommercialDriftSnapshot } from "@/server/commercial";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const filters = parseInput(
      commercialDriftSummaryFiltersSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(
      await getCommercialDriftSnapshot(
        actor,
        workspaceId,
        projectId,
        filters.limit,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
