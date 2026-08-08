import { apiData, apiError, readJson } from "@/lib/api";
import {
  createCycleSchema,
  cycleFilterSchema,
} from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createCycle, listCycles } from "@/server/delivery";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const filters = parseInput(
      cycleFilterSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(await listCycles(actor, workspaceId, projectId, filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(createCycleSchema, await readJson(request));
    return apiData(
      await createCycle(actor, workspaceId, projectId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
