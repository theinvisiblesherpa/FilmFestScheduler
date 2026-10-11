import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const appRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    fs: {
      allow: [resolve(appRoot, "..")],
    },
  },
  build: {
    outDir: resolve(appRoot, "dist"),
  },
});