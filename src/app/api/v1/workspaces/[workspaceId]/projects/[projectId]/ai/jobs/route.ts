import { after } from "next/server";

import { apiData, apiError, readJson } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { createAiJob, listAiJobs, runAiJob } from "@/server/ai/jobs";

type Context = { params: Promise<{ workspaceId: string; projectId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    return apiData(await listAiJobs(actor, workspaceId, projectId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const job = await createAiJob(
      actor,
      workspaceId,
      projectId,
      await readJson(request),
    );
    after(() => runAiJob(job.id));
    return apiData(job, 202);
  } catch (error) {
    return apiError(error);
  }
}
