import { apiData, apiError, readJson } from "@/lib/api";
import { createCommercialScopeItemSchema } from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createCommercialScopeItem } from "@/server/commercial";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      createCommercialScopeItemSchema,
      await readJson(request, 65_536),
    );
    return apiData(
      await createCommercialScopeItem(actor, workspaceId, projectId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
