import { after } from "next/server";

import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { retryAiJob, runAiJob } from "@/server/ai/jobs";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string; jobId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, jobId } = await params;
    const job = await retryAiJob(actor, workspaceId, projectId, jobId);
    after(() => runAiJob(job.id));
    return apiData(job, 202);
  } catch (error) {
    return apiError(error);
  }
}
