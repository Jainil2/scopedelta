import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("client collaboration response policy", () => {
  it("applies private, no-index and no-referrer headers to pages and APIs", async () => {
    const rules = await nextConfig.headers!();
    for (const source of ["/client/:path*", "/api/v1/client/:path*"]) {
      const rule = rules.find((candidate) => candidate.source === source);
      expect(rule?.headers).toEqual(
        expect.arrayContaining([
          { key: "Cache-Control", value: "private, no-store" },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
        ]),
      );
    }
  });
});
