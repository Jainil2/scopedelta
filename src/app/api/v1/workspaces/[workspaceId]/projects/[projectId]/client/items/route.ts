import { apiData, apiError, readJson } from "@/lib/api";
import { createClientProjectItemSchema } from "@/lib/client-collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { addClientProjectItem } from "@/server/client-collaboration";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      createClientProjectItemSchema,
      await readJson(request),
    );
    return apiData(
      await addClientProjectItem(actor, workspaceId, projectId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
