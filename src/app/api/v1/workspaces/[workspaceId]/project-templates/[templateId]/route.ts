import { apiData, apiError, readJson } from "@/lib/api";
import { updateProjectTemplateSchema } from "@/lib/adoption-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  archiveProjectTemplate,
  getProjectTemplate,
  updateProjectTemplate,
} from "@/server/adoption";

type Context = {
  params: Promise<{ workspaceId: string; templateId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, templateId } = await params;
    return apiData(await getProjectTemplate(actor, workspaceId, templateId));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, templateId } = await params;
    const input = parseInput(
      updateProjectTemplateSchema,
      await readJson(request, 256 * 1024),
    );
    return apiData(
      await updateProjectTemplate(actor, workspaceId, templateId, input),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, templateId } = await params;
    return apiData(
      await archiveProjectTemplate(actor, workspaceId, templateId),
    );
  } catch (error) {
    return apiError(error);
  }
}
