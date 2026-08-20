import { apiData, apiError, readJson } from "@/lib/api";
import { importPreviewSchema } from "@/lib/adoption-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createImportPreview } from "@/server/adoption";

type Context = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const input = parseInput(
      importPreviewSchema,
      await readJson(request, 7 * 1024 * 1024),
    );
    return apiData(await createImportPreview(actor, workspaceId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
