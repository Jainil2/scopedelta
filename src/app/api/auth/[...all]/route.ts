import { getAuth } from "@/lib/auth";

async function handler(request: Request) {
  try {
    return await getAuth().handler(request);
  } catch {
    console.error("platform_auth_unavailable");
    return Response.json(
      {
        error: {
          code: "platform_unavailable",
          message: "Account services are temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}

export const GET = handler;
export const POST = handler;
