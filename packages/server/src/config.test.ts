import { describe, expect, it } from "vitest";
import { loadServerConfig } from "./config.js";

describe("server config", () => {
  it("loads production hosting settings from AWL environment variables", () => {
    const config = loadServerConfig({
      AWL_HOST: "0.0.0.0",
      AWL_PORT: "3210",
      AWL_PUBLIC_BASE_URL: "https://agent-workloops.internal.example.com",
      AWL_TRUST_PROXY: "true",
      AWL_COOKIE_SECURE: "true",
      AWL_COOKIE_SAME_SITE: "strict",
      AWL_SESSION_TTL_MS: "3600000",
      AWL_FORCE_APPROVAL_REQUIRED: "true",
      AWL_PERSISTENCE_KIND: "mongodb",
      AWL_MONGODB_CONNECTION_STRING: "mongodb://example.invalid:27017",
      AWL_MONGODB_DATABASE: "agent_workloops",
      AWL_WEB_DIST_DIR: "/app/apps/web/dist",
    });

    expect(config).toMatchObject({
      host: "0.0.0.0",
      port: 3210,
      publicBaseUrl: "https://agent-workloops.internal.example.com",
      trustProxy: true,
      approval: { forceRequired: true },
      cookies: { secure: true, sameSite: "strict" },
      session: { ttlMs: 3_600_000 },
      persistence: {
        kind: "mongodb",
        connectionString: "mongodb://example.invalid:27017",
        database: "agent_workloops",
      },
      webDistDir: "/app/apps/web/dist",
    });
  });

  it("parses the database work item store profile and cloud-grade flags", () => {
    const config = loadServerConfig({
      AWL_WORK_ITEM_STORE: "database",
      AWL_WORK_ITEM_STORE_DATABASE_URL: "redacted://example.invalid/awl",
      AWL_WORK_ITEM_STORE_DATABASE_KIND: "postgres",
      AWL_REQUIRE_CLOUD_GRADE_WORK_ITEM_STORE: "true",
      AWL_ALLOW_SINGLE_NODE_FILE_WORK_ITEM_STORE: "false",
    });

    expect(config.workItems).toMatchObject({
      store: {
        kind: "database",
        databaseUrl: "redacted://example.invalid/awl",
        databaseKind: "postgres",
      },
      requireCloudGrade: true,
      allowSingleNodeFile: false,
    });
  });

  it("defaults cloud-grade flags to false when unset", () => {
    const config = loadServerConfig({});

    expect(config.workItems).toMatchObject({
      store: { kind: "memory" },
      allowEphemeral: false,
      allowSingleNodeFile: false,
      requireCloudGrade: false,
    });
  });
});
