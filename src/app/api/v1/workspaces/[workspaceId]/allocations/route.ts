import { apiData, apiError, readJson } from "@/lib/api";
import {
  allocationInputSchema,
  capacityFiltersSchema,
} from "@/lib/operations-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createAllocation, listAllocations } from "@/server/operations";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const filters = parseInput(
      capacityFiltersSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(await listAllocations(actor, workspaceId, filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const input = parseInput(allocationInputSchema, await readJson(request));
    return apiData(await createAllocation(actor, workspaceId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
