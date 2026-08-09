import { apiData, apiError, readJson } from "@/lib/api";
import {
  commercialRequestFiltersSchema,
  createCommercialRequestSchema,
} from "@/lib/commercial-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import {
  createCommercialRequest,
  listCommercialRequests,
} from "@/server/commercial-change-control";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const url = new URL(request.url);
    const filters = parseInput(
      commercialRequestFiltersSchema,
      Object.fromEntries(url.searchParams),
    );
    return apiData(
      await listCommercialRequests(actor, workspaceId, projectId, filters),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      createCommercialRequestSchema,
      await readJson(request, 65_536),
    );
    return apiData(
      await createCommercialRequest(actor, workspaceId, projectId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
