import { apiData, apiError } from "@/lib/api";
import { requireApiActor } from "@/server/api-auth";
import { listClientProjects } from "@/server/client-collaboration";

export async function GET(request: Request) {
  try {
    return apiData(await listClientProjects(await requireApiActor(request)));
  } catch (error) {
    return apiError(error);
  }
}
