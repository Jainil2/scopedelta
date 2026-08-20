import { apiData, apiError, readJson } from "@/lib/api";
import {
  timeEntryFiltersSchema,
  timeEntryInputSchema,
} from "@/lib/operations-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createTimeEntry, listTimeEntries } from "@/server/operations";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const filters = parseInput(
      timeEntryFiltersSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(await listTimeEntries(actor, workspaceId, filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const input = parseInput(timeEntryInputSchema, await readJson(request));
    return apiData(await createTimeEntry(actor, workspaceId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
