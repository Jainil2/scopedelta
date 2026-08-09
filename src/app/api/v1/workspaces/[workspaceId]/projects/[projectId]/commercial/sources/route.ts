import { apiData, apiError, readJson } from "@/lib/api";
import {
  createCommercialSourceSchema,
  MAX_COMMERCIAL_SOURCE_BYTES,
} from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createCommercialSource } from "@/server/commercial";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      createCommercialSourceSchema,
      await readJson(
        request,
        Math.ceil((MAX_COMMERCIAL_SOURCE_BYTES * 4) / 3) + 4096,
      ),
    );
    return apiData(
      await createCommercialSource(actor, workspaceId, projectId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
