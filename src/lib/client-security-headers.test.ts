import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("private surface response policy", () => {
  it("applies the complete private response policy to authenticated, client, invitation, and recovery surfaces", async () => {
    const rules = await nextConfig.headers!();
    for (const source of [
      "/app/:path*",
      "/client/:path*",
      "/api/v1/:path*",
      "/invitations/:path*",
      "/forgot-password",
      "/reset-password",
      "/verification-status",
      "/sign-in",
      "/sign-up",
    ]) {
      const rule = rules.find((candidate) => candidate.source === source);
      expect(rule?.headers).toEqual(
        expect.arrayContaining([
          { key: "Cache-Control", value: "private, no-store" },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ]),
      );
    }
  });
});
