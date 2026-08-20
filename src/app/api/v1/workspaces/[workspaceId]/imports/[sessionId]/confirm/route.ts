import { apiData, apiError, readJson } from "@/lib/api";
import { confirmImportSchema } from "@/lib/adoption-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { confirmImport } from "@/server/adoption";

type Context = {
  params: Promise<{ workspaceId: string; sessionId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, sessionId } = await params;
    const input = parseInput(confirmImportSchema, await readJson(request));
    return apiData(await confirmImport(actor, workspaceId, sessionId, input));
  } catch (error) {
    return apiError(error);
  }
}
