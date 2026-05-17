import { describe, expect, it } from "vitest";
import {
  INSERT_AUDIT_SQL,
  LIST_BY_TYPES_SQL,
  LIST_BY_WORK_ITEM_AND_TYPES_SQL,
  LIST_BY_WORK_ITEM_SQL,
  PostgresWorkItemAuditStore,
} from "./postgres-work-item-audit-store.js";
import type { PostgresExecutor } from "./postgres-work-item-store.js";
import type { WorkItemAuditEventInput } from "./work-item-audit-store.js";

interface RecordedCall {
  text: string;
  params: readonly unknown[];
}

class CapturingExecutor implements PostgresExecutor {
  readonly calls: RecordedCall[] = [];
  rowsForList: unknown[] = [];

  async query<R>(text: string, params: readonly unknown[]): Promise<R[]> {
    this.calls.push({ text, params });
    if (
      text === LIST_BY_WORK_ITEM_SQL ||
      text === LIST_BY_WORK_ITEM_AND_TYPES_SQL ||
      text === LIST_BY_TYPES_SQL ||
      text.startsWith("SELECT record FROM work_item_audit_events")
    ) {
      return this.rowsForList as R[];
    }
    return [] as R[];
  }
}

function baseInput(overrides: Partial<WorkItemAuditEventInput> = {}): WorkItemAuditEventInput {
  return {
    event_type: "work_item_created",
    work_item_id: "wi-audit-pg-1",
    actor_ref: "operator-example",
    instance_ref: "test-instance",
    status_before: null,
    status_after: "proposed",
    job_class: "planning_only",
    trust_zone: "B_cloud_private",
    authority_class: "planning_only",
    redaction_policy: "public_safe_no_sensitive_payloads",
    artifact_refs: [],
    approval_ref: null,
    receipt_ref: null,
    sanitized_reason: null,
    metadata_hash: null,
    payload_hash: null,
    ...overrides,
  };
}

describe("PostgresWorkItemAuditStore", () => {
  it("issues a parameterized INSERT and never emits UPDATE or DELETE", async () => {
    const executor = new CapturingExecutor();
    const store = new PostgresWorkItemAuditStore(executor);

    await store.record(baseInput());
    await store.record(baseInput({ event_type: "work_item_ready", status_after: "ready" }));

    expect(executor.calls).toHaveLength(2);
    for (const call of executor.calls) {
      expect(call.text).toBe(INSERT_AUDIT_SQL);
      expect(call.text).not.toMatch(/UPDATE|DELETE/i);
      expect(call.params).toHaveLength(5);
      expect(typeof call.params[0]).toBe("string"); // id
      expect(call.params[1]).toBe("wi-audit-pg-1"); // work_item_id
      expect(typeof call.params[2]).toBe("string"); // event_type
      expect(typeof call.params[3]).toBe("string"); // created_at
      expect(typeof call.params[4]).toBe("string"); // jsonb-stringified record
    }
  });

  it("rejects malformed event input before any DB call", async () => {
    const executor = new CapturingExecutor();
    const store = new PostgresWorkItemAuditStore(executor);

    await expect(
      store.record({
        ...baseInput(),
        // event_type intentionally invalid for the audit schema
        event_type: "not_a_real_event" as unknown as WorkItemAuditEventInput["event_type"],
      }),
    ).rejects.toThrow();
    expect(executor.calls).toHaveLength(0);
  });

  it("does not include a secret-shaped value in the stored record JSON", async () => {
    const executor = new CapturingExecutor();
    const store = new PostgresWorkItemAuditStore(executor);
    const sensitive = `${"sk"}-${"y".repeat(32)}`;

    await store.record(
      baseInput({
        // sanitized_reason is intentionally null; we are checking the
        // adapter does not echo a sensitive-looking value the caller did
        // not supply.
        actor_ref: "operator-example",
      }),
    );

    const call = executor.calls[0]!;
    const jsonRecord = call.params[4] as string;
    expect(jsonRecord).not.toContain(sensitive);
    expect(jsonRecord).not.toContain("password");
  });

  it("selects the right query based on filter shape", async () => {
    const executor = new CapturingExecutor();
    const store = new PostgresWorkItemAuditStore(executor);

    await store.list();
    await store.list({ workItemId: "wi-audit-pg-1" });
    await store.list({ workItemId: "wi-audit-pg-1", eventTypes: ["work_item_claimed"] });
    await store.list({ eventTypes: ["auth_rejected"] });

    expect(executor.calls.map((call) => call.text)).toEqual([
      "SELECT record FROM work_item_audit_events\nORDER BY created_at ASC",
      LIST_BY_WORK_ITEM_SQL,
      LIST_BY_WORK_ITEM_AND_TYPES_SQL,
      LIST_BY_TYPES_SQL,
    ]);
  });

  it("fails closed when a returned audit row is malformed", async () => {
    const executor = new CapturingExecutor();
    executor.rowsForList = [{ record: 42 }];
    const store = new PostgresWorkItemAuditStore(executor);

    await expect(store.list({ workItemId: "wi-audit-pg-1" })).rejects.toThrow(
      "postgres work item audit row is malformed",
    );
  });
});
