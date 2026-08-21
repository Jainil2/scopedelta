import { apiData, apiError } from "@/lib/api";
import { adoptionPaginationSchema } from "@/lib/adoption-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { listImportSessions } from "@/server/adoption";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const filters = parseInput(
      adoptionPaginationSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(
      await listImportSessions(
        actor,
        workspaceId,
        filters.page,
        filters.pageSize,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
