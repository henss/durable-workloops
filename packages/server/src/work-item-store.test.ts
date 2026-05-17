import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CreateWorkItemRequest } from "@agent-workloops/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerConfig } from "./config.js";
import {
  FileWorkItemStore,
  InMemoryWorkItemStore,
  createConfiguredWorkItemStore,
} from "./work-item-store.js";
import { WorkItemPersistenceAdapterNotImplementedError } from "./database-work-item-store.js";

describe("work item stores", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "awl-work-items-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("keeps the memory store available for local test mode", async () => {
    const store = new InMemoryWorkItemStore();
    await store.create(workItemInput("wi-memory"));
    await store.markReady("wi-memory");

    expect(await store.get("wi-memory")).toMatchObject({ id: "wi-memory", status: "ready" });
  });

  it("persists file-backed work items across store re-instantiation", async () => {
    const filePath = path.join(dataDir, "work-items.json");
    const firstStore = new FileWorkItemStore(filePath);
    await firstStore.create(workItemInput("wi-file"));
    await firstStore.markReady("wi-file");

    const secondStore = new FileWorkItemStore(filePath);
    expect(await secondStore.get("wi-file")).toMatchObject({ id: "wi-file", status: "ready" });
  });

  it("fails closed when the file-backed store is corrupt", async () => {
    const filePath = path.join(dataDir, "work-items.json");
    await fs.writeFile(filePath, "not-json-sensitive-looking-content", "utf8");
    const store = new FileWorkItemStore(filePath);

    await expect(store.list()).rejects.toThrow("work item store file is corrupt or invalid");
  });
});

describe("work item store selection", () => {
  it("returns the memory store for memory config in non-cloud-grade mode", () => {
    const store = createConfiguredWorkItemStore(
      buildConfig({ kind: "memory" }, { requireCloudGrade: false }),
    );
    expect(store).toBeInstanceOf(InMemoryWorkItemStore);
  });

  it("returns the file store for file config in non-cloud-grade mode", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "awl-select-file-"));
    try {
      const store = createConfiguredWorkItemStore(
        buildConfig(
          { kind: "file", filePath: path.join(dir, "work-items.json") },
          { requireCloudGrade: false },
        ),
      );
      expect(store).toBeInstanceOf(FileWorkItemStore);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects memory store when cloud-grade is required", () => {
    expect(() =>
      createConfiguredWorkItemStore(
        buildConfig({ kind: "memory" }, { requireCloudGrade: true }),
      ),
    ).toThrow(/cloud-grade/);
  });

  it("rejects file store when cloud-grade is required", () => {
    expect(() =>
      createConfiguredWorkItemStore(
        buildConfig(
          { kind: "file", filePath: "/tmp/awl-test/work-items.json" },
          { requireCloudGrade: true },
        ),
      ),
    ).toThrow(/cloud-grade/);
  });

  it("fails closed with adapter-not-implemented for database store", () => {
    expect(() =>
      createConfiguredWorkItemStore(
        buildConfig(
          {
            kind: "database",
            databaseUrl: "redacted://example.invalid/awl",
            databaseKind: "unknown",
          },
          { requireCloudGrade: true },
        ),
      ),
    ).toThrow(WorkItemPersistenceAdapterNotImplementedError);
  });
});

function buildConfig(
  store: ServerConfig["workItems"]["store"],
  flags: { requireCloudGrade?: boolean; allowSingleNodeFile?: boolean; allowEphemeral?: boolean } = {},
): ServerConfig {
  return {
    host: "127.0.0.1",
    port: 3210,
    publicBaseUrl: "http://127.0.0.1:3210",
    trustProxy: false,
    dataDir: "/tmp/agent-workloops-test",
    approval: { forceRequired: false },
    locks: { timeoutMs: 60_000 },
    cookies: { secure: false, sameSite: "lax" },
    session: {},
    persistence: { kind: "filesystem" },
    workItems: {
      store,
      allowEphemeral: flags.allowEphemeral ?? true,
      allowSingleNodeFile: flags.allowSingleNodeFile ?? false,
      requireCloudGrade: flags.requireCloudGrade ?? false,
    },
  };
}

function workItemInput(id: string): CreateWorkItemRequest {
  return {
    id,
    created_by: "operator-example",
    target_repo: "example-service",
    title: "Plan a safe coordination change",
    objective: "Create a synthetic planning-only outcome.",
    priority: "normal",
    trust_zone: "B_cloud_private" as const,
    job_class: "planning_only" as const,
    authority_class: "planning_only",
    required_capabilities: ["planning_packet"],
    payload_ref: "artifact://example/input",
    redaction_policy: "public_safe_no_sensitive_payloads",
    idempotency_key: `${id}-key`,
  };
}
