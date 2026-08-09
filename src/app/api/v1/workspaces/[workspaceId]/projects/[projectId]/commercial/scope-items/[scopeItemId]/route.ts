import { apiData, apiError, readJson } from "@/lib/api";
import { updateCommercialScopeItemSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { updateCommercialScopeItem } from "@/server/commercial";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    scopeItemId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, scopeItemId } = await params;
    const input = parseInput(
      updateCommercialScopeItemSchema,
      await readJson(request, 65_536),
    );
    return apiData(
      await updateCommercialScopeItem(
        actor,
        workspaceId,
        projectId,
        scopeItemId,
        input,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
