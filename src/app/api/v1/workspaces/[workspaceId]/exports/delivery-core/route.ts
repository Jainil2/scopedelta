import { apiError } from "@/lib/api";
import { deliveryExportFilterSchema } from "@/lib/adoption-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { exportDeliveryCore } from "@/server/adoption";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const filters = parseInput(
      deliveryExportFilterSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const result = await exportDeliveryCore(actor, workspaceId, filters);
    return new Response(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-ScopeDelta-Export-Scope": "core-delivery-not-legal-audit",
        "X-ScopeDelta-Export-Page": String(result.page),
        "X-ScopeDelta-Export-Has-More": String(result.hasNextPage),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
