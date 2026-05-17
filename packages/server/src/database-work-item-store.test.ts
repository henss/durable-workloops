import type { CreateWorkItemRequest } from "@agent-workloops/api";
import { describe, expect, it } from "vitest";
import {
  DatabaseWorkItemStore,
  InMemoryWorkItemPersistenceAdapter,
  WorkItemPersistenceAdapterNotImplementedError,
  WorkItemPersistenceConflict,
  type PersistedWorkItem,
  type WorkItemPersistenceAdapter,
  createDatabaseWorkItemStore,
} from "./database-work-item-store.js";
import { createConfiguredWorkItemStore } from "./work-item-store.js";

describe("database work item store adapter contract", () => {
  it("creates a work item and is idempotent on the idempotency key", async () => {
    const adapter = new InMemoryWorkItemPersistenceAdapter();
    const store = new DatabaseWorkItemStore(adapter);

    const created = await store.create(workItemInput("wi-db-1"));
    expect(created.status).toBe("proposed");

    const duplicate = await store.create(workItemInput("wi-db-1"));
    expect(duplicate.id).toBe(created.id);
    expect(duplicate.created_at).toBe(created.created_at);

    const all = await store.list();
    expect(all).toHaveLength(1);
  });

  it("rejects two creates with the same id when idempotency keys differ", async () => {
    const adapter = new InMemoryWorkItemPersistenceAdapter();
    const store = new DatabaseWorkItemStore(adapter);
    await store.create(workItemInput("wi-db-id-collision"));

    await expect(
      store.create({
        ...workItemInput("wi-db-id-collision"),
        idempotency_key: "wi-db-id-collision-other-key",
      }),
    ).rejects.toThrow("work item already exists");
  });

  it("allows exactly one active claim and rejects a racing second claim", async () => {
    const adapter = new InMemoryWorkItemPersistenceAdapter();
    const store = new DatabaseWorkItemStore(adapter);
    await store.create(workItemInput("wi-db-claim"));
    await store.markReady("wi-db-claim");

    const first = await store.claim("wi-db-claim", {
      claimant: "runner-a",
      lease_id: "lease-a",
      leaseTimeoutMs: 60_000,
    });
    expect(first.status).toBe("claimed");

    await expect(
      store.claim("wi-db-claim", {
        claimant: "runner-b",
        lease_id: "lease-b",
        leaseTimeoutMs: 60_000,
      }),
    ).rejects.toThrow();
  });

  it("retries compare-and-set conflicts and surfaces them after retry budget", async () => {
    const adapter = new InMemoryWorkItemPersistenceAdapter();
    const conflictingAdapter = new BoundedConflictAdapter(adapter, 1);
    const store = new DatabaseWorkItemStore(conflictingAdapter, { maxRetries: 3 });
    await store.create(workItemInput("wi-db-retry"));
    const result = await store.markReady("wi-db-retry");
    expect(result.status).toBe("ready");
    expect(conflictingAdapter.conflictCount).toBe(1);

    const exhaustingAdapter = new BoundedConflictAdapter(adapter, 5);
    const exhaustingStore = new DatabaseWorkItemStore(exhaustingAdapter, { maxRetries: 2 });
    await exhaustingStore.create(workItemInput("wi-db-conflict"));
    await expect(exhaustingStore.markReady("wi-db-conflict")).rejects.toBeInstanceOf(
      WorkItemPersistenceConflict,
    );
  });

  it("heartbeat requires the current lease holder", async () => {
    const adapter = new InMemoryWorkItemPersistenceAdapter();
    const store = new DatabaseWorkItemStore(adapter);
    await store.create(workItemInput("wi-db-heartbeat"));
    await store.markReady("wi-db-heartbeat");
    await store.claim("wi-db-heartbeat", {
      claimant: "runner-a",
      lease_id: "lease-a",
      leaseTimeoutMs: 60_000,
    });

    await expect(
      store.heartbeat("wi-db-heartbeat", {
        lease_id: "lease-b",
        leaseTimeoutMs: 60_000,
      }),
    ).rejects.toThrow("lease id does not match");

    const ok = await store.heartbeat("wi-db-heartbeat", {
      lease_id: "lease-a",
      leaseTimeoutMs: 60_000,
    });
    expect(ok.lease?.lease_id).toBe("lease-a");
  });

  it("releases stale leases only after the lease expires", async () => {
    const adapter = new InMemoryWorkItemPersistenceAdapter();
    const store = new DatabaseWorkItemStore(adapter);
    await store.create(workItemInput("wi-db-stale"));
    await store.markReady("wi-db-stale");
    await store.claim("wi-db-stale", {
      claimant: "runner-a",
      lease_id: "lease-a",
      leaseTimeoutMs: 60_000,
    });

    await expect(store.releaseStale("wi-db-stale")).rejects.toThrow(
      "lease is still active",
    );

    // Force lease expiry via a short heartbeat ttl, then wait a few ms.
    await store.heartbeat("wi-db-stale", {
      lease_id: "lease-a",
      leaseTimeoutMs: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const released = await store.releaseStale("wi-db-stale");
    expect(released.status).toBe("ready");
    expect(released.lease).toBeNull();
  });

  it("completion requires a sanitized outcome or explicit no-output reason", async () => {
    const adapter = new InMemoryWorkItemPersistenceAdapter();
    const store = new DatabaseWorkItemStore(adapter);
    await store.create(workItemInput("wi-db-output"));
    await store.markReady("wi-db-output");
    await store.claim("wi-db-output", {
      claimant: "runner-a",
      lease_id: "lease-a",
      leaseTimeoutMs: 60_000,
    });

    await expect(
      store.complete("wi-db-output", { lease_id: "lease-a" } as never),
    ).rejects.toThrow();

    const completed = await store.complete("wi-db-output", {
      lease_id: "lease-a",
      no_output_reason: "Synthetic test ended without sanitized output.",
    });
    expect(completed.status).toBe("completed");
  });
});

describe("database work item store factory", () => {
  it("fails fast with adapter-not-implemented when selected from config", () => {
    expect(() =>
      createConfiguredWorkItemStore({
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
          store: {
            kind: "database",
            databaseUrl: "redacted://example.invalid/awl",
            databaseKind: "unknown",
          },
          allowEphemeral: false,
          allowSingleNodeFile: false,
          requireCloudGrade: false,
        },
      }),
    ).toThrow(WorkItemPersistenceAdapterNotImplementedError);
  });

  it("rejects database factory call with non-database config", () => {
    expect(() =>
      createDatabaseWorkItemStore({
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
          store: { kind: "memory" },
          allowEphemeral: true,
          allowSingleNodeFile: false,
          requireCloudGrade: false,
        },
      }),
    ).toThrow("database work item store requires a database store config");
  });

  it("rejects memory store when cloud-grade is required", () => {
    expect(() =>
      createConfiguredWorkItemStore({
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
          store: { kind: "memory" },
          allowEphemeral: true,
          allowSingleNodeFile: false,
          requireCloudGrade: true,
        },
      }),
    ).toThrow(/cloud-grade/);
  });
});

class BoundedConflictAdapter implements WorkItemPersistenceAdapter {
  conflictCount = 0;

  constructor(
    private readonly delegate: InMemoryWorkItemPersistenceAdapter,
    private readonly maxConflicts: number,
  ) {}

  insert(record: PersistedWorkItem): Promise<void> {
    return this.delegate.insert(record);
  }

  findById(id: string): Promise<PersistedWorkItem | undefined> {
    return this.delegate.findById(id);
  }

  findByIdempotencyKey(key: string): Promise<PersistedWorkItem | undefined> {
    return this.delegate.findByIdempotencyKey(key);
  }

  list(): Promise<PersistedWorkItem[]> {
    return this.delegate.list();
  }

  async compareAndSet(
    id: string,
    expectedVersion: number,
    next: PersistedWorkItem,
  ): Promise<void> {
    if (this.conflictCount < this.maxConflicts) {
      this.conflictCount += 1;
      throw new WorkItemPersistenceConflict();
    }
    await this.delegate.compareAndSet(id, expectedVersion, next);
  }
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
