import { apiData, apiError, readJson } from "@/lib/api";
import { updateClientSchema } from "@/lib/delivery-validation";
import { parseInput } from "@/lib/platform-validation";
import { requireApiActor } from "@/server/api-auth";
import { getClient, updateClient } from "@/server/delivery";

type Context = {
  params: Promise<{ workspaceId: string; clientId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, clientId } = await params;
    return apiData(await getClient(actor, workspaceId, clientId));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireApiActor(request);
    const { workspaceId, clientId } = await params;
    const input = parseInput(updateClientSchema, await readJson(request));
    return apiData(await updateClient(actor, workspaceId, clientId, input));
  } catch (error) {
    return apiError(error);
  }
}
