import { apiData, apiError } from "@/lib/api";
import { importRowPaginationSchema } from "@/lib/adoption-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { getImportSession } from "@/server/adoption";

type Context = {
  params: Promise<{ workspaceId: string; sessionId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, sessionId } = await params;
    const filters = parseInput(
      importRowPaginationSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(
      await getImportSession(
        actor,
        workspaceId,
        sessionId,
        filters.page,
        filters.pageSize,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
