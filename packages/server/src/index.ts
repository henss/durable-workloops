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
export type { ServerConfig, DatabaseStoreKind } from "./config.js";
export { FilesystemAuthStore, FilesystemPlanStore } from "./filesystem-store.js";
export { assertHostedRuntimeSafety, validateHostedRuntimeSafety } from "./hosted-runtime-guard.js";
export type { AuthStore, PlanStore } from "./store.js";
export {
  FileWorkItemStore,
  InMemoryWorkItemStore,
  createConfiguredWorkItemStore,
} from "./work-item-store.js";
export type { WorkItemStore } from "./work-item-store.js";
export {
  DatabaseWorkItemStore,
  InMemoryWorkItemPersistenceAdapter,
  WorkItemPersistenceAdapterNotImplementedError,
  WorkItemPersistenceConflict,
  WorkItemPersistenceNotFound,
  createDatabaseWorkItemStore,
} from "./database-work-item-store.js";
export type {
  CreateDatabaseWorkItemStoreOptions,
  PersistedWorkItem,
  WorkItemPersistenceAdapter,
} from "./database-work-item-store.js";
export {
  PostgresWorkItemPersistenceAdapter,
  defaultPostgresExecutorFactory,
  postgresExecutorFromClient,
} from "./postgres-work-item-store.js";
export type { PostgresExecutor } from "./postgres-work-item-store.js";
export { PostgresWorkItemAuditStore } from "./postgres-work-item-audit-store.js";
export {
  InMemoryWorkItemAuditStore,
  RecordingWorkItemStore,
  createConfiguredWorkItemAuditStore,
} from "./work-item-audit-store.js";
export type {
  CreateConfiguredWorkItemAuditStoreOptions,
  WorkItemAuditEventInput,
  WorkItemAuditFilter,
  WorkItemAuditStore,
} from "./work-item-audit-store.js";
