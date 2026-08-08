import { apiData, apiError, readJson } from "@/lib/api";
import {
  createWorkItemSchema,
  workItemFilterSchema,
} from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createWorkItem, listWorkItems } from "@/server/delivery";

type Context = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const filters = parseInput(
      workItemFilterSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(await listWorkItems(actor, workspaceId, projectId, filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, projectId } = await params;
    const input = parseInput(
      createWorkItemSchema,
      await readJson(request, 65_536),
    );
    return apiData(
      await createWorkItem(actor, workspaceId, projectId, input),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
