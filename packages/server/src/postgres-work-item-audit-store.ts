import crypto from "node:crypto";
import {
  WorkItemAuditEventSchema,
  type WorkItemAuditEvent,
} from "@agent-workloops/api";
import type { PostgresExecutor } from "./postgres-work-item-store.js";
import type {
  WorkItemAuditEventInput,
  WorkItemAuditFilter,
  WorkItemAuditStore,
} from "./work-item-audit-store.js";

export const INSERT_AUDIT_SQL = `
INSERT INTO work_item_audit_events (
  id, work_item_id, event_type, created_at, record
) VALUES (
  $1, $2, $3, $4, $5::jsonb
)
`.trim();

export const LIST_BY_WORK_ITEM_SQL = `
SELECT record FROM work_item_audit_events
WHERE work_item_id = $1
ORDER BY created_at ASC
`.trim();

export const LIST_BY_WORK_ITEM_AND_TYPES_SQL = `
SELECT record FROM work_item_audit_events
WHERE work_item_id = $1 AND event_type = ANY($2::text[])
ORDER BY created_at ASC
`.trim();

export const LIST_BY_TYPES_SQL = `
SELECT record FROM work_item_audit_events
WHERE event_type = ANY($1::text[])
ORDER BY created_at ASC
`.trim();

export const LIST_ALL_SQL = `
SELECT record FROM work_item_audit_events
ORDER BY created_at ASC
`.trim();

/**
 * Postgres-backed `WorkItemAuditStore`. Append-only by construction: the
 * adapter does NOT expose update or delete operations, and the SQL surface
 * only emits `INSERT` and `SELECT` against `work_item_audit_events`.
 *
 * Safety properties:
 *   - Records are validated through `WorkItemAuditEventSchema` before
 *     insertion, so malformed events fail closed before any DB write.
 *   - All SQL is parameterized.
 *   - The adapter does not log the database URL, query parameters, or audit
 *     record payload values.
 *   - Errors are normalized to opaque messages so input payloads cannot
 *     escape into upstream logs.
 */
export class PostgresWorkItemAuditStore implements WorkItemAuditStore {
  constructor(private readonly executor: PostgresExecutor) {}

  async record(input: WorkItemAuditEventInput): Promise<WorkItemAuditEvent> {
    const event = WorkItemAuditEventSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    });
    const params: unknown[] = [
      event.id,
      event.work_item_id ?? null,
      event.event_type,
      event.created_at,
      JSON.stringify(event),
    ];
    try {
      await this.executor.query(INSERT_AUDIT_SQL, params);
    } catch {
      throw new Error("postgres work item audit adapter insert failed");
    }
    return event;
  }

  async list(filter: WorkItemAuditFilter = {}): Promise<WorkItemAuditEvent[]> {
    const eventTypes =
      filter.eventTypes && filter.eventTypes.length > 0 ? filter.eventTypes : undefined;
    let rows: Array<{ record: unknown }>;
    try {
      if (filter.workItemId && eventTypes) {
        rows = await this.executor.query<{ record: unknown }>(
          LIST_BY_WORK_ITEM_AND_TYPES_SQL,
          [filter.workItemId, eventTypes],
        );
      } else if (filter.workItemId) {
        rows = await this.executor.query<{ record: unknown }>(
          LIST_BY_WORK_ITEM_SQL,
          [filter.workItemId],
        );
      } else if (eventTypes) {
        rows = await this.executor.query<{ record: unknown }>(
          LIST_BY_TYPES_SQL,
          [eventTypes],
        );
      } else {
        rows = await this.executor.query<{ record: unknown }>(LIST_ALL_SQL, []);
      }
    } catch {
      throw new Error("postgres work item audit adapter list failed");
    }
    return rows.map((row) => WorkItemAuditEventSchema.parse(parseRecordValue(row.record)));
  }
}

function parseRecordValue(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error("postgres work item audit row is malformed");
    }
  }
  if (value && typeof value === "object") {
    return value;
  }
  throw new Error("postgres work item audit row is malformed");
}
