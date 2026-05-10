import path from "node:path";
import { z } from "zod";

export const ServerConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).default(3210),
  publicBaseUrl: z.string().url().default("http://127.0.0.1:3210"),
  dataDir: z.string().min(1).default(path.join(process.cwd(), ".durable-workloops")),
  approval: z.object({
    forceRequired: z.boolean().default(false),
  }),
  locks: z.object({
    timeoutMs: z.number().int().min(1000).default(15 * 60 * 1000),
  }),
  persistence: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("filesystem") }),
    z.object({ kind: z.literal("sql"), connectionString: z.string().min(1) }),
    z.object({
      kind: z.literal("mongodb"),
      connectionString: z.string().min(1),
      database: z.string().min(1).default("durable_workloops"),
    }),
  ]),
  bootstrapAdmin: z
    .object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1).optional(),
    })
    .optional(),
  webDistDir: z.string().min(1).optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const persistenceKind = env.DWL_PERSISTENCE_KIND ?? "filesystem";
  const dataDir = env.DWL_DATA_DIR ?? path.join(process.cwd(), ".durable-workloops");
  return ServerConfigSchema.parse({
    host: env.DWL_HOST,
    port: env.DWL_PORT ? Number(env.DWL_PORT) : undefined,
    publicBaseUrl: env.DWL_PUBLIC_BASE_URL,
    dataDir,
    approval: {
      forceRequired: env.DWL_FORCE_APPROVAL_REQUIRED === "true",
    },
    locks: {
      timeoutMs: env.DWL_LOCK_TIMEOUT_MS ? Number(env.DWL_LOCK_TIMEOUT_MS) : undefined,
    },
    persistence:
      persistenceKind === "sql"
        ? { kind: "sql", connectionString: env.DWL_SQL_CONNECTION_STRING }
        : persistenceKind === "mongodb"
          ? {
              kind: "mongodb",
              connectionString: env.DWL_MONGODB_CONNECTION_STRING,
              database: env.DWL_MONGODB_DATABASE,
            }
          : { kind: "filesystem" },
    bootstrapAdmin:
      env.DWL_BOOTSTRAP_ADMIN_EMAIL && env.DWL_BOOTSTRAP_ADMIN_PASSWORD
        ? {
            email: env.DWL_BOOTSTRAP_ADMIN_EMAIL,
            password: env.DWL_BOOTSTRAP_ADMIN_PASSWORD,
            name: env.DWL_BOOTSTRAP_ADMIN_NAME,
          }
        : undefined,
    webDistDir: env.DWL_WEB_DIST_DIR,
  });
}
