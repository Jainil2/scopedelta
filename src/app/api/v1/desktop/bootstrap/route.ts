import { apiError } from "@/lib/api";
import { getAppUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = Response.json({
      product: "scopedelta",
      protocolVersion: 1,
      canonicalOrigin: new URL(getAppUrl()).origin,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return apiError(error);
  }
}
