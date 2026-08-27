// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformError } from "@/lib/platform-errors";

const mocks = vi.hoisted(() => ({
  requireApiActor: vi.fn(),
  listDesktopNotifications: vi.fn(),
}));

vi.mock("@/server/api-auth", () => ({
  requireApiActor: mocks.requireApiActor,
}));
vi.mock("@/server/desktop", () => ({
  listDesktopNotifications: mocks.listDesktopNotifications,
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/desktop/notifications", () => {
  it("requires an authenticated verified session", async () => {
    mocks.requireApiActor.mockRejectedValue(
      new PlatformError("unauthenticated", 401, "Sign in to continue."),
    );

    const response = await GET(
      new Request("https://app.example.test/api/v1/desktop/notifications"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "unauthenticated" },
    });
    expect(mocks.listDesktopNotifications).not.toHaveBeenCalled();
  });

  it("bounds the feed query and returns the opaque cursor payload", async () => {
    const actor = { userId: "user-id", email: "person@example.test" };
    const feed = { events: [], cursor: "opaque", hasMore: false };
    mocks.requireApiActor.mockResolvedValue(actor);
    mocks.listDesktopNotifications.mockResolvedValue(feed);

    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/desktop/notifications?cursor=previous&limit=25",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.listDesktopNotifications).toHaveBeenCalledWith(
      actor,
      "previous",
      25,
    );
    expect(await response.json()).toEqual({ data: feed });
  });

  it("rejects limits outside the bounded contract", async () => {
    mocks.requireApiActor.mockResolvedValue({
      userId: "user-id",
      email: "person@example.test",
    });

    const response = await GET(
      new Request(
        "https://app.example.test/api/v1/desktop/notifications?limit=101",
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.listDesktopNotifications).not.toHaveBeenCalled();
  });
});
