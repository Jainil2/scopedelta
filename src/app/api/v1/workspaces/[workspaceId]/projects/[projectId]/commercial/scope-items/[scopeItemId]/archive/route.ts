import { apiData, apiError, readJson } from "@/lib/api";
import { setCommercialScopeItemArchiveSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { setCommercialScopeItemArchived } from "@/server/commercial";

type Context = {
  params: Promise<{
    workspaceId: string;
    projectId: string;
    scopeItemId: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, scopeItemId } = await params;
    const input = parseInput(
      setCommercialScopeItemArchiveSchema,
      await readJson(request),
    );
    return apiData(
      await setCommercialScopeItemArchived(
        actor,
        workspaceId,
        projectId,
        scopeItemId,
        input.archived,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
