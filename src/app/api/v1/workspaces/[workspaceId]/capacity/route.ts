import { apiData, apiError } from "@/lib/api";
import { capacityFiltersSchema } from "@/lib/operations-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { listCapacity } from "@/server/operations";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const filters = parseInput(
      capacityFiltersSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(await listCapacity(actor, workspaceId, filters));
  } catch (error) {
    return apiError(error);
  }
}
