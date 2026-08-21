import { apiData, apiError, readJson } from "@/lib/api";
import { createProjectTemplateSchema } from "@/lib/adoption-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createProjectTemplate, listProjectTemplates } from "@/server/adoption";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const includeArchived =
      new URL(request.url).searchParams.get("includeArchived") === "true";
    return apiData(
      await listProjectTemplates(actor, workspaceId, { includeArchived }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const input = parseInput(
      createProjectTemplateSchema,
      await readJson(request, 256 * 1024),
    );
    return apiData(await createProjectTemplate(actor, workspaceId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
