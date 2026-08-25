import { apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { getWorkspaceExport } from "@/server/workspace-export";

type Context = { params: Promise<{ workspaceId: string; exportId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, exportId } = await params;
    const result = await getWorkspaceExport(actor, workspaceId, exportId);
    return Response.json(
      { data: result },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
