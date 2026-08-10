import { apiData, apiError, readJson } from "@/lib/api";
import { activateCommercialBaselineVersionSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { activateCommercialBaselineVersion } from "@/server/commercial-amendments";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    versionId: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, versionId } = await params;
    const input = parseInput(
      activateCommercialBaselineVersionSchema,
      await readJson(request),
    );
    return apiData(
      await activateCommercialBaselineVersion(
        actor,
        workspaceId,
        projectId,
        versionId,
        input,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
