import { apiData, apiError } from "@/lib/api";
import { clientPageSchema } from "@/lib/client-collaboration-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { getClientProjectProjection } from "@/server/client-collaboration";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { projectId } = await params;
    const url = new URL(request.url);
    const historyPage = parseInput(clientPageSchema, {
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    return apiData(
      await getClientProjectProjection(actor, projectId, historyPage),
    );
  } catch (error) {
    return apiError(error);
  }
}
