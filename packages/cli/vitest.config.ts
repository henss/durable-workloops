import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@durable-workloops/api": fileURLToPath(new URL("../api/src/index.ts", import.meta.url)),
      "durable-workloops/launcher": fileURLToPath(new URL("../../src/launcher.ts", import.meta.url)),
      "durable-workloops/selection": fileURLToPath(new URL("../../src/selection.ts", import.meta.url)),
    },
  },
});
