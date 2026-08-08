import { apiData, apiError, readJson } from "@/lib/api";
import { projectMemberSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { addProjectMember, listProjectMembers } from "@/server/delivery";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    return apiData(await listProjectMembers(actor, workspaceId, projectId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(projectMemberSchema, await readJson(request));
    return apiData(
      await addProjectMember(actor, workspaceId, projectId, input.userId),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
