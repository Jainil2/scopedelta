import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const apiRoot = join(process.cwd(), "src/app/api/v1");
const explicitlyReviewedBoundaries = new Map([
  ["billing/paddle/webhook/route.ts", "verifyPaddleWebhook"],
  ["integrations/github/webhook/route.ts", "verifyGitHubWebhookSignature"],
]);

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? routeFiles(path)
      : entry.name === "route.ts"
        ? [path]
        : [];
  });
}

describe("API mutation route contract", () => {
  it("uses the session/same-origin boundary or an explicitly reviewed signed-provider boundary", () => {
    const mutations = routeFiles(apiRoot).filter((file) =>
      /export async function (POST|PUT|PATCH|DELETE)\b/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(mutations.length).toBeGreaterThan(0);
    for (const file of mutations) {
      const source = readFileSync(file, "utf8");
      const path = relative(apiRoot, file);
      const reviewedBoundary = explicitlyReviewedBoundaries.get(path);
      const reviewedInvitationBoundary =
        source.includes("requireSameOrigin(") &&
        source.includes("verify") &&
        source.includes("InvitationToken(");
      expect(
        source.includes("requireApiActor(") ||
          reviewedInvitationBoundary ||
          Boolean(reviewedBoundary && source.includes(reviewedBoundary)),
        `${path} has no reviewed mutation boundary`,
      ).toBe(true);
    }
  });
});
