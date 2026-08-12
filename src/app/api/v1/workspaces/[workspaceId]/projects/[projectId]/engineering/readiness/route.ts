import { apiData, apiError } from "@/lib/api";
import { engineeringCoverageFiltersSchema } from "@/lib/engineering-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { getEngineeringCoverage } from "@/server/engineering-delivery";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const url = new URL(request.url);
    const filters = parseInput(engineeringCoverageFiltersSchema, {
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
      milestoneId: url.searchParams.get("milestoneId") ?? undefined,
    });
    return apiData(
      await getEngineeringCoverage(actor, workspaceId, projectId, filters),
    );
  } catch (error) {
    return apiError(error);
  }
}
