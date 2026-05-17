import { z } from "zod";

export const WorkItemStatusValues = [
  "proposed",
  "ready",
  "claimed",
  "running",
  "blocked",
  "needs_approval",
  "completed",
  "failed",
  "cancelled",
] as const;

export const TrustZoneValues = [
  "A_local_only",
  "B_cloud_private",
  "C_public_saas_candidate",
  "split_required",
  "unknown",
] as const;

export const JobClassValues = [
  "planning_only",
  "read_only_sanitized",
  "approval_required_write_action",
  "forbidden",
] as const;

export const WorkItemStatusSchema = z.enum(WorkItemStatusValues);
export const TrustZoneSchema = z.enum(TrustZoneValues);
export const JobClassSchema = z.enum(JobClassValues);

export const WorkItemReferenceSchema = z.object({
  kind: z.string().min(1),
  ref: z.string().min(1),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).nullable().optional(),
  classification: z.string().nullable().optional(),
});

export const WorkItemLeaseSchema = z.object({
  lease_id: z.string().min(1),
  claimed_by: z.string().min(1),
  claimed_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  last_heartbeat_at: z.string().datetime().nullable().optional(),
});

export const SanitizedOutcomeSchema = z.object({
  summary: z.string().min(1),
  completed_at: z.string().datetime(),
  artifact_refs: z.array(WorkItemReferenceSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const WorkItemBaseSchema = z.object({
    id: z.string().min(1),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    created_by: z.string().min(1),
    target_repo: z.string().min(1),
    title: z.string().min(1),
    objective: z.string().min(1),
    status: WorkItemStatusSchema,
    priority: z.enum(["low", "normal", "high", "urgent"]),
    trust_zone: TrustZoneSchema,
    job_class: JobClassSchema,
    authority_class: z.string().min(1),
    required_capabilities: z.array(z.string().min(1)),
    payload_ref: z.string().nullable().optional(),
    artifact_refs: z.array(WorkItemReferenceSchema).default([]),
    approval_ref: WorkItemReferenceSchema.nullable().optional(),
    lease: WorkItemLeaseSchema.nullable().optional(),
    sanitized_outcome_ref: WorkItemReferenceSchema.nullable().optional(),
    no_output_reason: z.string().min(1).nullable().optional(),
    audit_refs: z.array(WorkItemReferenceSchema).default([]),
    redaction_policy: z.string().min(1),
    idempotency_key: z.string().min(1),
  });

export const WorkItemSchema = WorkItemBaseSchema
  .superRefine((item, context) => {
    if (item.job_class === "forbidden" && isExecutableStatus(item.status)) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "forbidden job class cannot enter an executable state",
      });
    }
    if (item.status === "completed" && !item.sanitized_outcome_ref && !item.no_output_reason) {
      context.addIssue({
        code: "custom",
        path: ["sanitized_outcome_ref"],
        message: "completion requires a sanitized outcome reference or explicit no-output reason",
      });
    }
    if ((item.status === "claimed" || item.status === "running") && !item.lease) {
      context.addIssue({
        code: "custom",
        path: ["lease"],
        message: "claimed or running work item requires an active lease",
      });
    }
  });

export const CreateWorkItemRequestSchema = WorkItemBaseSchema.omit({
  created_at: true,
  updated_at: true,
  status: true,
  artifact_refs: true,
  approval_ref: true,
  lease: true,
  sanitized_outcome_ref: true,
  no_output_reason: true,
  audit_refs: true,
}).extend({
  artifact_refs: z.array(WorkItemReferenceSchema).default([]).optional(),
});

export const ClaimWorkItemRequestSchema = z.object({
  claimant: z.string().min(1),
  lease_id: z.string().min(1).optional(),
});

export const HeartbeatWorkItemRequestSchema = z.object({
  lease_id: z.string().min(1),
});

export const CompleteWorkItemRequestSchema = z
  .object({
    lease_id: z.string().min(1).optional(),
    outcome: SanitizedOutcomeSchema.optional(),
    no_output_reason: z.string().min(1).optional(),
    outcome_ref: WorkItemReferenceSchema.optional(),
  })
  .refine((body) => body.outcome || body.no_output_reason || body.outcome_ref, {
    message: "completion requires a sanitized outcome or explicit no-output reason",
  });

export const FailWorkItemRequestSchema = z.object({
  reason: z.string().min(1),
});

export const WorkItemResponseSchema = z.object({
  work_item: WorkItemSchema,
});

export const WorkItemAuditEventTypeValues = [
  "work_item_created",
  "work_item_ready",
  "work_item_claimed",
  "work_item_heartbeat",
  "work_item_lease_released",
  "work_item_needs_approval",
  "work_item_completed",
  "work_item_failed",
  "work_item_cancelled",
  "transition_rejected",
  "auth_rejected",
  "config_rejected",
] as const;

export const WorkItemAuditEventTypeSchema = z.enum(WorkItemAuditEventTypeValues);

export const WorkItemAuditEventSchema = z.object({
  id: z.string().min(1),
  created_at: z.string().datetime(),
  event_type: WorkItemAuditEventTypeSchema,
  work_item_id: z.string().min(1).nullable().optional(),
  actor_ref: z.string().min(1).nullable().optional(),
  instance_ref: z.string().min(1).nullable().optional(),
  status_before: WorkItemStatusSchema.nullable().optional(),
  status_after: WorkItemStatusSchema.nullable().optional(),
  job_class: JobClassSchema.nullable().optional(),
  trust_zone: TrustZoneSchema.nullable().optional(),
  authority_class: z.string().min(1).nullable().optional(),
  redaction_policy: z.string().min(1).nullable().optional(),
  sanitized_reason: z.string().min(1).nullable().optional(),
  artifact_refs: z.array(WorkItemReferenceSchema).default([]),
  approval_ref: WorkItemReferenceSchema.nullable().optional(),
  receipt_ref: WorkItemReferenceSchema.nullable().optional(),
  metadata_hash: z.string().min(1).nullable().optional(),
  payload_hash: z.string().min(1).nullable().optional(),
});

export type WorkItemAuditEventType = z.infer<typeof WorkItemAuditEventTypeSchema>;
export type WorkItemAuditEvent = z.infer<typeof WorkItemAuditEventSchema>;

export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;
export type TrustZone = z.infer<typeof TrustZoneSchema>;
export type JobClass = z.infer<typeof JobClassSchema>;
export type WorkItemReference = z.infer<typeof WorkItemReferenceSchema>;
export type WorkItemLease = z.infer<typeof WorkItemLeaseSchema>;
export type SanitizedOutcome = z.infer<typeof SanitizedOutcomeSchema>;
export type WorkItem = z.infer<typeof WorkItemSchema>;
export type CreateWorkItemRequest = z.infer<typeof CreateWorkItemRequestSchema>;
export type ClaimWorkItemRequest = z.infer<typeof ClaimWorkItemRequestSchema>;
export type CompleteWorkItemRequest = z.infer<typeof CompleteWorkItemRequestSchema>;

export function createWorkItem(input: CreateWorkItemRequest, now = new Date()): WorkItem {
  const timestamp = now.toISOString();
  return parseWorkItem({
    ...input,
    status: "proposed",
    created_at: timestamp,
    updated_at: timestamp,
    approval_ref: null,
    lease: null,
    sanitized_outcome_ref: null,
    no_output_reason: null,
    audit_refs: [],
  });
}

export function parseWorkItem(value: unknown): WorkItem {
  return WorkItemSchema.parse(value);
}

export function markWorkItemReady(item: WorkItem, now = new Date()): WorkItem {
  assertStatus(item, ["proposed", "blocked"]);
  assertExecutableJobClass(item);
  return parseWorkItem({ ...item, status: "ready", updated_at: now.toISOString() });
}

export function claimWorkItem(
  item: WorkItem,
  input: { claimant: string; lease_id: string; ttl_ms: number; now?: Date },
): WorkItem {
  const now = input.now ?? new Date();
  if (item.lease && isLeaseActive(item.lease, now)) {
    throw new Error("work item already has an active lease");
  }
  assertStatus(item, ["ready"]);
  assertExecutableJobClass(item);
  const lease: WorkItemLease = {
    lease_id: input.lease_id,
    claimed_by: input.claimant,
    claimed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + input.ttl_ms).toISOString(),
    last_heartbeat_at: now.toISOString(),
  };
  return parseWorkItem({ ...item, status: "claimed", lease, updated_at: now.toISOString() });
}

export function heartbeatWorkItemLease(
  item: WorkItem,
  input: { lease_id: string; ttl_ms: number; now?: Date },
): WorkItem {
  const now = input.now ?? new Date();
  assertStatus(item, ["claimed", "running"]);
  assertLeaseMatches(item, input.lease_id, now);
  return parseWorkItem({
    ...item,
    lease: {
      ...item.lease,
      last_heartbeat_at: now.toISOString(),
      expires_at: new Date(now.getTime() + input.ttl_ms).toISOString(),
    },
    updated_at: now.toISOString(),
  });
}

export function releaseStaleWorkItemLease(item: WorkItem, now = new Date()): WorkItem {
  if (!item.lease) {
    throw new Error("work item has no lease");
  }
  if (isLeaseActive(item.lease, now)) {
    throw new Error("lease is still active");
  }
  assertExecutableJobClass(item);
  return parseWorkItem({ ...item, status: "ready", lease: null, updated_at: now.toISOString() });
}

export function moveWorkItemToNeedsApproval(item: WorkItem, now = new Date()): WorkItem {
  assertStatus(item, ["claimed", "running"]);
  return parseWorkItem({ ...item, status: "needs_approval", updated_at: now.toISOString() });
}

export function completeWorkItem(
  item: WorkItem,
  input: CompleteWorkItemRequest & { now?: Date },
): WorkItem {
  const now = input.now ?? new Date();
  assertStatus(item, ["claimed", "running"]);
  if (input.lease_id) {
    assertLeaseMatches(item, input.lease_id, now);
  }
  const outcomeRef =
    input.outcome_ref ??
    (input.outcome
      ? { kind: "sanitized_outcome", ref: `outcome:${item.id}`, classification: "sanitized" }
      : null);
  return parseWorkItem({
    ...item,
    status: "completed",
    lease: null,
    sanitized_outcome_ref: outcomeRef,
    no_output_reason: input.no_output_reason ?? null,
    updated_at: now.toISOString(),
  });
}

export function failWorkItem(item: WorkItem, reason: string, now = new Date()): WorkItem {
  if (!reason.trim()) {
    throw new Error("sanitized failure reason is required");
  }
  assertNonTerminal(item);
  return parseWorkItem({
    ...item,
    status: "failed",
    lease: null,
    no_output_reason: reason,
    updated_at: now.toISOString(),
  });
}

export function cancelWorkItem(item: WorkItem, now = new Date()): WorkItem {
  assertNonTerminal(item);
  return parseWorkItem({ ...item, status: "cancelled", lease: null, updated_at: now.toISOString() });
}

function isExecutableStatus(status: WorkItemStatus): boolean {
  return status === "ready" || status === "claimed" || status === "running";
}

function assertExecutableJobClass(item: WorkItem): void {
  if (item.job_class === "forbidden") {
    throw new Error("forbidden job class cannot become executable");
  }
  if (item.job_class === "approval_required_write_action") {
    throw new Error("approval-required write actions are not executable in this phase");
  }
}

function assertStatus(item: WorkItem, allowed: WorkItemStatus[]): void {
  if (!allowed.includes(item.status)) {
    throw new Error(`invalid work item status transition from ${item.status}`);
  }
}

function assertLeaseMatches(item: WorkItem, leaseId: string, now: Date): asserts item is WorkItem & { lease: WorkItemLease } {
  if (!item.lease) {
    throw new Error("work item has no lease");
  }
  if (item.lease.lease_id !== leaseId) {
    throw new Error("lease id does not match");
  }
  if (!isLeaseActive(item.lease, now)) {
    throw new Error("lease is stale");
  }
}

function isLeaseActive(lease: WorkItemLease, now: Date): boolean {
  return Date.parse(lease.expires_at) > now.getTime();
}

function assertNonTerminal(item: WorkItem): void {
  if (item.status === "completed" || item.status === "failed" || item.status === "cancelled") {
    throw new Error(`work item is already terminal: ${item.status}`);
  }
}
