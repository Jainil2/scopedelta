import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiActor: vi.fn(),
  downloadWorkspaceExportPart: vi.fn(),
}));

vi.mock("@/server/api-auth", () => ({
  requireApiActor: mocks.requireApiActor,
}));
vi.mock("@/server/workspace-export", () => ({
  downloadWorkspaceExportPart: mocks.downloadWorkspaceExportPart,
}));

import { POST } from "./route";

describe("workspace export part route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiActor.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      email: "owner@example.test",
    });
  });

  it("returns a bounded SHA-256 Content-Digest header that verifies the response body", async () => {
    const artifact = Buffer.alloc(512 * 1024, 0xa5);
    const sha256 = createHash("sha256").update(artifact).digest("hex");
    mocks.downloadWorkspaceExportPart.mockResolvedValue({
      artifact,
      sha256,
      byteSize: artifact.length,
    });

    const response = await POST(
      new Request("http://localhost/api/export-part", { method: "POST" }),
      {
        params: Promise.resolve({
          workspaceId: "00000000-0000-4000-8000-000000000002",
          exportId: "00000000-0000-4000-8000-000000000003",
          partNumber: "1",
        }),
      },
    );
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Digest")).toBe(
      `sha-256=:${createHash("sha256").update(body).digest("base64")}:`,
    );
    expect(response.headers.get("Content-Digest")!.length).toBeLessThan(100);
    expect(response.headers.get("Digest")).toBeNull();
    expect(response.headers.get("X-ScopeDelta-Part-SHA256")).toBe(sha256);
    expect(body.equals(artifact)).toBe(true);
  });
});
