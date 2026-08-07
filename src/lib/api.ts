import { PlatformError } from "@/lib/platform-errors";

export function apiData<T>(data: T, status = 200) {
  return Response.json({ data }, { status });
}

export function apiError(error: unknown) {
  if (error instanceof PlatformError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          fieldErrors: error.fieldErrors,
        },
      },
      { status: error.status },
    );
  }

  console.error("platform_api_unavailable");
  return Response.json(
    {
      error: {
        code: "platform_unavailable",
        message: "The platform is temporarily unavailable.",
      },
    },
    { status: 503 },
  );
}

export async function readJson(request: Request, maximumBytes = 16_384) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > maximumBytes) {
    throw new PlatformError(
      "payload_too_large",
      413,
      "The request body is too large.",
    );
  }

  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > maximumBytes) {
    throw new PlatformError(
      "payload_too_large",
      413,
      "The request body is too large.",
    );
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new PlatformError(
      "validation_error",
      400,
      "Check the submitted fields and try again.",
    );
  }
}
