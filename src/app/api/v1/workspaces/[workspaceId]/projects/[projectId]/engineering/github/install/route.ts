import { apiError } from "@/lib/api";
import { githubRepositoryInstallSchema } from "@/lib/engineering-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createGitHubRepositoryInstallationUrl } from "@/server/engineering-delivery";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const url = new URL(request.url);
    const input = parseInput(githubRepositoryInstallSchema, {
      repositoryFullName: url.searchParams.get("repositoryFullName"),
    });
    return Response.redirect(
      await createGitHubRepositoryInstallationUrl(
        actor,
        workspaceId,
        projectId,
        input.repositoryFullName,
      ),
      302,
    );
  } catch (error) {
    return apiError(error);
  }
}
