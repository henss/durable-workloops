import type { CreateWorkItemRequest } from "@agent-workloops/api";
import { describe, expect, it, vi } from "vitest";
import {
  DatabaseWorkItemStore,
  WorkItemPersistenceAdapterNotImplementedError,
  WorkItemPersistenceConflict,
  createDatabaseWorkItemStore,
} from "./database-work-item-store.js";
import {
  COMPARE_AND_SET_SQL,
  FIND_BY_IDEMPOTENCY_SQL,
  FIND_BY_ID_SQL,
  INSERT_WORK_ITEM_SQL,
  LIST_SQL,
  PostgresWorkItemPersistenceAdapter,
  type PostgresExecutor,
} from "./postgres-work-item-store.js";
import type { ServerConfig } from "./config.js";

interface RecordedCall {
  text: string;
  params: readonly unknown[];
}

interface FakeRowSet {
  match: (text: string) => boolean;
  rows: unknown[];
}

class FakeExecutor implements PostgresExecutor {
  readonly calls: RecordedCall[] = [];
  private readonly matchers: FakeRowSet[] = [];
  private failureMatcher?: { match: (text: string) => boolean; error: Error };

  on(matcher: (text: string) => boolean, rows: unknown[]): this {
    this.matchers.push({ match: matcher, rows });
    return this;
  }

  failOn(matcher: (text: string) => boolean, error: Error): this {
    this.failureMatcher = { match: matcher, error };
    return this;
  }

  async query<R>(text: string, params: readonly unknown[]): Promise<R[]> {
    this.calls.push({ text, params });
    if (this.failureMatcher && this.failureMatcher.match(text)) {
      throw this.failureMatcher.error;
    }
    for (const matcher of this.matchers) {
      if (matcher.match(text)) {
        return matcher.rows as R[];
      }
    }
    return [];
  }
}

const SAMPLE_RECORD = {
  id: "wi-pg-1",
  status: "proposed" as const,
  created_at: "2026-05-17T08:00:00.000Z",
  updated_at: "2026-05-17T08:00:00.000Z",
  created_by: "operator-example",
  target_repo: "example-service",
  title: "Plan a coordination-only outcome",
  objective: "Synthetic planning-only objective.",
  priority: "normal" as const,
  trust_zone: "B_cloud_private" as const,
  job_class: "planning_only" as const,
  authority_class: "planning_only",
  required_capabilities: ["planning_packet"],
  payload_ref: "artifact://example/input",
  artifact_refs: [],
  approval_ref: null,
  lease: null,
  sanitized_outcome_ref: null,
  no_output_reason: null,
  audit_refs: [],
  redaction_policy: "public_safe_no_sensitive_payloads",
  idempotency_key: "wi-pg-1-key",
};

describe("PostgresWorkItemPersistenceAdapter — parameterized SQL", () => {
  it("issues a parameterized INSERT with the expected param positions", async () => {
    const executor = new FakeExecutor();
    const adapter = new PostgresWorkItemPersistenceAdapter(executor);

    await adapter.insert({
      id: SAMPLE_RECORD.id,
      version: 1,
      idempotency_key: SAMPLE_RECORD.idempotency_key,
      record: SAMPLE_RECORD,
    });

    expect(executor.calls).toHaveLength(1);
    const call = executor.calls[0]!;
    expect(call.text).toBe(INSERT_WORK_ITEM_SQL);
    expect(call.params).toEqual([
      SAMPLE_RECORD.id,
      1,
      SAMPLE_RECORD.idempotency_key,
      SAMPLE_RECORD.status,
      SAMPLE_RECORD.trust_zone,
      SAMPLE_RECORD.job_class,
      SAMPLE_RECORD.target_repo,
      SAMPLE_RECORD.created_at,
      SAMPLE_RECORD.updated_at,
      null,
      JSON.stringify(SAMPLE_RECORD),
    ]);
  });

  it("returns parsed records from findById and findByIdempotencyKey", async () => {
    const executor = new FakeExecutor()
      .on((text) => text === FIND_BY_ID_SQL, [
        { record: SAMPLE_RECORD, version: 1, idempotency_key: SAMPLE_RECORD.idempotency_key },
      ])
      .on((text) => text === FIND_BY_IDEMPOTENCY_SQL, [
        {
          record: JSON.stringify(SAMPLE_RECORD),
          version: 2,
          idempotency_key: SAMPLE_RECORD.idempotency_key,
        },
      ]);
    const adapter = new PostgresWorkItemPersistenceAdapter(executor);

    const byId = await adapter.findById(SAMPLE_RECORD.id);
    expect(byId?.version).toBe(1);
    expect(byId?.record.id).toBe(SAMPLE_RECORD.id);

    const byKey = await adapter.findByIdempotencyKey(SAMPLE_RECORD.idempotency_key);
    expect(byKey?.version).toBe(2);
    expect(byKey?.record.id).toBe(SAMPLE_RECORD.id);
  });

  it("list parses each row and returns the parsed records", async () => {
    const executor = new FakeExecutor().on((text) => text === LIST_SQL, [
      { record: SAMPLE_RECORD, version: 1, idempotency_key: SAMPLE_RECORD.idempotency_key },
      {
        record: { ...SAMPLE_RECORD, id: "wi-pg-2", idempotency_key: "wi-pg-2-key" },
        version: 1,
        idempotency_key: "wi-pg-2-key",
      },
    ]);
    const adapter = new PostgresWorkItemPersistenceAdapter(executor);

    const rows = await adapter.list();
    expect(rows.map((row) => row.record.id)).toEqual(["wi-pg-1", "wi-pg-2"]);
  });

  it("compareAndSet returns success when the executor returns the row id", async () => {
    const executor = new FakeExecutor().on((text) => text === COMPARE_AND_SET_SQL, [
      { id: SAMPLE_RECORD.id },
    ]);
    const adapter = new PostgresWorkItemPersistenceAdapter(executor);

    await expect(
      adapter.compareAndSet(SAMPLE_RECORD.id, 1, {
        id: SAMPLE_RECORD.id,
        version: 2,
        idempotency_key: SAMPLE_RECORD.idempotency_key,
        record: { ...SAMPLE_RECORD, updated_at: "2026-05-17T08:00:01.000Z" },
      }),
    ).resolves.toBeUndefined();
  });

  it("compareAndSet throws WorkItemPersistenceConflict when no row is returned", async () => {
    const executor = new FakeExecutor().on((text) => text === COMPARE_AND_SET_SQL, []);
    const adapter = new PostgresWorkItemPersistenceAdapter(executor);

    await expect(
      adapter.compareAndSet(SAMPLE_RECORD.id, 1, {
        id: SAMPLE_RECORD.id,
        version: 2,
        idempotency_key: SAMPLE_RECORD.idempotency_key,
        record: SAMPLE_RECORD,
      }),
    ).rejects.toBeInstanceOf(WorkItemPersistenceConflict);
  });

  it("fails closed when a returned row is malformed", async () => {
    const executor = new FakeExecutor().on((text) => text === FIND_BY_ID_SQL, [
      { record: 42, version: 1, idempotency_key: SAMPLE_RECORD.idempotency_key },
    ]);
    const adapter = new PostgresWorkItemPersistenceAdapter(executor);

    await expect(adapter.findById(SAMPLE_RECORD.id)).rejects.toThrow(
      "postgres work item row is malformed",
    );
  });

  it("does not echo the database URL, params, or payload when the driver fails", async () => {
    const sensitive = `${"sk"}-${"x".repeat(28)}`;
    const driverError = new Error(`pg driver: invalid value ${sensitive} from connection`);
    const executor = new FakeExecutor().failOn(
      (text) => text === INSERT_WORK_ITEM_SQL,
      driverError,
    );
    const adapter = new PostgresWorkItemPersistenceAdapter(executor);

    let surfaced: unknown;
    try {
      await adapter.insert({
        id: SAMPLE_RECORD.id,
        version: 1,
        idempotency_key: SAMPLE_RECORD.idempotency_key,
        record: SAMPLE_RECORD,
      });
    } catch (error) {
      surfaced = error;
    }

    expect(surfaced).toBeInstanceOf(Error);
    expect(String(surfaced)).not.toContain(sensitive);
    expect(String(surfaced)).toContain("postgres work item adapter insert failed");
  });

  it("runs through the DatabaseWorkItemStore CAS flow end-to-end against a fake executor", async () => {
    const stored = new Map<string, { record: unknown; version: number; idempotency_key: string }>();
    const executor: PostgresExecutor = {
      async query<R>(text: string, params: readonly unknown[]): Promise<R[]> {
        if (text === INSERT_WORK_ITEM_SQL) {
          const [id, version, idempotencyKey, , , , , , , , recordJson] = params as [
            string,
            number,
            string,
            unknown,
            unknown,
            unknown,
            unknown,
            unknown,
            unknown,
            unknown,
            string,
          ];
          stored.set(id, { record: JSON.parse(recordJson), version, idempotency_key: idempotencyKey });
          return [] as R[];
        }
        if (text === FIND_BY_ID_SQL) {
          const id = params[0] as string;
          const found = stored.get(id);
          return (found ? [found] : []) as R[];
        }
        if (text === FIND_BY_IDEMPOTENCY_SQL) {
          for (const entry of stored.values()) {
            if (entry.idempotency_key === (params[0] as string)) {
              return [entry] as R[];
            }
          }
          return [] as R[];
        }
        if (text === COMPARE_AND_SET_SQL) {
          const [version, idempotencyKey, , , , , , , recordJson, id, expectedVersion] =
            params as [
              number,
              string,
              unknown,
              unknown,
              unknown,
              unknown,
              unknown,
              unknown,
              string,
              string,
              number,
            ];
          const found = stored.get(id);
          if (!found || found.version !== expectedVersion) {
            return [] as R[];
          }
          stored.set(id, { record: JSON.parse(recordJson), version, idempotency_key: idempotencyKey });
          return [{ id }] as R[];
        }
        if (text === LIST_SQL) {
          return [...stored.values()] as R[];
        }
        return [] as R[];
      },
    };

    const store = new DatabaseWorkItemStore(new PostgresWorkItemPersistenceAdapter(executor));
    await store.create({
      id: "wi-pg-flow",
      created_by: "operator-example",
      target_repo: "example-service",
      title: "Plan a coordination-only outcome",
      objective: "Synthetic planning-only objective.",
      priority: "normal",
      trust_zone: "B_cloud_private",
      job_class: "planning_only",
      authority_class: "planning_only",
      required_capabilities: ["planning_packet"],
      payload_ref: "artifact://example/input",
      redaction_policy: "public_safe_no_sensitive_payloads",
      idempotency_key: "wi-pg-flow-key",
    });
    await store.markReady("wi-pg-flow");
    const claimed = await store.claim("wi-pg-flow", {
      claimant: "runner-pg",
      lease_id: "lease-pg",
      leaseTimeoutMs: 60_000,
    });
    expect(claimed.status).toBe("claimed");

    await expect(
      store.claim("wi-pg-flow", {
        claimant: "runner-other",
        lease_id: "lease-other",
        leaseTimeoutMs: 60_000,
      }),
    ).rejects.toThrow();
  });
});

describe("createDatabaseWorkItemStore factory — Postgres dispatch", () => {
  it("wires AWL_WORK_ITEM_STORE=database + databaseKind=postgres to the real adapter via injected factory", () => {
    const executor = new FakeExecutor();
    const factoryCalls: string[] = [];
    const store = createDatabaseWorkItemStore(
      buildDatabaseConfig({ databaseKind: "postgres", databaseUrl: "redacted://example.invalid/awl" }),
      {
        postgresExecutorFactory: (url) => {
          factoryCalls.push(url);
          return executor;
        },
      },
    );
    expect(store).toBeInstanceOf(DatabaseWorkItemStore);
    expect(factoryCalls).toEqual(["redacted://example.invalid/awl"]);
  });

  it("keeps databaseKind=mongodb fail-fast as not implemented", () => {
    expect(() =>
      createDatabaseWorkItemStore(
        buildDatabaseConfig({ databaseKind: "mongodb", databaseUrl: "redacted://example.invalid/awl" }),
      ),
    ).toThrow(WorkItemPersistenceAdapterNotImplementedError);
  });

  it("keeps databaseKind=unknown fail-fast as not implemented", () => {
    expect(() =>
      createDatabaseWorkItemStore(
        buildDatabaseConfig({ databaseKind: "unknown", databaseUrl: "redacted://example.invalid/awl" }),
      ),
    ).toThrow(WorkItemPersistenceAdapterNotImplementedError);
  });

  it("does not invoke the postgres factory when a non-database store is selected", () => {
    const factory = vi.fn();
    expect(() =>
      createDatabaseWorkItemStore(buildMemoryConfig(), { postgresExecutorFactory: factory }),
    ).toThrow("database work item store requires a database store config");
    expect(factory).not.toHaveBeenCalled();
  });
});

function buildDatabaseConfig(input: {
  databaseKind: "postgres" | "mongodb" | "unknown";
  databaseUrl: string;
  requireCloudGrade?: boolean;
}): ServerConfig {
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
      store: {
        kind: "database",
        databaseUrl: input.databaseUrl,
        databaseKind: input.databaseKind,
      },
      allowEphemeral: false,
      allowSingleNodeFile: false,
      requireCloudGrade: input.requireCloudGrade ?? true,
    },
  };
}

function buildMemoryConfig(): ServerConfig {
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
      store: { kind: "memory" },
      allowEphemeral: true,
      allowSingleNodeFile: false,
      requireCloudGrade: false,
    },
  };
}

// Silence unused-name warning for tests that don't reference the shape.
void ({} as CreateWorkItemRequest);
