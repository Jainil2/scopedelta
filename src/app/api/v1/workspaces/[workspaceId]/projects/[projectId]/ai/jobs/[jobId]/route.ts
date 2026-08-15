import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { getAiJob } from "@/server/ai/jobs";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string; jobId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, jobId } = await params;
    return apiData(await getAiJob(actor, workspaceId, projectId, jobId));
  } catch (error) {
    return apiError(error);
  }
}
