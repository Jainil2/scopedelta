export class PlatformError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const notFound = () =>
  new PlatformError("not_found", 404, "The requested resource was not found.");

export const forbidden = () =>
  new PlatformError(
    "forbidden",
    403,
    "You do not have permission to perform this action.",
  );
