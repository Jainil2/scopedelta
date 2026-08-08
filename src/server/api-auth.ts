import { PlatformError } from "@/lib/platform-errors";
import { getAuth } from "@/lib/auth";
import { getAppUrl } from "@/lib/env";

export async function requireApiActor(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    requireSameOrigin(request);
  }
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    throw new PlatformError("unauthenticated", 401, "Sign in to continue.");
  }
  if (!session.user.emailVerified) {
    throw new PlatformError(
      "email_unverified",
      403,
      "Verify your email address to continue.",
    );
  }
  return { userId: session.user.id, email: session.user.email };
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(getAppUrl()).origin) {
    throw new PlatformError(
      "invalid_origin",
      403,
      "The request origin was not accepted.",
    );
  }
}
