import crypto from "node:crypto";
import {
  WorkItemAuditEventSchema,
  type ClaimWorkItemRequest,
  type CompleteWorkItemRequest,
  type CreateWorkItemRequest,
  type WorkItem,
  type WorkItemAuditEvent,
  type WorkItemAuditEventType,
  type WorkItemReference,
  type WorkItemStatus,
} from "@agent-workloops/api";
import type { WorkItemStore } from "./work-item-store.js";

/**
 * `WorkItemAuditStore` is the append-oriented audit stream for hosted work
 * item coordination. Implementations MUST treat events as immutable and MUST
 * never persist secret values, raw private logs, or full request bodies.
 *
 * The interface intentionally limits writes to `record` and queries to a
 * filter-based `list` so a future cloud-grade audit store can implement the
 * same surface against a managed append-only log without requiring caller
 * changes.
 */
export interface WorkItemAuditStore {
  record(event: WorkItemAuditEventInput): Promise<WorkItemAuditEvent>;
  list(filter?: WorkItemAuditFilter): Promise<WorkItemAuditEvent[]>;
}

export type WorkItemAuditEventInput = Omit<WorkItemAuditEvent, "id" | "created_at">;

export interface WorkItemAuditFilter {
  workItemId?: string;
  eventTypes?: WorkItemAuditEventType[];
}

export class InMemoryWorkItemAuditStore implements WorkItemAuditStore {
  private readonly events: WorkItemAuditEvent[] = [];

  async record(input: WorkItemAuditEventInput): Promise<WorkItemAuditEvent> {
    const event = WorkItemAuditEventSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    });
    this.events.push(event);
    return event;
  }

  async list(filter: WorkItemAuditFilter = {}): Promise<WorkItemAuditEvent[]> {
    return this.events
      .filter((event) => !filter.workItemId || event.work_item_id === filter.workItemId)
      .filter(
        (event) =>
          !filter.eventTypes ||
          filter.eventTypes.length === 0 ||
          filter.eventTypes.includes(event.event_type),
      )
      .map((event) => structuredClone(event));
  }
}

/**
 * Helper for building work-item-derived audit metadata.
 *
 * This deliberately copies only public-safe metadata from the work item and
 * NEVER copies the payload reference body, raw artifact contents, raw
 * failure traces, secret-like strings, or the request body.
 */
export function workItemAuditMetadata(item: WorkItem): Pick<
  WorkItemAuditEvent,
  | "job_class"
  | "trust_zone"
  | "authority_class"
  | "redaction_policy"
  | "artifact_refs"
  | "approval_ref"
> {
  return {
    job_class: item.job_class,
    trust_zone: item.trust_zone,
    authority_class: item.authority_class,
    redaction_policy: item.redaction_policy,
    artifact_refs: redactReferences(item.artifact_refs),
    approval_ref: redactReference(item.approval_ref ?? undefined),
  };
}

function redactReference(ref?: WorkItemReference | null): WorkItemReference | null {
  if (!ref) {
    return null;
  }
  return {
    kind: ref.kind,
    ref: ref.ref,
    sha256: ref.sha256 ?? null,
    classification: ref.classification ?? null,
  };
}

function redactReferences(refs: WorkItemReference[]): WorkItemReference[] {
  return refs.map((ref) => ({
    kind: ref.kind,
    ref: ref.ref,
    sha256: ref.sha256 ?? null,
    classification: ref.classification ?? null,
  }));
}

/**
 * Hash a sanitized failure or no-output reason into a `sanitized_reason`
 * audit field. Limited to a short, redaction-policy-compliant string. We
 * keep reason text only when it is short and is already produced by our
 * lifecycle helpers (e.g. release-stale, fail). We do not include free-form
 * payload values.
 */
export function sanitizedReason(reason: string | undefined | null): string | null {
  if (!reason) {
    return null;
  }
  const trimmed = reason.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 240) {
    return `${trimmed.slice(0, 200)}...[truncated]`;
  }
  return trimmed;
}

/**
 * Stable hash for arbitrary public-safe input. Used for `payload_hash` and
 * `metadata_hash` audit fields. We hash by JSON-stringifying a redacted
 * subset of the input so the hash is reproducible and never leaks values.
 */
export function shortHash(input: unknown): string {
  const text = JSON.stringify(input ?? null);
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/**
 * `RecordingWorkItemStore` is a thin decorator around any `WorkItemStore`
 * implementation that records audit events for each transition. It uses
 * the pure lifecycle helpers in `@agent-workloops/api` to produce the
 * before/after status pair without re-implementing transition logic.
 *
 * Rejected transitions surface as a thrown lifecycle error from the inner
 * store. We catch the error long enough to record a `transition_rejected`
 * event with a sanitized reason, then re-throw. The audit event never
 * contains the rejected request body.
 */
export class RecordingWorkItemStore implements WorkItemStore {
  constructor(
    private readonly inner: WorkItemStore,
    private readonly audit: WorkItemAuditStore,
    private readonly options: {
      instanceRef?: string;
    } = {},
  ) {}

  async create(input: CreateWorkItemRequest): Promise<WorkItem> {
    try {
      const item = await this.inner.create(input);
      await this.audit.record({
        event_type: "work_item_created",
        work_item_id: item.id,
        actor_ref: item.created_by,
        instance_ref: this.options.instanceRef ?? null,
        status_before: null,
        status_after: item.status,
        ...workItemAuditMetadata(item),
        sanitized_reason: null,
        receipt_ref: null,
        metadata_hash: shortHash({
          target_repo: item.target_repo,
          priority: item.priority,
          required_capabilities: item.required_capabilities,
        }),
        payload_hash: shortHash({ payload_ref: item.payload_ref ?? null }),
      });
      return item;
    } catch (error) {
      await this.recordRejected({
        workItemId: input.id,
        actorRef: input.created_by,
        attemptedEvent: "work_item_created",
        statusBefore: null,
        error,
      });
      throw error;
    }
  }

  list(): Promise<WorkItem[]> {
    return this.inner.list();
  }

  get(id: string): Promise<WorkItem | undefined> {
    return this.inner.get(id);
  }

  markReady(id: string): Promise<WorkItem> {
    return this.runTransition({
      id,
      eventType: "work_item_ready",
      run: () => this.inner.markReady(id),
    });
  }

  claim(
    id: string,
    input: ClaimWorkItemRequest & { leaseTimeoutMs: number },
  ): Promise<WorkItem> {
    return this.runTransition({
      id,
      eventType: "work_item_claimed",
      actorRef: input.claimant,
      run: () => this.inner.claim(id, input),
    });
  }

  heartbeat(id: string, input: { lease_id: string; leaseTimeoutMs: number }): Promise<WorkItem> {
    return this.runTransition({
      id,
      eventType: "work_item_heartbeat",
      run: () => this.inner.heartbeat(id, input),
    });
  }

  releaseStale(id: string): Promise<WorkItem> {
    return this.runTransition({
      id,
      eventType: "work_item_lease_released",
      run: () => this.inner.releaseStale(id),
    });
  }

  moveToNeedsApproval(id: string): Promise<WorkItem> {
    return this.runTransition({
      id,
      eventType: "work_item_needs_approval",
      run: () => this.inner.moveToNeedsApproval(id),
    });
  }

  complete(id: string, input: CompleteWorkItemRequest): Promise<WorkItem> {
    return this.runTransition({
      id,
      eventType: "work_item_completed",
      reasonForEvent: (item) => sanitizedReason(item.no_output_reason ?? null),
      run: () => this.inner.complete(id, input),
    });
  }

  fail(id: string, reason: string): Promise<WorkItem> {
    return this.runTransition({
      id,
      eventType: "work_item_failed",
      reasonForEvent: () => sanitizedReason(reason),
      run: () => this.inner.fail(id, reason),
    });
  }

  cancel(id: string): Promise<WorkItem> {
    return this.runTransition({
      id,
      eventType: "work_item_cancelled",
      run: () => this.inner.cancel(id),
    });
  }

  private async runTransition(params: {
    id: string;
    eventType: WorkItemAuditEventType;
    actorRef?: string | null;
    reasonForEvent?: (item: WorkItem) => string | null;
    run: () => Promise<WorkItem>;
  }): Promise<WorkItem> {
    const before = await this.inner.get(params.id);
    const statusBefore: WorkItemStatus | null = before?.status ?? null;
    try {
      const after = await params.run();
      await this.audit.record({
        event_type: params.eventType,
        work_item_id: after.id,
        actor_ref: params.actorRef ?? after.lease?.claimed_by ?? null,
        instance_ref: this.options.instanceRef ?? null,
        status_before: statusBefore,
        status_after: after.status,
        ...workItemAuditMetadata(after),
        sanitized_reason: params.reasonForEvent ? params.reasonForEvent(after) : null,
        receipt_ref: null,
        metadata_hash: null,
        payload_hash: null,
      });
      return after;
    } catch (error) {
      await this.recordRejected({
        workItemId: params.id,
        actorRef: params.actorRef ?? null,
        attemptedEvent: params.eventType,
        statusBefore,
        error,
      });
      throw error;
    }
  }

  private async recordRejected(params: {
    workItemId: string;
    actorRef: string | null | undefined;
    attemptedEvent: WorkItemAuditEventType;
    statusBefore: WorkItemStatus | null;
    error: unknown;
  }): Promise<void> {
    const reason =
      params.error instanceof Error ? sanitizedReason(params.error.message) : null;
    await this.audit.record({
      event_type: "transition_rejected",
      work_item_id: params.workItemId,
      actor_ref: params.actorRef ?? null,
      instance_ref: this.options.instanceRef ?? null,
      status_before: params.statusBefore,
      status_after: null,
      job_class: null,
      trust_zone: null,
      authority_class: null,
      redaction_policy: null,
      artifact_refs: [],
      approval_ref: null,
      receipt_ref: null,
      sanitized_reason: reason ?? params.attemptedEvent,
      metadata_hash: null,
      payload_hash: null,
    });
  }
}
