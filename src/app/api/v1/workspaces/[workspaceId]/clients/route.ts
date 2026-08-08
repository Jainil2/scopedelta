import { apiData, apiError, readJson } from "@/lib/api";
import {
  createClientSchema,
  paginationSchema,
} from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { createClient, listClients } from "@/server/delivery";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const pagination = parseInput(
      paginationSchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return apiData(
      await listClients(
        actor,
        workspaceId,
        pagination.page,
        pagination.pageSize,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId } = await params;
    const input = parseInput(createClientSchema, await readJson(request));
    return apiData(await createClient(actor, workspaceId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
