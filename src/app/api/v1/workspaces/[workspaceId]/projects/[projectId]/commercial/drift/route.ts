import { apiData, apiError } from "@/lib/api";
import { commercialDriftFiltersSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { listCommercialDrift } from "@/server/commercial";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const filters = parseInput(
      commercialDriftFiltersSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(
      await listCommercialDrift(actor, workspaceId, projectId, filters),
    );
  } catch (error) {
    return apiError(error);
  }
}
