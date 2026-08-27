import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "desktop"),
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: resolve(__dirname, "desktop-dist"),
    emptyOutDir: true,
  },
});
