import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./src/test/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.ga.test.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
});
