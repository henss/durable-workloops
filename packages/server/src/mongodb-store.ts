import type { ServerConfig } from "./config.js";
import type { PlanStore } from "./store.js";
import type { AuditEvent, JsonValue, PlanRecord, WorkLoop } from "@durable-workloops/api";
import { AuditEventSchema, PlanRecordSchema } from "@durable-workloops/api";
import crypto from "node:crypto";
import { MongoClient, type Collection } from "mongodb";

export async function createMongoPlanStore(config: ServerConfig): Promise<PlanStore> {
  if (config.persistence.kind !== "mongodb") {
    throw new Error("MongoDB persistence config is required.");
  }
  const client = new MongoClient(config.persistence.connectionString);
  await client.connect();
  const db = client.db(config.persistence.database);
  const store = new MongoPlanStore(db.collection("plans"), db.collection("audit"));
  await store.initialize();
  return store;
}

export class MongoPlanStore implements PlanStore {
  constructor(
    private readonly plans: Collection<{ _id: string; record: PlanRecord; createdAt: string; updatedAt: string }>,
    private readonly audit: Collection<{ _id: string; planId?: string; record: AuditEvent; createdAt: string }>,
  ) {}

  async initialize(): Promise<void> {
    await this.plans.createIndex({ createdAt: 1 });
    await this.plans.createIndex({ "record.status": 1, "record.approvalStatus": 1 });
    await this.plans.createIndex({ "record.workLoop.projectId": 1 });
    await this.audit.createIndex({ planId: 1, createdAt: 1 });
  }

  async createPlan(input: {
    workLoop: WorkLoop;
    approvalRequired: boolean;
    approvalStatus: PlanRecord["approvalStatus"];
    submitterUserId?: string;
    submitterTokenId?: string;
  }): Promise<PlanRecord> {
    const now = new Date().toISOString();
    const plan = PlanRecordSchema.parse({
      id: crypto.randomUUID(),
      workLoop: input.workLoop,
      submitterUserId: input.submitterUserId,
      submitterTokenId: input.submitterTokenId,
      approvalRequired: input.approvalRequired,
      approvalStatus: input.approvalStatus,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    await this.plans.insertOne({ _id: plan.id, record: plan, createdAt: now, updatedAt: now });
    await this.appendAudit({
      planId: plan.id,
      actorUserId: input.submitterUserId,
      actorTokenId: input.submitterTokenId,
      type: "submit",
      metadata: { approvalRequired: input.approvalRequired },
    });
    return plan;
  }

  async listPlans(filter: { includeCompleted?: boolean } = {}): Promise<PlanRecord[]> {
    const query = filter.includeCompleted ? {} : { "record.status": { $ne: "completed" } };
    return (await this.plans.find(query).sort({ createdAt: 1 }).toArray()).map((doc) =>
      PlanRecordSchema.parse(doc.record),
    );
  }

  async listCompletedPlans(): Promise<PlanRecord[]> {
    return (
      await this.plans.find({ "record.status": "completed" }).sort({ updatedAt: -1 }).toArray()
    ).map((doc) => PlanRecordSchema.parse(doc.record));
  }

  async getPlan(planId: string): Promise<PlanRecord | undefined> {
    const doc = await this.plans.findOne({ _id: planId });
    return doc ? PlanRecordSchema.parse(doc.record) : undefined;
  }

  async approvePlan(planId: string, actor: { userId?: string; tokenId?: string }, reason?: string): Promise<PlanRecord> {
    return this.updatePlan(planId, actor, "approve", reason ? { reason } : {}, (plan) => ({
      ...plan,
      approvalStatus: "approved",
      updatedAt: new Date().toISOString(),
    }));
  }

  async rejectPlan(planId: string, actor: { userId?: string; tokenId?: string }, reason?: string): Promise<PlanRecord> {
    return this.updatePlan(planId, actor, "reject", reason ? { reason } : {}, (plan) => ({
      ...plan,
      approvalStatus: "rejected",
      updatedAt: new Date().toISOString(),
    }));
  }

  async claimNextPlan(input: {
    clientTokenId: string;
    leaseTimeoutMs: number;
    projectId?: string;
  }): Promise<{ plan: PlanRecord; leaseId: string } | undefined> {
    const now = new Date();
    const leaseId = crypto.randomUUID();
    const lockedAt = now.toISOString();
    const filter = {
      ...(input.projectId ? { "record.workLoop.projectId": input.projectId } : {}),
      "record.approvalStatus": { $in: ["approved", "not_required"] },
      $or: [
        { "record.status": "queued" },
        { "record.status": "locked", "record.lock.expiresAt": { $lte: lockedAt } },
      ],
    };
    const doc = await this.plans.findOneAndUpdate(
      filter,
      [
        {
          $set: {
            "record.status": "locked",
            "record.lock": {
              leaseId,
              clientTokenId: input.clientTokenId,
              lockedAt,
              expiresAt: new Date(now.getTime() + input.leaseTimeoutMs).toISOString(),
            },
            "record.updatedAt": lockedAt,
            updatedAt: lockedAt,
          },
        },
      ],
      { sort: { createdAt: 1 }, returnDocument: "after" },
    );
    if (!doc) {
      return undefined;
    }
    const plan = PlanRecordSchema.parse(doc.record);
    await this.appendAudit({
      planId: plan.id,
      actorTokenId: input.clientTokenId,
      type: "claim",
      metadata: { leaseId },
    });
    return { plan, leaseId };
  }

  async extendLease(input: {
    planId: string;
    leaseId: string;
    clientTokenId: string;
    leaseTimeoutMs: number;
  }): Promise<PlanRecord> {
    return this.updatePlan(
      input.planId,
      { tokenId: input.clientTokenId },
      "heartbeat",
      { leaseId: input.leaseId },
      (plan) => {
        assertLease(plan, input.leaseId, input.clientTokenId);
        const now = new Date();
        return {
          ...plan,
          lock: {
            ...plan.lock,
            leaseId: input.leaseId,
            clientTokenId: input.clientTokenId,
            lockedAt: plan.lock?.lockedAt ?? now.toISOString(),
            expiresAt: new Date(now.getTime() + input.leaseTimeoutMs).toISOString(),
          },
          updatedAt: now.toISOString(),
        };
      },
    );
  }

  async completePlan(input: {
    planId: string;
    leaseId: string;
    clientTokenId: string;
    metadata: JsonValue;
  }): Promise<PlanRecord> {
    return this.updatePlan(
      input.planId,
      { tokenId: input.clientTokenId },
      "complete",
      input.metadata,
      (plan) => {
        assertLease(plan, input.leaseId, input.clientTokenId);
        const now = new Date().toISOString();
        return {
          ...plan,
          status: "completed",
          lock: undefined,
          completion: {
            completedAt: now,
            completedByTokenId: input.clientTokenId,
            metadata: input.metadata,
          },
          updatedAt: now,
        };
      },
    );
  }

  async appendAudit(event: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent> {
    const fullEvent = AuditEventSchema.parse({
      ...event,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    await this.audit.insertOne({
      _id: fullEvent.id,
      planId: fullEvent.planId,
      record: fullEvent,
      createdAt: fullEvent.createdAt,
    });
    return fullEvent;
  }

  async listAudit(planId?: string): Promise<AuditEvent[]> {
    const docs = await this.audit
      .find(planId ? { planId } : {})
      .sort({ createdAt: 1 })
      .toArray();
    return docs.map((doc) => AuditEventSchema.parse(doc.record));
  }

  private async updatePlan(
    planId: string,
    actor: { userId?: string; tokenId?: string },
    type: AuditEvent["type"],
    metadata: JsonValue,
    update: (plan: PlanRecord) => PlanRecord,
  ): Promise<PlanRecord> {
    const current = await this.getPlan(planId);
    if (!current) {
      throw new Error(`Plan not found: ${planId}`);
    }
    const updated = PlanRecordSchema.parse(update(current));
    const result = await this.plans.findOneAndUpdate(
      { _id: planId },
      { $set: { record: updated, updatedAt: updated.updatedAt } },
      { returnDocument: "after" },
    );
    if (!result) {
      throw new Error(`Plan not found: ${planId}`);
    }
    await this.appendAudit({
      planId,
      actorUserId: actor.userId,
      actorTokenId: actor.tokenId,
      type,
      metadata,
    });
    return PlanRecordSchema.parse(result.record);
  }
}

function assertLease(plan: PlanRecord, leaseId: string, clientTokenId: string): void {
  if (
    plan.status !== "locked" ||
    !plan.lock ||
    plan.lock.leaseId !== leaseId ||
    plan.lock.clientTokenId !== clientTokenId ||
    new Date(plan.lock.expiresAt) <= new Date()
  ) {
    throw new Error("Plan lease is not active for this client token.");
  }
}
