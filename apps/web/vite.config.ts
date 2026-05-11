import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@agent-workloops/api": fileURLToPath(new URL("../../packages/api/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.AWL_WEB_PORT ?? 5173),
    proxy: {
      "/api": process.env.VITE_AWL_API_PROXY_TARGET ?? "http://127.0.0.1:3210",
    },
  },
});
