import { apiData, apiError, readJson } from "@/lib/api";
import { updateProjectSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { getProject, updateProject } from "@/server/delivery";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    return apiData(await getProject(actor, workspaceId, projectId));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(updateProjectSchema, await readJson(request));
    return apiData(await updateProject(actor, workspaceId, projectId, input));
  } catch (error) {
    return apiError(error);
  }
}
