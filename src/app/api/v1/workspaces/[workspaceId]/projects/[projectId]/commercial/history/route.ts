import { apiData, apiError } from "@/lib/api";
import { commercialHistoryFiltersSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { listCommercialHistory } from "@/server/commercial-amendments";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const url = new URL(request.url);
    const filters = parseInput(commercialHistoryFiltersSchema, {
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    return apiData(
      await listCommercialHistory(actor, workspaceId, projectId, filters),
    );
  } catch (error) {
    return apiError(error);
  }
}
