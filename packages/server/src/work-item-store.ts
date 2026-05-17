import fs from "node:fs/promises";
import path from "node:path";
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
import {
  createDatabaseWorkItemStore,
  type CreateDatabaseWorkItemStoreOptions,
} from "./database-work-item-store.js";

export interface WorkItemStore {
  create(input: CreateWorkItemRequest): Promise<WorkItem>;
  list(): Promise<WorkItem[]>;
  get(id: string): Promise<WorkItem | undefined>;
  markReady(id: string): Promise<WorkItem>;
  claim(id: string, input: ClaimWorkItemRequest & { leaseTimeoutMs: number }): Promise<WorkItem>;
  heartbeat(id: string, input: { lease_id: string; leaseTimeoutMs: number }): Promise<WorkItem>;
  releaseStale(id: string): Promise<WorkItem>;
  moveToNeedsApproval(id: string): Promise<WorkItem>;
  complete(id: string, input: CompleteWorkItemRequest): Promise<WorkItem>;
  fail(id: string, reason: string): Promise<WorkItem>;
  cancel(id: string): Promise<WorkItem>;
}

export class InMemoryWorkItemStore implements WorkItemStore {
  readonly kind = "memory";
  private readonly items = new Map<string, WorkItem>();

  async create(input: CreateWorkItemRequest): Promise<WorkItem> {
    assertHostedAcceptableJobClass(input.job_class);
    if (this.items.has(input.id)) {
      throw new Error("work item already exists");
    }
    const item = createWorkItem(input);
    this.items.set(item.id, item);
    return item;
  }

  async list(): Promise<WorkItem[]> {
    return [...this.items.values()].sort((left, right) => left.created_at.localeCompare(right.created_at));
  }

  async get(id: string): Promise<WorkItem | undefined> {
    return this.items.get(id);
  }

  async markReady(id: string): Promise<WorkItem> {
    return this.update(id, (item) => markWorkItemReady(item));
  }

  async claim(id: string, input: ClaimWorkItemRequest & { leaseTimeoutMs: number }): Promise<WorkItem> {
    return this.update(id, (item) =>
      claimWorkItem(item, {
        claimant: input.claimant,
        lease_id: input.lease_id ?? `lease:${item.id}:${Date.now()}`,
        ttl_ms: input.leaseTimeoutMs,
      }),
    );
  }

  async heartbeat(id: string, input: { lease_id: string; leaseTimeoutMs: number }): Promise<WorkItem> {
    return this.update(id, (item) =>
      heartbeatWorkItemLease(item, {
        lease_id: input.lease_id,
        ttl_ms: input.leaseTimeoutMs,
      }),
    );
  }

  async releaseStale(id: string): Promise<WorkItem> {
    return this.update(id, (item) => releaseStaleWorkItemLease(item));
  }

  async moveToNeedsApproval(id: string): Promise<WorkItem> {
    return this.update(id, (item) => moveWorkItemToNeedsApproval(item));
  }

  async complete(id: string, input: CompleteWorkItemRequest): Promise<WorkItem> {
    return this.update(id, (item) => completeWorkItem(item, input));
  }

  async fail(id: string, reason: string): Promise<WorkItem> {
    return this.update(id, (item) => failWorkItem(item, reason));
  }

  async cancel(id: string): Promise<WorkItem> {
    return this.update(id, (item) => cancelWorkItem(item));
  }

  private update(id: string, update: (item: WorkItem) => WorkItem): WorkItem {
    const item = this.items.get(id);
    if (!item) {
      throw new Error("work item not found");
    }
    const updated = update(item);
    this.items.set(id, updated);
    return updated;
  }
}

export class FileWorkItemStore implements WorkItemStore {
  readonly kind = "file";
  private readonly lockDir: string;

  constructor(private readonly filePath: string) {
    this.lockDir = `${filePath}.lock`;
  }

  async create(input: CreateWorkItemRequest): Promise<WorkItem> {
    assertHostedAcceptableJobClass(input.job_class);
    return this.withLock(async () => {
      const items = await this.readItems();
      if (items.has(input.id)) {
        throw new Error("work item already exists");
      }
      const item = createWorkItem(input);
      items.set(item.id, item);
      await this.writeItems(items);
      return item;
    });
  }

  async list(): Promise<WorkItem[]> {
    return [...(await this.readItems()).values()].sort((left, right) =>
      left.created_at.localeCompare(right.created_at),
    );
  }

  async get(id: string): Promise<WorkItem | undefined> {
    return (await this.readItems()).get(id);
  }

  async markReady(id: string): Promise<WorkItem> {
    return this.update(id, (item) => markWorkItemReady(item));
  }

  async claim(id: string, input: ClaimWorkItemRequest & { leaseTimeoutMs: number }): Promise<WorkItem> {
    return this.update(id, (item) =>
      claimWorkItem(item, {
        claimant: input.claimant,
        lease_id: input.lease_id ?? `lease:${item.id}:${Date.now()}`,
        ttl_ms: input.leaseTimeoutMs,
      }),
    );
  }

  async heartbeat(id: string, input: { lease_id: string; leaseTimeoutMs: number }): Promise<WorkItem> {
    return this.update(id, (item) =>
      heartbeatWorkItemLease(item, {
        lease_id: input.lease_id,
        ttl_ms: input.leaseTimeoutMs,
      }),
    );
  }

  async releaseStale(id: string): Promise<WorkItem> {
    return this.update(id, (item) => releaseStaleWorkItemLease(item));
  }

  async moveToNeedsApproval(id: string): Promise<WorkItem> {
    return this.update(id, (item) => moveWorkItemToNeedsApproval(item));
  }

  async complete(id: string, input: CompleteWorkItemRequest): Promise<WorkItem> {
    return this.update(id, (item) => completeWorkItem(item, input));
  }

  async fail(id: string, reason: string): Promise<WorkItem> {
    return this.update(id, (item) => failWorkItem(item, reason));
  }

  async cancel(id: string): Promise<WorkItem> {
    return this.update(id, (item) => cancelWorkItem(item));
  }

  private async update(id: string, update: (item: WorkItem) => WorkItem): Promise<WorkItem> {
    return this.withLock(async () => {
      const items = await this.readItems();
      const item = items.get(id);
      if (!item) {
        throw new Error("work item not found");
      }
      const updated = update(item);
      items.set(id, updated);
      await this.writeItems(items);
      return updated;
    });
  }

  private async readItems(): Promise<Map<string, WorkItem>> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        return new Map();
      }
      throw error;
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      throw new Error("work item store file is corrupt or invalid");
    }
    if (typeof decoded !== "object" || decoded === null || !Array.isArray((decoded as { work_items?: unknown }).work_items)) {
      throw new Error("work item store file is corrupt or invalid");
    }

    const items = new Map<string, WorkItem>();
    for (const entry of (decoded as { work_items: unknown[] }).work_items) {
      let item: WorkItem;
      try {
        item = parseWorkItem(entry);
      } catch {
        throw new Error("work item store file is corrupt or invalid");
      }
      if (items.has(item.id)) {
        throw new Error("work item store file is corrupt or invalid");
      }
      items.set(item.id, item);
    }
    return items;
  }

  private async writeItems(items: Map<string, WorkItem>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const body = `${JSON.stringify({ work_items: [...items.values()] }, null, 2)}\n`;
    await fs.writeFile(tmpPath, body, { mode: 0o600 });
    await fs.rename(tmpPath, this.filePath);
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    for (;;) {
      try {
        await fs.mkdir(this.lockDir, { recursive: false });
        break;
      } catch (error) {
        if (!isExistingFileError(error)) {
          throw error;
        }
        if (Date.now() - startedAt > 5_000) {
          throw new Error("work item store lock timeout");
        }
        await sleep(25);
      }
    }
    try {
      return await operation();
    } finally {
      await fs.rm(this.lockDir, { recursive: true, force: true });
    }
  }
}

export interface CreateConfiguredWorkItemStoreOptions {
  databaseOptions?: CreateDatabaseWorkItemStoreOptions;
}

export function createConfiguredWorkItemStore(
  config: ServerConfig,
  options: CreateConfiguredWorkItemStoreOptions = {},
): WorkItemStore {
  const store = config.workItems.store;
  if (store.kind === "memory") {
    if (config.workItems.requireCloudGrade) {
      throw new Error(
        "AWL_WORK_ITEM_STORE memory is not cloud-grade when AWL_REQUIRE_CLOUD_GRADE_WORK_ITEM_STORE=true",
      );
    }
    return new InMemoryWorkItemStore();
  }
  if (store.kind === "file") {
    if (config.workItems.requireCloudGrade) {
      throw new Error(
        "AWL_WORK_ITEM_STORE file is not cloud-grade when AWL_REQUIRE_CLOUD_GRADE_WORK_ITEM_STORE=true",
      );
    }
    return new FileWorkItemStore(store.filePath);
  }
  if (store.kind === "database") {
    return createDatabaseWorkItemStore(config, options.databaseOptions);
  }
  throw new Error("AWL_WORK_ITEM_STORE is not recognized");
}

function assertHostedAcceptableJobClass(jobClass: CreateWorkItemRequest["job_class"]): void {
  if (jobClass === "forbidden") {
    throw new Error("forbidden job class is not accepted");
  }
  if (jobClass === "approval_required_write_action") {
    throw new Error("approval-required write actions are not accepted in this phase");
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isExistingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
