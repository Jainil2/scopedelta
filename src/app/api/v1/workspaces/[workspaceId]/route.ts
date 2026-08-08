import { apiData, apiError, readJson } from "@/lib/api";
import { parseInput, updateWorkspaceSchema } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { updateWorkspace } from "@/server/workspaces";

type Context = { params: Promise<{ workspaceId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await context.params;
    const input = parseInput(updateWorkspaceSchema, await readJson(request));
    return apiData(await updateWorkspace(actor, workspaceId, input));
  } catch (error) {
    return apiError(error);
  }
}
