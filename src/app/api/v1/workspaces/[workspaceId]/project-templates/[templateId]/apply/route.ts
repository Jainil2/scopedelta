import { apiData, apiError, readJson } from "@/lib/api";
import { applyProjectTemplateSchema } from "@/lib/adoption-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { applyProjectTemplate } from "@/server/adoption";

type Context = {
  params: Promise<{ workspaceId: string; templateId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, templateId } = await params;
    const body = await readJson(request, 64 * 1024);
    const input = parseInput(applyProjectTemplateSchema, {
      ...(typeof body === "object" && body ? body : {}),
      templateId,
    });
    return apiData(await applyProjectTemplate(actor, workspaceId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
