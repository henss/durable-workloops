import type { ServerConfig } from "./config.js";
import type { PlanStore } from "./store.js";

export async function createMongoPlanStore(config: ServerConfig): Promise<PlanStore> {
  void config;
  throw new Error(
    "MongoDB persistence is configured but not initialized in this build. Use filesystem persistence or provide the MongoDB adapter package.",
  );
}
