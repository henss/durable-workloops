import { buildServer } from "./app.js";
import { loadServerConfig } from "./config.js";
import { assertHostedRuntimeSafety } from "./hosted-runtime-guard.js";

assertHostedRuntimeSafety(process.env);
const config = loadServerConfig();
const app = await buildServer({ config });

await app.listen({ host: config.host, port: config.port });
app.log.info(`Agent Workloops server listening on ${config.publicBaseUrl}`);

export { buildServer } from "./app.js";
export { loadServerConfig } from "./config.js";
export { FilesystemAuthStore, FilesystemPlanStore } from "./filesystem-store.js";
export { assertHostedRuntimeSafety, validateHostedRuntimeSafety } from "./hosted-runtime-guard.js";
export type { AuthStore, PlanStore } from "./store.js";
