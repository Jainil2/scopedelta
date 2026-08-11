import { cookies } from "next/headers";

import { apiData, apiError } from "@/lib/api";
import { PlatformError } from "@/lib/platform-errors";
import { requireApiActor } from "@/server/api-auth";
import { acceptClientInvitation } from "@/server/client-collaboration";

export async function POST(request: Request) {
  try {
    const actor = await requireApiActor(request);
    const cookieStore = await cookies();
    const token = cookieStore.get("scopedelta_client_invitation")?.value;
    if (!token) {
      throw new PlatformError(
        "client_invitation_invalid",
        400,
        "This client invitation is invalid or has expired.",
      );
    }
    const result = await acceptClientInvitation(actor, token);
    cookieStore.set("scopedelta_client_invitation", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/client/invitations/accept",
      maxAge: 0,
    });
    return apiData(result);
  } catch (error) {
    return apiError(error);
  }
}
