import { apiData, apiError, readJson } from "@/lib/api";
import { updateTimeEntrySchema } from "@/lib/operations-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { deleteTimeEntry, updateTimeEntry } from "@/server/operations";

type Context = { params: Promise<{ workspaceId: string; entryId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, entryId } = await params;
    const input = parseInput(updateTimeEntrySchema, await readJson(request));
    return apiData(await updateTimeEntry(actor, workspaceId, entryId, input));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, entryId } = await params;
    return apiData(await deleteTimeEntry(actor, workspaceId, entryId));
  } catch (error) {
    return apiError(error);
  }
}
