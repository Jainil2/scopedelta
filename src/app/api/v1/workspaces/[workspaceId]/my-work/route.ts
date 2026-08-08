import { apiData, apiError } from "@/lib/api";
import { myWorkFilterSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { listMyWork } from "@/server/delivery";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const filters = parseInput(
      myWorkFilterSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(await listMyWork(actor, workspaceId, filters));
  } catch (error) {
    return apiError(error);
  }
}
