import type { ServerConfig } from "./config.js";
import type { PlanStore } from "./store.js";

export async function createSqlPlanStore(config: ServerConfig): Promise<PlanStore> {
  void config;
  throw new Error(
    "SQL persistence is configured but not initialized in this build. Use filesystem persistence or provide the Drizzle/Supabase adapter package.",
  );
}
