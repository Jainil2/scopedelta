import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { getClientProjectProjection } from "@/server/client-collaboration";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { projectId } = await params;
    return apiData(await getClientProjectProjection(actor, projectId));
  } catch (error) {
    return apiError(error);
  }
}
