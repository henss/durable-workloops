import {
  cancelWorkItem,
  claimWorkItem,
  completeWorkItem,
  createWorkItem,
  failWorkItem,
  heartbeatWorkItemLease,
  markWorkItemReady,
  moveWorkItemToNeedsApproval,
  parseWorkItem,
  releaseStaleWorkItemLease,
  type ClaimWorkItemRequest,
  type CompleteWorkItemRequest,
  type CreateWorkItemRequest,
  type WorkItem,
} from "@agent-workloops/api";
import type { ServerConfig } from "./config.js";
import type { WorkItemStore } from "./work-item-store.js";

/**
 * `WorkItemPersistenceAdapter` is the small "port" a cloud-grade database
 * driver must implement to back a `DatabaseWorkItemStore`. Every contract
 * operation either succeeds atomically against the underlying store or fails
 * with `WorkItemPersistenceConflict`, allowing the caller to retry or surface
 * a conflict to the API layer.
 *
 * The interface intentionally does not encode SQL, BSON, or any driver-level
 * detail. A future Postgres-backed adapter, a future MongoDB-backed adapter,
 * or any other cloud-grade engine can implement it as long as it provides
 * compare-and-set semantics on the `version` column and indexed lookups by
 * `id` and `idempotency_key`.
 */
export interface WorkItemPersistenceAdapter {
  insert(record: PersistedWorkItem): Promise<void>;
  findById(id: string): Promise<PersistedWorkItem | undefined>;
  findByIdempotencyKey(idempotencyKey: string): Promise<PersistedWorkItem | undefined>;
  list(): Promise<PersistedWorkItem[]>;
  /**
   * Apply a compare-and-set update. The adapter MUST only persist the new
   * record if the stored version equals `expectedVersion`. Otherwise it MUST
   * throw `WorkItemPersistenceConflict`.
   */
  compareAndSet(
    id: string,
    expectedVersion: number,
    next: PersistedWorkItem,
  ): Promise<void>;
}

export interface PersistedWorkItem {
  id: string;
  version: number;
  idempotency_key: string;
  record: WorkItem;
}

export class WorkItemPersistenceConflict extends Error {
  constructor(message = "work item persistence conflict") {
    super(message);
    this.name = "WorkItemPersistenceConflict";
  }
}

export class WorkItemPersistenceNotFound extends Error {
  constructor(message = "work item not found") {
    super(message);
    this.name = "WorkItemPersistenceNotFound";
  }
}

export class WorkItemPersistenceAdapterNotImplementedError extends Error {
  constructor(message = "database work item store adapter is not implemented") {
    super(message);
    this.name = "WorkItemPersistenceAdapterNotImplementedError";
  }
}

/**
 * `DatabaseWorkItemStore` is the cloud-grade `WorkItemStore` implementation.
 * It uses pure work-item lifecycle helpers from `@agent-workloops/api` and
 * delegates durability and atomicity to a `WorkItemPersistenceAdapter`.
 *
 * Concurrency strategy:
 *   1. Load the current persisted record (with version).
 *   2. Compute the next record using the pure lifecycle helper, which throws
 *      on invalid transitions.
 *   3. Call `compareAndSet(id, currentVersion, next)`.
 *   4. If the adapter throws `WorkItemPersistenceConflict`, retry a bounded
 *      number of times. After exhausting retries, surface the conflict.
 *
 * This guarantees that only one active lease can win a `claim`, that only
 * the current lease holder can `heartbeat` (lease id is validated by the
 * pure helper, version conflicts catch a racing release-stale), and that a
 * stale release can only succeed after the lease deadline has passed.
 */
export class DatabaseWorkItemStore implements WorkItemStore {
  readonly kind = "database";

  constructor(
    private readonly adapter: WorkItemPersistenceAdapter,
    private readonly options: { maxRetries?: number } = {},
  ) {}

  async create(input: CreateWorkItemRequest): Promise<WorkItem> {
    assertHostedAcceptableJobClass(input.job_class);

    if (input.idempotency_key) {
      const existing = await this.adapter.findByIdempotencyKey(input.idempotency_key);
      if (existing) {
        if (existing.record.id !== input.id) {
          throw new Error("idempotency key already used by a different work item");
        }
        return existing.record;
      }
    }

    const existingById = await this.adapter.findById(input.id);
    if (existingById) {
      throw new Error("work item already exists");
    }

    const item = createWorkItem(input);
    const persisted: PersistedWorkItem = {
      id: item.id,
      version: 1,
      idempotency_key: item.idempotency_key,
      record: item,
    };
    await this.adapter.insert(persisted);
    return item;
  }

  async list(): Promise<WorkItem[]> {
    const all = await this.adapter.list();
    return all
      .map((entry) => entry.record)
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
  }

  async get(id: string): Promise<WorkItem | undefined> {
    const stored = await this.adapter.findById(id);
    return stored?.record;
  }

  markReady(id: string): Promise<WorkItem> {
    return this.applyUpdate(id, (item) => markWorkItemReady(item));
  }

  claim(
    id: string,
    input: ClaimWorkItemRequest & { leaseTimeoutMs: number },
  ): Promise<WorkItem> {
    return this.applyUpdate(id, (item) =>
      claimWorkItem(item, {
        claimant: input.claimant,
        lease_id: input.lease_id ?? `lease:${item.id}:${Date.now()}`,
        ttl_ms: input.leaseTimeoutMs,
      }),
    );
  }

  heartbeat(id: string, input: { lease_id: string; leaseTimeoutMs: number }): Promise<WorkItem> {
    return this.applyUpdate(id, (item) =>
      heartbeatWorkItemLease(item, {
        lease_id: input.lease_id,
        ttl_ms: input.leaseTimeoutMs,
      }),
    );
  }

  releaseStale(id: string): Promise<WorkItem> {
    return this.applyUpdate(id, (item) => releaseStaleWorkItemLease(item));
  }

  moveToNeedsApproval(id: string): Promise<WorkItem> {
    return this.applyUpdate(id, (item) => moveWorkItemToNeedsApproval(item));
  }

  complete(id: string, input: CompleteWorkItemRequest): Promise<WorkItem> {
    return this.applyUpdate(id, (item) => completeWorkItem(item, input));
  }

  fail(id: string, reason: string): Promise<WorkItem> {
    return this.applyUpdate(id, (item) => failWorkItem(item, reason));
  }

  cancel(id: string): Promise<WorkItem> {
    return this.applyUpdate(id, (item) => cancelWorkItem(item));
  }

  private async applyUpdate(
    id: string,
    update: (item: WorkItem) => WorkItem,
  ): Promise<WorkItem> {
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const stored = await this.adapter.findById(id);
      if (!stored) {
        throw new WorkItemPersistenceNotFound();
      }
      const nextRecord = parseWorkItem(update(stored.record));
      const nextPersisted: PersistedWorkItem = {
        id: stored.id,
        version: stored.version + 1,
        idempotency_key: stored.idempotency_key,
        record: nextRecord,
      };
      try {
        await this.adapter.compareAndSet(stored.id, stored.version, nextPersisted);
        return nextRecord;
      } catch (error) {
        if (error instanceof WorkItemPersistenceConflict) {
          continue;
        }
        throw error;
      }
    }
    throw new WorkItemPersistenceConflict(
      "work item update conflict after retry budget",
    );
  }
}

/**
 * `InMemoryWorkItemPersistenceAdapter` is an in-process implementation of
 * `WorkItemPersistenceAdapter` for contract tests. It enforces the same
 * compare-and-set semantics a real cloud-grade adapter must enforce, so the
 * tests over `DatabaseWorkItemStore` exercise the concurrency contract
 * without requiring a live database.
 *
 * This adapter is NOT a production store. It carries no durability across
 * processes and is exported only as a test helper.
 */
export class InMemoryWorkItemPersistenceAdapter implements WorkItemPersistenceAdapter {
  private readonly entries = new Map<string, PersistedWorkItem>();

  async insert(record: PersistedWorkItem): Promise<void> {
    if (this.entries.has(record.id)) {
      throw new Error("work item already exists");
    }
    this.entries.set(record.id, cloneRecord(record));
  }

  async findById(id: string): Promise<PersistedWorkItem | undefined> {
    const entry = this.entries.get(id);
    return entry ? cloneRecord(entry) : undefined;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<PersistedWorkItem | undefined> {
    for (const entry of this.entries.values()) {
      if (entry.idempotency_key === idempotencyKey) {
        return cloneRecord(entry);
      }
    }
    return undefined;
  }

  async list(): Promise<PersistedWorkItem[]> {
    return [...this.entries.values()].map(cloneRecord);
  }

  async compareAndSet(
    id: string,
    expectedVersion: number,
    next: PersistedWorkItem,
  ): Promise<void> {
    const current = this.entries.get(id);
    if (!current) {
      throw new WorkItemPersistenceNotFound();
    }
    if (current.version !== expectedVersion) {
      throw new WorkItemPersistenceConflict();
    }
    this.entries.set(id, cloneRecord(next));
  }
}

/**
 * Factory invoked by hosted server startup when `AWL_WORK_ITEM_STORE=database`.
 * No real Postgres or MongoDB backing is wired in this phase. Selecting the
 * database store MUST fail fast with a clear error so deployments cannot
 * silently degrade to a non-cloud-grade adapter.
 *
 * The actual cloud-grade driver wiring (collection/table layout, index setup,
 * connection lifecycle) is described in
 * `docs/migration/database-work-item-store-contract.md`.
 */
export function createDatabaseWorkItemStore(
  config: ServerConfig,
): DatabaseWorkItemStore {
  if (config.workItems.store.kind !== "database") {
    throw new Error("database work item store requires a database store config");
  }
  throw new WorkItemPersistenceAdapterNotImplementedError(
    "database work item store adapter is not implemented; configure AWL_WORK_ITEM_STORE_DATABASE_KIND once a cloud-grade driver is wired",
  );
}

function assertHostedAcceptableJobClass(jobClass: CreateWorkItemRequest["job_class"]): void {
  if (jobClass === "forbidden") {
    throw new Error("forbidden job class is not accepted");
  }
  if (jobClass === "approval_required_write_action") {
    throw new Error("approval-required write actions are not accepted in this phase");
  }
}

function cloneRecord(record: PersistedWorkItem): PersistedWorkItem {
  return {
    id: record.id,
    version: record.version,
    idempotency_key: record.idempotency_key,
    record: structuredClone(record.record),
  };
}
