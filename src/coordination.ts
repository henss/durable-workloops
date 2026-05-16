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

export const ReferenceSchema = z.object({
  kind: z.string().min(1),
  ref: z.string().min(1),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).nullable().optional(),
  classification: z.string().nullable().optional(),
});

export const LeaseSchema = z.object({
  lease_id: z.string().min(1),
  claimed_by: z.string().min(1),
  claimed_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  last_heartbeat_at: z.string().datetime().nullable().optional(),
});

export const SanitizedOutcomeSchema = z.object({
  summary: z.string().min(1),
  completed_at: z.string().datetime(),
  artifact_refs: z.array(ReferenceSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const AuditEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  actor: z.string().min(1),
  occurred_at: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const WorkItemSchema = z
  .object({
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
    artifact_refs: z.array(ReferenceSchema).default([]),
    approval_ref: ReferenceSchema.nullable().optional(),
    lease: LeaseSchema.nullable().optional(),
    sanitized_outcome_ref: ReferenceSchema.nullable().optional(),
    no_output_reason: z.string().min(1).nullable().optional(),
    audit_refs: z.array(ReferenceSchema).default([]),
    redaction_policy: z.string().min(1),
    idempotency_key: z.string().min(1),
  })
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

export const InstanceCapabilitySchema = z.object({
  instance_id: z.string().min(1),
  instance_type: z.enum([
    "desktop_orchestrator",
    "laptop_orchestrator",
    "cloud_orchestrator",
    "local_runner",
    "cloud_worker",
    "human_operator",
  ]),
  hostname_alias: z.string().min(1),
  trust_boundary: z.string().min(1),
  capabilities: z.array(z.string().min(1)),
  forbidden_capabilities: z.array(z.string().min(1)),
  max_job_class: JobClassSchema,
  authority_classes: z.array(z.string().min(1)),
  can_execute_local_shell: z.boolean(),
  can_access_sensitive_local_adapters: z.boolean(),
  can_access_private_account_sessions: z.boolean(),
  can_access_credentials: z.boolean(),
  can_access_private_network: z.boolean(),
  can_deploy: z.boolean(),
  heartbeat: z.object({
    last_seen_at: z.string().datetime(),
    interval_seconds: z.number().int().min(1),
    stale_after_seconds: z.number().int().min(1),
  }),
  redaction_policy: z.string().min(1),
  public_key_ref: z.string().min(1).optional(),
  identity_ref: z.string().min(1).optional(),
}).refine((capability) => capability.public_key_ref || capability.identity_ref, {
  message: "public_key_ref or identity_ref is required",
});

export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;
export type TrustZone = z.infer<typeof TrustZoneSchema>;
export type JobClass = z.infer<typeof JobClassSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
export type Lease = z.infer<typeof LeaseSchema>;
export type SanitizedOutcome = z.infer<typeof SanitizedOutcomeSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type WorkItem = z.infer<typeof WorkItemSchema>;
export type InstanceCapability = z.infer<typeof InstanceCapabilitySchema>;

export type CreateWorkItemInput = Omit<
  WorkItem,
  | "created_at"
  | "updated_at"
  | "status"
  | "artifact_refs"
  | "approval_ref"
  | "lease"
  | "sanitized_outcome_ref"
  | "no_output_reason"
  | "audit_refs"
> & {
  created_at?: string;
  updated_at?: string;
  status?: "proposed";
  artifact_refs?: Reference[];
  approval_ref?: Reference | null;
  audit_refs?: Reference[];
};

export interface ClaimWorkItemInput {
  claimant: string;
  lease_id: string;
  ttl_ms: number;
  now?: Date;
}

export interface CompleteWorkItemInput {
  lease_id?: string;
  outcome?: SanitizedOutcome;
  no_output_reason?: string;
  outcome_ref?: Reference;
  now?: Date;
}

export interface HostedRuntimeGuardResult {
  ok: boolean;
  errors: string[];
}

export function parseWorkItem(value: unknown): WorkItem {
  return WorkItemSchema.parse(value);
}

export function validateWorkItem(value: unknown): HostedRuntimeGuardResult {
  const result = WorkItemSchema.safeParse(value);
  if (result.success) {
    return { ok: true, errors: [] };
  }
  return { ok: false, errors: result.error.issues.map((issue) => issue.message) };
}

export function parseInstanceCapability(value: unknown): InstanceCapability {
  return InstanceCapabilitySchema.parse(value);
}

export function createWorkItem(input: CreateWorkItemInput, now = new Date()): WorkItem {
  const timestamp = now.toISOString();
  return parseWorkItem({
    ...input,
    status: "proposed",
    created_at: input.created_at ?? timestamp,
    updated_at: input.updated_at ?? timestamp,
    artifact_refs: input.artifact_refs ?? [],
    approval_ref: input.approval_ref ?? null,
    lease: null,
    sanitized_outcome_ref: null,
    no_output_reason: null,
    audit_refs: input.audit_refs ?? [],
  });
}

export function markWorkItemReady(item: WorkItem, now = new Date()): WorkItem {
  assertStatus(item, ["proposed", "blocked"]);
  assertExecutableJobClass(item);
  assertNoActiveLease(item, now);
  return parseWorkItem({ ...item, status: "ready", updated_at: now.toISOString() });
}

export function claimWorkItem(item: WorkItem, input: ClaimWorkItemInput): WorkItem {
  const now = input.now ?? new Date();
  assertNoActiveLease(item, now);
  assertStatus(item, ["ready"]);
  assertExecutableJobClass(item);
  assertNoLease(item);
  const lease = makeLease(input.claimant, input.lease_id, now, input.ttl_ms);
  return parseWorkItem({
    ...item,
    status: "claimed",
    lease,
    updated_at: now.toISOString(),
  });
}

export function markWorkItemRunning(item: WorkItem, leaseId: string, now = new Date()): WorkItem {
  assertStatus(item, ["claimed"]);
  assertLeaseMatches(item, leaseId, now);
  return parseWorkItem({ ...item, status: "running", updated_at: now.toISOString() });
}

export function heartbeatLease(
  item: WorkItem,
  leaseId: string,
  now = new Date(),
  ttlMs = 15 * 60 * 1000,
): WorkItem {
  assertStatus(item, ["claimed", "running"]);
  assertLeaseMatches(item, leaseId, now);
  const lease = {
    ...item.lease,
    last_heartbeat_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttlMs).toISOString(),
  };
  return parseWorkItem({ ...item, lease, updated_at: now.toISOString() });
}

export function markLeaseStale(item: WorkItem, now = new Date()): WorkItem {
  if (!item.lease) {
    throw new Error("work item has no lease");
  }
  if (isLeaseActive(item.lease, now)) {
    throw new Error("lease is still active");
  }
  return parseWorkItem({ ...item, status: "blocked", updated_at: now.toISOString() });
}

export function releaseStaleLease(item: WorkItem, now = new Date()): WorkItem {
  if (!item.lease) {
    throw new Error("work item has no lease");
  }
  if (isLeaseActive(item.lease, now)) {
    throw new Error("lease is still active");
  }
  assertExecutableJobClass(item);
  return parseWorkItem({ ...item, status: "ready", lease: null, updated_at: now.toISOString() });
}

export function moveToNeedsApproval(item: WorkItem, now = new Date()): WorkItem {
  assertStatus(item, ["claimed", "running"]);
  return parseWorkItem({ ...item, status: "needs_approval", updated_at: now.toISOString() });
}

export function completeWorkItem(item: WorkItem, input: CompleteWorkItemInput): WorkItem {
  const now = input.now ?? new Date();
  assertStatus(item, ["claimed", "running"]);
  if (input.lease_id) {
    assertLeaseMatches(item, input.lease_id, now);
  }
  if (!input.outcome && !input.outcome_ref && !input.no_output_reason) {
    throw new Error("completion requires a sanitized outcome or explicit no-output reason");
  }
  const outcomeRef =
    input.outcome_ref ??
    (input.outcome
      ? {
          kind: "sanitized_outcome",
          ref: `outcome:${item.id}`,
          classification: "sanitized",
        }
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

export function failWorkItem(item: WorkItem, sanitizedReason: string, now = new Date()): WorkItem {
  if (!sanitizedReason.trim()) {
    throw new Error("sanitized failure reason is required");
  }
  assertNonTerminal(item);
  return parseWorkItem({
    ...item,
    status: "failed",
    lease: null,
    no_output_reason: sanitizedReason,
    updated_at: now.toISOString(),
  });
}

export function cancelWorkItem(item: WorkItem, now = new Date()): WorkItem {
  assertNonTerminal(item);
  return parseWorkItem({ ...item, status: "cancelled", lease: null, updated_at: now.toISOString() });
}

export function validateHostedRuntimeSafety(env: Record<string, string | undefined>): HostedRuntimeGuardResult {
  if (env.AWL_HOSTED_MODE !== "true") {
    return { ok: true, errors: [] };
  }

  const errors: string[] = [];
  requireFlagValue(env, "AWL_ENABLE_LOCAL_COMMAND_EXECUTION", "false", errors);
  requireFlagValue(env, "AWL_ENABLE_WORKSPACE_PATH_EXECUTION", "false", errors);
  requireFlagValue(env, "AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD", "false", errors);
  requireFlagValue(env, "AWL_ALLOW_BROAD_PERSONAL_TOKENS", "false", errors);

  const maxJobClass = env.AWL_MAX_JOB_CLASS;
  if (!maxJobClass) {
    errors.push("AWL_MAX_JOB_CLASS is required in hosted mode");
  } else if (!JobClassSchema.safeParse(maxJobClass).success) {
    errors.push("AWL_MAX_JOB_CLASS is not recognized");
  } else if (!["planning_only", "read_only_sanitized"].includes(maxJobClass)) {
    errors.push("AWL_MAX_JOB_CLASS exceeds hosted coordination limits without a policy layer");
  }

  return { ok: errors.length === 0, errors };
}

export function assertHostedRuntimeSafety(env: Record<string, string | undefined>): void {
  const result = validateHostedRuntimeSafety(env);
  if (!result.ok) {
    throw new Error(`Hosted runtime safety check failed: ${result.errors.join("; ")}`);
  }
}

function makeLease(claimant: string, leaseId: string, now: Date, ttlMs: number): Lease {
  if (ttlMs <= 0) {
    throw new Error("lease ttl must be positive");
  }
  return {
    lease_id: leaseId,
    claimed_by: claimant,
    claimed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttlMs).toISOString(),
    last_heartbeat_at: now.toISOString(),
  };
}

function isExecutableStatus(status: WorkItemStatus): boolean {
  return status === "ready" || status === "claimed" || status === "running";
}

function assertExecutableJobClass(item: WorkItem): void {
  if (item.job_class === "forbidden") {
    throw new Error("forbidden job class cannot become executable");
  }
}

function assertStatus(item: WorkItem, allowed: WorkItemStatus[]): void {
  if (!allowed.includes(item.status)) {
    throw new Error(`invalid work item status transition from ${item.status}`);
  }
}

function assertNoLease(item: WorkItem): void {
  if (item.lease) {
    throw new Error("work item already has a lease");
  }
}

function assertNoActiveLease(item: WorkItem, now: Date): void {
  if (item.lease && isLeaseActive(item.lease, now)) {
    throw new Error("work item has an active lease");
  }
}

function assertLeaseMatches(item: WorkItem, leaseId: string, now: Date): asserts item is WorkItem & { lease: Lease } {
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

function isLeaseActive(lease: Lease, now: Date): boolean {
  return Date.parse(lease.expires_at) > now.getTime();
}

function assertNonTerminal(item: WorkItem): void {
  if (item.status === "completed" || item.status === "failed" || item.status === "cancelled") {
    throw new Error(`work item is already terminal: ${item.status}`);
  }
}

function requireFlagValue(
  env: Record<string, string | undefined>,
  key: string,
  expected: string,
  errors: string[],
): void {
  if (env[key] !== expected) {
    errors.push(`${key} must be ${expected} in hosted mode`);
  }
}
