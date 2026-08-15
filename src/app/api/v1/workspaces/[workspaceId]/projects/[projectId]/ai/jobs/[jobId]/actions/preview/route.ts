import { apiData, apiError, readJson } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { previewAiActions } from "@/server/ai/jobs";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string; jobId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, jobId } = await params;
    return apiData(
      await previewAiActions(
        actor,
        workspaceId,
        projectId,
        jobId,
        await readJson(request),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
