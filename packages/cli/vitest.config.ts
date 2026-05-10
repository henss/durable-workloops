import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@agent-workloops/api": fileURLToPath(new URL("../api/src/index.ts", import.meta.url)),
      "agent-workloops/launcher": fileURLToPath(new URL("../../src/launcher.ts", import.meta.url)),
      "agent-workloops/selection": fileURLToPath(new URL("../../src/selection.ts", import.meta.url)),
    },
  },
});
