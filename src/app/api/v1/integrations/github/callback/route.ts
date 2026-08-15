import { apiError } from "@/lib/api";
import { getAppUrl } from "@/lib/env";
import { PlatformError } from "@/lib/platform-errors";
import { requireApiActor } from "@/server/api-auth";
import {
  completeGitHubRepositoryInstallation,
  continueGitHubRepositoryInstallation,
} from "@/server/engineering-delivery";

function requiredParameter(url: URL, name: string) {
  const value = url.searchParams.get(name);
  if (!value || value.length > 4_096) {
    throw new PlatformError(
      "validation_error",
      400,
      "The GitHub authorization response was not accepted.",
    );
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const actor = await requireApiActor(request);
    const url = new URL(request.url);
    const state = requiredParameter(url, "state");
    const code = url.searchParams.get("code");
    if (code) {
      if (code.length > 1_000) {
        throw new PlatformError(
          "validation_error",
          400,
          "The GitHub authorization response was not accepted.",
        );
      }
      const result = await completeGitHubRepositoryInstallation(
        actor,
        state,
        code,
      );
      const destination = new URL(result.returnPath, getAppUrl());
      destination.searchParams.set("github", "connected");
      return Response.redirect(destination, 303);
    }
    const installationId = requiredParameter(url, "installation_id");
    if (!/^\d{1,30}$/.test(installationId)) {
      throw new PlatformError(
        "validation_error",
        400,
        "The GitHub authorization response was not accepted.",
      );
    }
    return Response.redirect(
      await continueGitHubRepositoryInstallation(actor, state, installationId),
      302,
    );
  } catch (error) {
    return apiError(error);
  }
}
