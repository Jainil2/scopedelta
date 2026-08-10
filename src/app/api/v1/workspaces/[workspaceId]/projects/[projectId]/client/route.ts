import { apiData, apiError, readJson } from "@/lib/api";
import { updateClientProjectProfileSchema } from "@/lib/client-collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  getClientProjectPreview,
  updateClientProjectProfile,
} from "@/server/client-collaboration";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    return apiData(
      await getClientProjectPreview(actor, workspaceId, projectId),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      updateClientProjectProfileSchema,
      await readJson(request),
    );
    return apiData(
      await updateClientProjectProfile(
        actor,
        workspaceId,
        projectId,
        input.summary,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
