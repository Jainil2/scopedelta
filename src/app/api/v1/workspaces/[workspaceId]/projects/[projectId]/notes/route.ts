import { apiData, apiError, readJson } from "@/lib/api";
import {
  createProjectNoteSchema,
  projectNoteFilterSchema,
} from "@/lib/collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createProjectNote, listProjectNotes } from "@/server/collaboration";

type Context = { params: Promise<{ workspaceId: string; projectId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const filters = parseInput(
      projectNoteFilterSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(
      await listProjectNotes(actor, workspaceId, projectId, filters),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      createProjectNoteSchema,
      await readJson(request, 32_768),
    );
    return apiData(
      await createProjectNote(actor, workspaceId, projectId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
