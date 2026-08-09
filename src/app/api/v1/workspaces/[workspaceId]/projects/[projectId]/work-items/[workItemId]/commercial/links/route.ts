import { apiData, apiError, readJson } from "@/lib/api";
import { createCommercialBasisLinkSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createCommercialBasisLink } from "@/server/commercial";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    workItemId: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, workItemId } = await params;
    const input = parseInput(
      createCommercialBasisLinkSchema,
      await readJson(request),
    );
    return apiData(
      await createCommercialBasisLink(
        actor,
        workspaceId,
        projectId,
        workItemId,
        input,
      ),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
