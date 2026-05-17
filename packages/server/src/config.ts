import path from "node:path";
import { z } from "zod";

export const DatabaseStoreKindValues = ["postgres", "mongodb", "unknown"] as const;
export const DatabaseStoreKindSchema = z.enum(DatabaseStoreKindValues);
export type DatabaseStoreKind = z.infer<typeof DatabaseStoreKindSchema>;

export const ServerConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).default(3210),
  publicBaseUrl: z.string().url().default("http://127.0.0.1:3210"),
  trustProxy: z.boolean().default(false),
  dataDir: z.string().min(1).default(path.join(process.cwd(), ".agent-workloops")),
  approval: z.object({
    forceRequired: z.boolean().default(false),
  }),
  locks: z.object({
    timeoutMs: z.number().int().min(1000).default(15 * 60 * 1000),
  }),
  cookies: z.object({
    secure: z.boolean().default(false),
    sameSite: z.enum(["strict", "lax", "none"]).default("lax"),
  }),
  session: z.object({
    ttlMs: z.number().int().min(1000).optional(),
  }),
  persistence: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("filesystem") }),
    z.object({ kind: z.literal("sql"), connectionString: z.string().min(1) }),
    z.object({
      kind: z.literal("mongodb"),
      connectionString: z.string().min(1),
      database: z.string().min(1).default("agent_workloops"),
    }),
  ]),
  workItems: z.object({
    store: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("memory") }),
      z.object({ kind: z.literal("file"), filePath: z.string().min(1) }),
      z.object({
        kind: z.literal("database"),
        databaseUrl: z.string().min(1),
        databaseKind: DatabaseStoreKindSchema.default("unknown"),
      }),
    ]),
    allowEphemeral: z.boolean().default(false),
    allowSingleNodeFile: z.boolean().default(false),
    requireCloudGrade: z.boolean().default(false),
  }),
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
  const persistenceKind = env.AWL_PERSISTENCE_KIND ?? env.DWL_PERSISTENCE_KIND ?? "filesystem";
  const workItemStoreKind = env.AWL_WORK_ITEM_STORE ?? "memory";
  const dataDir = env.AWL_DATA_DIR ?? env.DWL_DATA_DIR ?? path.join(process.cwd(), ".agent-workloops");
  const port = env.AWL_PORT ?? env.DWL_PORT;
  const lockTimeoutMs = env.AWL_LOCK_TIMEOUT_MS ?? env.DWL_LOCK_TIMEOUT_MS;
  const sessionTtlMs = env.AWL_SESSION_TTL_MS ?? env.DWL_SESSION_TTL_MS;
  return ServerConfigSchema.parse({
    host: env.AWL_HOST ?? env.DWL_HOST,
    port: port ? Number(port) : undefined,
    publicBaseUrl: env.AWL_PUBLIC_BASE_URL ?? env.DWL_PUBLIC_BASE_URL,
    trustProxy: parseBoolean(env.AWL_TRUST_PROXY ?? env.DWL_TRUST_PROXY),
    dataDir,
    approval: {
      forceRequired: (env.AWL_FORCE_APPROVAL_REQUIRED ?? env.DWL_FORCE_APPROVAL_REQUIRED) === "true",
    },
    locks: {
      timeoutMs: lockTimeoutMs ? Number(lockTimeoutMs) : undefined,
    },
    cookies: {
      secure: parseBoolean(env.AWL_COOKIE_SECURE ?? env.DWL_COOKIE_SECURE),
      sameSite: env.AWL_COOKIE_SAME_SITE ?? env.DWL_COOKIE_SAME_SITE,
    },
    session: {
      ttlMs: sessionTtlMs ? Number(sessionTtlMs) : undefined,
    },
    persistence:
      persistenceKind === "sql"
        ? { kind: "sql", connectionString: env.AWL_SQL_CONNECTION_STRING ?? env.DWL_SQL_CONNECTION_STRING }
        : persistenceKind === "mongodb"
          ? {
              kind: "mongodb",
              connectionString: env.AWL_MONGODB_CONNECTION_STRING ?? env.DWL_MONGODB_CONNECTION_STRING,
              database: env.AWL_MONGODB_DATABASE ?? env.DWL_MONGODB_DATABASE,
            }
          : { kind: "filesystem" },
    workItems: {
      store:
        workItemStoreKind === "file"
          ? { kind: "file", filePath: env.AWL_WORK_ITEM_STORE_FILE }
          : workItemStoreKind === "database"
            ? {
                kind: "database",
                databaseUrl: env.AWL_WORK_ITEM_STORE_DATABASE_URL,
                databaseKind: env.AWL_WORK_ITEM_STORE_DATABASE_KIND,
              }
            : workItemStoreKind === "memory"
              ? { kind: "memory" }
              : { kind: workItemStoreKind },
      allowEphemeral: parseBoolean(env.AWL_ALLOW_EPHEMERAL_WORK_ITEM_STORE),
      allowSingleNodeFile: parseBoolean(env.AWL_ALLOW_SINGLE_NODE_FILE_WORK_ITEM_STORE),
      requireCloudGrade: parseBoolean(env.AWL_REQUIRE_CLOUD_GRADE_WORK_ITEM_STORE),
    },
    bootstrapAdmin:
      (env.AWL_BOOTSTRAP_ADMIN_EMAIL ?? env.DWL_BOOTSTRAP_ADMIN_EMAIL) &&
      (env.AWL_BOOTSTRAP_ADMIN_PASSWORD ?? env.DWL_BOOTSTRAP_ADMIN_PASSWORD)
        ? {
            email: env.AWL_BOOTSTRAP_ADMIN_EMAIL ?? env.DWL_BOOTSTRAP_ADMIN_EMAIL,
            password: env.AWL_BOOTSTRAP_ADMIN_PASSWORD ?? env.DWL_BOOTSTRAP_ADMIN_PASSWORD,
            name: env.AWL_BOOTSTRAP_ADMIN_NAME ?? env.DWL_BOOTSTRAP_ADMIN_NAME,
          }
        : undefined,
    webDistDir: env.AWL_WEB_DIST_DIR ?? env.DWL_WEB_DIST_DIR,
  });
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === "true";
}
