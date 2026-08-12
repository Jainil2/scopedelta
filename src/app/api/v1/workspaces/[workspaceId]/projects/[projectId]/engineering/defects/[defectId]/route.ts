import { apiData, apiError, readJson } from "@/lib/api";
import { resolveDefectSchema } from "@/lib/engineering-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { setDefectStatus } from "@/server/engineering-delivery";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    defectId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, defectId } = await params;
    const { status } = parseInput(resolveDefectSchema, await readJson(request));
    await setDefectStatus(actor, workspaceId, projectId, defectId, status);
    return apiData({ status });
  } catch (error) {
    return apiError(error);
  }
}
