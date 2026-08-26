import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  decodeDesktopNotificationCursor,
  encodeDesktopNotificationCursor,
} from "@/server/desktop";

describe("desktop notification cursor", () => {
  beforeEach(() => {
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "desktop-cursor-test-secret-at-least-32-characters",
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("round-trips an opaque source watermark", () => {
    const cursor = {
      version: 1 as const,
      sources: {
        workspace: {
          createdAt: "2026-08-26T10:00:00.000Z",
          id: "11111111-1111-4111-8111-111111111111",
        },
        clientInternal: null,
        clientPortal: null,
      },
    };

    const encoded = encodeDesktopNotificationCursor(cursor);

    expect(encoded).not.toContain("2026-08-26");
    expect(Buffer.from(encoded, "base64url").toString("utf8")).not.toContain(
      "workspace",
    );
    expect(decodeDesktopNotificationCursor(encoded)).toEqual(cursor);

    const tampered = `${encoded.slice(0, -1)}${encoded.endsWith("A") ? "B" : "A"}`;
    expect(() => decodeDesktopNotificationCursor(tampered)).toThrow(
      "The desktop cursor is invalid.",
    );
  });

  it.each(["", "not-json", "e30", "a".repeat(2049)])(
    "rejects malformed cursor %j",
    (cursor) => {
      expect(() => decodeDesktopNotificationCursor(cursor)).toThrow(
        "The desktop cursor is invalid.",
      );
    },
  );
});
