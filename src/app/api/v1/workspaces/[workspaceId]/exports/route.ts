import { apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { createWorkspaceExport } from "@/server/workspace-export";

type Context = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const result = await createWorkspaceExport(actor, workspaceId);
    return Response.json(
      { data: result },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
