import { describe, expect, it } from "vitest";
import {
  cancelWorkItem,
  claimWorkItem,
  completeWorkItem,
  createWorkItem,
  heartbeatLease,
  markLeaseStale,
  markWorkItemReady,
  moveToNeedsApproval,
  parseWorkItem,
  releaseStaleLease,
  validateHostedRuntimeSafety,
} from "./coordination.js";
import { syntheticPlanningWorkItemInput } from "./coordination-fixtures.js";

const start = new Date("2026-01-01T00:00:00.000Z");

describe("synthetic coordination primitives", () => {
  it("accepts a valid synthetic planning-only work item", () => {
    const item = createWorkItem(syntheticPlanningWorkItemInput, start);

    expect(item.status).toBe("proposed");
    expect(item.job_class).toBe("planning_only");
    expect(item.target_repo).toBe("example-service");
  });

  it("rejects a work item with a missing required field", () => {
    const invalid = { ...syntheticPlanningWorkItemInput };
    delete (invalid as Partial<typeof syntheticPlanningWorkItemInput>).objective;

    expect(() => createWorkItem(invalid as typeof syntheticPlanningWorkItemInput, start)).toThrow();
  });

  it("grants exactly one active lease", () => {
    const ready = markWorkItemReady(createWorkItem(syntheticPlanningWorkItemInput, start), start);
    const claimed = claimWorkItem(ready, {
      claimant: "runner:example",
      lease_id: "lease-1",
      ttl_ms: 60_000,
      now: start,
    });

    expect(claimed.status).toBe("claimed");
    expect(claimed.lease?.claimed_by).toBe("runner:example");
  });

  it("rejects a second claim while a lease is active", () => {
    const ready = markWorkItemReady(createWorkItem(syntheticPlanningWorkItemInput, start), start);
    const claimed = claimWorkItem(ready, {
      claimant: "runner:example",
      lease_id: "lease-1",
      ttl_ms: 60_000,
      now: start,
    });

    expect(() =>
      claimWorkItem(claimed, {
        claimant: "runner:other",
        lease_id: "lease-2",
        ttl_ms: 60_000,
        now: start,
      }),
    ).toThrow();
  });

  it("heartbeats an active lease", () => {
    const ready = markWorkItemReady(createWorkItem(syntheticPlanningWorkItemInput, start), start);
    const claimed = claimWorkItem(ready, {
      claimant: "runner:example",
      lease_id: "lease-1",
      ttl_ms: 60_000,
      now: start,
    });
    const heartbeatAt = new Date("2026-01-01T00:00:30.000Z");
    const heartbeated = heartbeatLease(claimed, "lease-1", heartbeatAt, 120_000);

    expect(heartbeated.lease?.last_heartbeat_at).toBe(heartbeatAt.toISOString());
    expect(heartbeated.lease?.expires_at).toBe("2026-01-01T00:02:30.000Z");
  });

  it("marks and releases a stale lease", () => {
    const ready = markWorkItemReady(createWorkItem(syntheticPlanningWorkItemInput, start), start);
    const claimed = claimWorkItem(ready, {
      claimant: "runner:example",
      lease_id: "lease-1",
      ttl_ms: 60_000,
      now: start,
    });
    const afterExpiry = new Date("2026-01-01T00:02:00.000Z");
    const stale = markLeaseStale(claimed, afterExpiry);
    const released = releaseStaleLease(stale, afterExpiry);

    expect(stale.status).toBe("blocked");
    expect(released.status).toBe("ready");
    expect(released.lease).toBeNull();
  });

  it("moves claimed work to needs approval when approval is missing", () => {
    const ready = markWorkItemReady(createWorkItem(syntheticPlanningWorkItemInput, start), start);
    const claimed = claimWorkItem(ready, {
      claimant: "runner:example",
      lease_id: "lease-1",
      ttl_ms: 60_000,
      now: start,
    });

    expect(moveToNeedsApproval(claimed, start).status).toBe("needs_approval");
  });

  it("requires a sanitized outcome or explicit no-output reason for completion", () => {
    const ready = markWorkItemReady(createWorkItem(syntheticPlanningWorkItemInput, start), start);
    const claimed = claimWorkItem(ready, {
      claimant: "runner:example",
      lease_id: "lease-1",
      ttl_ms: 60_000,
      now: start,
    });

    expect(() => completeWorkItem(claimed, { lease_id: "lease-1", now: start })).toThrow();

    const completed = completeWorkItem(claimed, {
      lease_id: "lease-1",
      now: start,
      outcome: {
        summary: "Synthetic planning completed.",
        completed_at: start.toISOString(),
        artifact_refs: [],
        metadata: {},
      },
    });

    expect(completed.status).toBe("completed");
    expect(completed.sanitized_outcome_ref?.kind).toBe("sanitized_outcome");
  });

  it("prevents forbidden jobs from entering executable states", () => {
    const forbidden = createWorkItem(
      { ...syntheticPlanningWorkItemInput, id: "wi_forbidden", job_class: "forbidden" },
      start,
    );

    expect(() => markWorkItemReady(forbidden, start)).toThrow();
    expect(() => parseWorkItem({ ...forbidden, status: "ready" })).toThrow();
  });

  it("cancels non-terminal work", () => {
    const item = createWorkItem(syntheticPlanningWorkItemInput, start);

    expect(cancelWorkItem(item, start).status).toBe("cancelled");
  });
});

describe("hosted runtime guard", () => {
  it("rejects unsafe hosted environment flags", () => {
    const result = validateHostedRuntimeSafety({
      AWL_HOSTED_MODE: "true",
      AWL_ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      AWL_ENABLE_WORKSPACE_PATH_EXECUTION: "false",
      AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD: "false",
      AWL_ALLOW_BROAD_PERSONAL_TOKENS: "false",
      AWL_MAX_JOB_CLASS: "approval_required_write_action",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("AWL_ENABLE_LOCAL_COMMAND_EXECUTION must be false in hosted mode");
    expect(result.errors).toContain("AWL_MAX_JOB_CLASS exceeds hosted coordination limits without a policy layer");
  });

  it("rejects missing hosted safety flags", () => {
    const result = validateHostedRuntimeSafety({ AWL_HOSTED_MODE: "true" });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("AWL_MAX_JOB_CLASS is required in hosted mode");
  });

  it("accepts safe hosted coordination flags", () => {
    const result = validateHostedRuntimeSafety({
      AWL_HOSTED_MODE: "true",
      AWL_ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      AWL_ENABLE_WORKSPACE_PATH_EXECUTION: "false",
      AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD: "false",
      AWL_ALLOW_BROAD_PERSONAL_TOKENS: "false",
      AWL_MAX_JOB_CLASS: "planning_only",
    });

    expect(result).toEqual({ ok: true, errors: [] });
  });
});
