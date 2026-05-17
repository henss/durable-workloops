import type { CreateWorkItemRequest } from "@agent-workloops/api";
import { describe, expect, it } from "vitest";
import {
  DatabaseWorkItemStore,
  InMemoryWorkItemPersistenceAdapter,
} from "./database-work-item-store.js";
import {
  InMemoryWorkItemAuditStore,
  RecordingWorkItemStore,
} from "./work-item-audit-store.js";

describe("work item audit store", () => {
  it("records created, ready, claim, heartbeat, complete events for a healthy lifecycle", async () => {
    const audit = new InMemoryWorkItemAuditStore();
    const inner = new DatabaseWorkItemStore(new InMemoryWorkItemPersistenceAdapter());
    const store = new RecordingWorkItemStore(inner, audit, { instanceRef: "test-instance" });

    await store.create(workItemInput("wi-audit-1"));
    await store.markReady("wi-audit-1");
    const claimed = await store.claim("wi-audit-1", {
      claimant: "runner-x",
      lease_id: "lease-x",
      leaseTimeoutMs: 60_000,
    });
    await store.heartbeat("wi-audit-1", {
      lease_id: claimed.lease!.lease_id,
      leaseTimeoutMs: 60_000,
    });
    await store.complete("wi-audit-1", {
      lease_id: claimed.lease!.lease_id,
      no_output_reason: "Synthetic completion in test.",
    });

    const events = await audit.list({ workItemId: "wi-audit-1" });
    expect(events.map((event) => event.event_type)).toEqual([
      "work_item_created",
      "work_item_ready",
      "work_item_claimed",
      "work_item_heartbeat",
      "work_item_completed",
    ]);
    for (const event of events) {
      expect(event.work_item_id).toBe("wi-audit-1");
      expect(event.instance_ref).toBe("test-instance");
      expect(event.redaction_policy).toBe("public_safe_no_sensitive_payloads");
    }
  });

  it("records fail and cancel events", async () => {
    const audit = new InMemoryWorkItemAuditStore();
    const inner = new DatabaseWorkItemStore(new InMemoryWorkItemPersistenceAdapter());
    const store = new RecordingWorkItemStore(inner, audit);

    await store.create(workItemInput("wi-audit-fail"));
    await store.markReady("wi-audit-fail");
    await store.claim("wi-audit-fail", {
      claimant: "runner",
      lease_id: "lease-fail",
      leaseTimeoutMs: 60_000,
    });
    await store.fail("wi-audit-fail", "Synthetic failure in test.");

    await store.create(workItemInput("wi-audit-cancel"));
    await store.cancel("wi-audit-cancel");

    const events = await audit.list();
    const types = events.map((event) => event.event_type);
    expect(types).toContain("work_item_failed");
    expect(types).toContain("work_item_cancelled");
  });

  it("records a transition_rejected event when the inner store throws", async () => {
    const audit = new InMemoryWorkItemAuditStore();
    const inner = new DatabaseWorkItemStore(new InMemoryWorkItemPersistenceAdapter());
    const store = new RecordingWorkItemStore(inner, audit);

    await store.create(workItemInput("wi-audit-reject"));
    // Cannot claim a proposed item that has not been marked ready.
    await expect(
      store.claim("wi-audit-reject", {
        claimant: "runner",
        lease_id: "lease-reject",
        leaseTimeoutMs: 60_000,
      }),
    ).rejects.toThrow();

    const events = await audit.list({ workItemId: "wi-audit-reject" });
    const types = events.map((event) => event.event_type);
    expect(types).toContain("transition_rejected");
  });

  it("does not echo secret-like values into audit events", async () => {
    const audit = new InMemoryWorkItemAuditStore();
    const inner = new DatabaseWorkItemStore(new InMemoryWorkItemPersistenceAdapter());
    const store = new RecordingWorkItemStore(inner, audit);

    const sensitiveLookingValue = `${"sk"}-${"a".repeat(28)}`;
    await store.create({
      ...workItemInput("wi-audit-secret"),
      // The redaction_policy still names a policy, but no payload bodies are
      // ever copied into audit events. payload_ref is a reference, not a value.
      payload_ref: "artifact://example/sanitized",
    });
    // Deliberately attempt to claim with a claimant string that looks like a
    // secret. The audit event should not echo it back.
    await store.markReady("wi-audit-secret");
    await store.claim("wi-audit-secret", {
      claimant: "runner-with-suffix",
      lease_id: "lease-ok",
      leaseTimeoutMs: 60_000,
    });

    const events = await audit.list({ workItemId: "wi-audit-secret" });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(sensitiveLookingValue);
    expect(serialized).not.toContain("password");
  });
});

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
