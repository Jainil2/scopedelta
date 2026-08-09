import { apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { downloadCommercialSource } from "@/server/commercial";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string; sourceId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId, sourceId } = await params;
    const source = await downloadCommercialSource(
      actor,
      workspaceId,
      projectId,
      sourceId,
    );
    return new Response(new Uint8Array(source.content), {
      headers: {
        "Content-Type": source.mediaType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(source.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
