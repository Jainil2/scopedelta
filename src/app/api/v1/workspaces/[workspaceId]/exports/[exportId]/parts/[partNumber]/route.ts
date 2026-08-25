import { apiError } from "@/lib/api";
import { PlatformError } from "@/lib/platform-errors";
import { requireApiActor } from "@/server/api-auth";
import { downloadWorkspaceExportPart } from "@/server/workspace-export";

type Context = {
  params: Promise<{
    workspaceId: string;
    exportId: string;
    partNumber: string;
  }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, exportId, partNumber: rawPartNumber } = await params;
    const partNumber = Number(rawPartNumber);
    if (!Number.isSafeInteger(partNumber) || partNumber < 1) {
      throw new PlatformError(
        "export_part_invalid",
        400,
        "Choose a valid export part.",
      );
    }
    const result = await downloadWorkspaceExportPart(
      actor,
      workspaceId,
      exportId,
      partNumber,
    );
    return new Response(new Uint8Array(result.artifact), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="scopedelta-${exportId}-part-${partNumber}.tar.gz"`,
        "Content-Length": String(result.byteSize),
        Digest: `sha-256=:${result.artifact.toString("base64")}:`,
        "X-ScopeDelta-Part-SHA256": result.sha256,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-ScopeDelta-Export-Scope":
          "operational-open-format-not-legal-archive",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
