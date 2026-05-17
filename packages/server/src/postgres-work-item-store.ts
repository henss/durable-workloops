import postgres from "postgres";
import {
  parseWorkItem,
  type WorkItem,
} from "@agent-workloops/api";
import {
  WorkItemPersistenceConflict,
  type PersistedWorkItem,
  type WorkItemPersistenceAdapter,
} from "./database-work-item-store.js";

/**
 * `PostgresExecutor` is a small parameterized-SQL port. It is the only
 * surface the Postgres work-item adapters depend on.
 *
 * The runtime implementation wraps the `postgres` tagged-template client via
 * `postgresExecutorFromClient`. Unit tests inject a stub that records the
 * SQL text and parameters and returns canned rows, so the adapter contract
 * is exercised without ever opening a database connection.
 */
export interface PostgresExecutor {
  query<R = Record<string, unknown>>(text: string, params: readonly unknown[]): Promise<R[]>;
}

/**
 * Wrap a `postgres` tagged-template client as a `PostgresExecutor`. Uses the
 * postgres library's documented `.unsafe(text, params)` API, which sends
 * parameterized queries to the server (the SQL text is fixed and never
 * concatenated with user input).
 *
 * This function MUST NOT log the connection string or any query parameter
 * values, and the adapter that consumes it normalizes errors so input
 * payloads cannot escape into upstream logs.
 */
export function postgresExecutorFromClient(
  sql: ReturnType<typeof postgres>,
): PostgresExecutor {
  return {
    async query(text, params) {
      // The postgres library types its `.unsafe` parameters via
      // `ParameterOrJSON<TTypes[keyof TTypes]>[]`. Our executor port keeps
      // the param array opaque (`unknown[]`) so a fake executor can take
      // arbitrary test values. Cast through `unknown` so the call lines up
      // with the library's parameter type at runtime.
      const rows = await sql.unsafe(text, params as unknown as Parameters<typeof sql.unsafe>[1]);
      return rows as never;
    },
  };
}

/**
 * Default runtime executor factory. Builds a postgres client from the
 * provided database URL with a small connection pool. The URL is read by
 * `postgres()` itself and is never logged here.
 */
export function defaultPostgresExecutorFactory(databaseUrl: string): PostgresExecutor {
  const client = postgres(databaseUrl, { max: 5 });
  return postgresExecutorFromClient(client);
}

interface WorkItemRow {
  record: unknown;
  version: number;
  idempotency_key: string;
}

const SELECT_COLUMNS = "record, version, idempotency_key";

export const INSERT_WORK_ITEM_SQL = `
INSERT INTO work_items (
  id, version, idempotency_key, status, trust_zone, job_class, target_repo,
  created_at, updated_at, lease_expires_at, record
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
)
`.trim();

export const FIND_BY_ID_SQL = `
SELECT ${SELECT_COLUMNS} FROM work_items WHERE id = $1
`.trim();

export const FIND_BY_IDEMPOTENCY_SQL = `
SELECT ${SELECT_COLUMNS} FROM work_items WHERE idempotency_key = $1
`.trim();

export const LIST_SQL = `
SELECT ${SELECT_COLUMNS} FROM work_items ORDER BY created_at ASC
`.trim();

export const COMPARE_AND_SET_SQL = `
UPDATE work_items
SET
  version = $1,
  idempotency_key = $2,
  status = $3,
  trust_zone = $4,
  job_class = $5,
  target_repo = $6,
  updated_at = $7,
  lease_expires_at = $8,
  record = $9::jsonb
WHERE id = $10 AND version = $11
RETURNING id
`.trim();

/**
 * Postgres-backed `WorkItemPersistenceAdapter`.
 *
 * Concurrency semantics are delegated to the database: every state-changing
 * operation goes through `compareAndSet`, which only updates the row when
 * `version` matches the expected value and returns the row identifier when
 * the update happened. If no row is returned, the caller treats the outcome
 * as `WorkItemPersistenceConflict`.
 *
 * Safety properties:
 *   - All SQL is parameterized; no caller-supplied string is interpolated
 *     into query text.
 *   - The adapter does not log the database URL, query parameters, or work
 *     item payload values.
 *   - All errors raised from the adapter are normalized to opaque messages
 *     so that input payloads never leak into upstream logs.
 *   - Rows are re-validated through the work item schema; malformed rows
 *     fail closed with `postgres work item row is malformed`.
 */
export class PostgresWorkItemPersistenceAdapter implements WorkItemPersistenceAdapter {
  constructor(private readonly executor: PostgresExecutor) {}

  async insert(record: PersistedWorkItem): Promise<void> {
    try {
      await this.executor.query(INSERT_WORK_ITEM_SQL, buildInsertParams(record));
    } catch (error) {
      throw normalizeAdapterError("insert", error);
    }
  }

  async findById(id: string): Promise<PersistedWorkItem | undefined> {
    let rows: WorkItemRow[];
    try {
      rows = await this.executor.query<WorkItemRow>(FIND_BY_ID_SQL, [id]);
    } catch (error) {
      throw normalizeAdapterError("findById", error);
    }
    const first = rows[0];
    return first ? parseRow(first) : undefined;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<PersistedWorkItem | undefined> {
    let rows: WorkItemRow[];
    try {
      rows = await this.executor.query<WorkItemRow>(FIND_BY_IDEMPOTENCY_SQL, [idempotencyKey]);
    } catch (error) {
      throw normalizeAdapterError("findByIdempotencyKey", error);
    }
    const first = rows[0];
    return first ? parseRow(first) : undefined;
  }

  async list(): Promise<PersistedWorkItem[]> {
    let rows: WorkItemRow[];
    try {
      rows = await this.executor.query<WorkItemRow>(LIST_SQL, []);
    } catch (error) {
      throw normalizeAdapterError("list", error);
    }
    return rows.map(parseRow);
  }

  async compareAndSet(
    id: string,
    expectedVersion: number,
    next: PersistedWorkItem,
  ): Promise<void> {
    const params: unknown[] = [
      next.version,
      next.idempotency_key,
      next.record.status,
      next.record.trust_zone,
      next.record.job_class,
      next.record.target_repo,
      next.record.updated_at,
      next.record.lease?.expires_at ?? null,
      JSON.stringify(next.record),
      id,
      expectedVersion,
    ];
    let rows: Array<{ id: string }>;
    try {
      rows = await this.executor.query<{ id: string }>(COMPARE_AND_SET_SQL, params);
    } catch (error) {
      throw normalizeAdapterError("compareAndSet", error);
    }
    if (rows.length === 0) {
      throw new WorkItemPersistenceConflict();
    }
  }
}

function buildInsertParams(record: PersistedWorkItem): unknown[] {
  return [
    record.id,
    record.version,
    record.idempotency_key,
    record.record.status,
    record.record.trust_zone,
    record.record.job_class,
    record.record.target_repo,
    record.record.created_at,
    record.record.updated_at,
    record.record.lease?.expires_at ?? null,
    JSON.stringify(record.record),
  ];
}

function parseRow(row: WorkItemRow): PersistedWorkItem {
  const recordValue = parseRecordValue(row.record);
  const parsed: WorkItem = parseWorkItem(recordValue);
  if (
    typeof row.version !== "number" ||
    !Number.isFinite(row.version) ||
    row.version < 1 ||
    !Number.isInteger(row.version)
  ) {
    throw new Error("postgres work item row is malformed");
  }
  if (typeof row.idempotency_key !== "string" || row.idempotency_key.length === 0) {
    throw new Error("postgres work item row is malformed");
  }
  return {
    id: parsed.id,
    version: row.version,
    idempotency_key: row.idempotency_key,
    record: parsed,
  };
}

function parseRecordValue(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error("postgres work item row is malformed");
    }
  }
  if (value && typeof value === "object") {
    return value;
  }
  throw new Error("postgres work item row is malformed");
}

function normalizeAdapterError(operation: string, _error: unknown): Error {
  // The original error is intentionally suppressed. Driver-level errors can
  // contain query parameters, host/port, or other connection details we do
  // not want surfaced to upstream logs.
  return new Error(`postgres work item adapter ${operation} failed`);
}
