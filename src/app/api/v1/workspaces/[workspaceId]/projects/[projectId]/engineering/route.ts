import { apiData, apiError, readJson } from "@/lib/api";
import { connectGitHubRepositorySchema } from "@/lib/engineering-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  connectGitHubRepository,
  listEngineeringWorkspace,
} from "@/server/engineering-delivery";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    return apiData(
      await listEngineeringWorkspace(actor, workspaceId, projectId),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      connectGitHubRepositorySchema,
      await readJson(request),
    );
    return apiData(
      await connectGitHubRepository(actor, workspaceId, projectId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
