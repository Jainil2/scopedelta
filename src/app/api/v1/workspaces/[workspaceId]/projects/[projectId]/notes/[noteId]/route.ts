import { apiData, apiError, readJson } from "@/lib/api";
import { updateProjectNoteSchema } from "@/lib/collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { getProjectNote, updateProjectNote } from "@/server/collaboration";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string; noteId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, noteId } = await params;
    return apiData(await getProjectNote(actor, workspaceId, projectId, noteId));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, noteId } = await params;
    const input = parseInput(
      updateProjectNoteSchema,
      await readJson(request, 32_768),
    );
    return apiData(
      await updateProjectNote(actor, workspaceId, projectId, noteId, input),
    );
  } catch (error) {
    return apiError(error);
  }
}
