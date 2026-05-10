import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@durable-workloops/api": fileURLToPath(new URL("../api/src/index.ts", import.meta.url)),
    },
  },
});
