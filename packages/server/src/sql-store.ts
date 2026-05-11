import type { ServerConfig } from "./config.js";
import type { PlanStore } from "./store.js";
import type { AuditEvent, JsonValue, PlanRecord, WorkLoop } from "@agent-workloops/api";
import { AuditEventSchema, PlanRecordSchema } from "@agent-workloops/api";
import crypto from "node:crypto";
import postgres from "postgres";

export async function createSqlPlanStore(config: ServerConfig): Promise<PlanStore> {
  if (config.persistence.kind !== "sql") {
    throw new Error("SQL persistence config is required.");
  }
  const sql = postgres(config.persistence.connectionString, { max: 5 });
  const store = new SqlPlanStore(sql);
  await store.initialize();
  return store;
}

type Sql = ReturnType<typeof postgres>;
type SqlLike = any;

export class SqlPlanStore implements PlanStore {
  constructor(private readonly sql: Sql) {}

  async initialize(): Promise<void> {
    await this.sql`
      create table if not exists durable_workloop_plans (
        id text primary key,
        record jsonb not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      )
    `;
    await this.sql`
      create table if not exists durable_workloop_audit (
        id text primary key,
        plan_id text,
        record jsonb not null,
        created_at timestamptz not null
      )
    `;
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
    await this.sql.begin(async (tx) => {
      await tx`
        insert into durable_workloop_plans (id, record, created_at, updated_at)
        values (${plan.id}, ${tx.json(plan)}, ${now}, ${now})
      `;
      await insertAudit(tx, {
        planId: plan.id,
        actorUserId: input.submitterUserId,
        actorTokenId: input.submitterTokenId,
        type: "submit",
        metadata: { approvalRequired: input.approvalRequired },
      });
    });
    return plan;
  }

  async listPlans(filter: { includeCompleted?: boolean } = {}): Promise<PlanRecord[]> {
    const rows = filter.includeCompleted
      ? await this.sql`select record from durable_workloop_plans order by created_at asc`
      : await this.sql`
          select record from durable_workloop_plans
          where record->>'status' <> 'completed'
          order by created_at asc
        `;
    return (rows as unknown as Array<{ record: unknown }>).map((row) => parsePlanRow(row));
  }

  async listCompletedPlans(): Promise<PlanRecord[]> {
    const rows = await this.sql`
      select record from durable_workloop_plans
      where record->>'status' = 'completed'
      order by updated_at desc
    `;
    return (rows as unknown as Array<{ record: unknown }>).map((row) => parsePlanRow(row));
  }

  async getPlan(planId: string): Promise<PlanRecord | undefined> {
    const rows = await this.sql`select record from durable_workloop_plans where id = ${planId}`;
    return rows[0] ? parsePlanRow(rows[0] as { record: unknown }) : undefined;
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

  async requestPlanReview(planId: string, actor: { userId?: string; tokenId?: string }, reason?: string): Promise<PlanRecord> {
    return this.updatePlan(planId, actor, "request_review", reason ? { reason } : {}, (plan) => ({
      ...plan,
      approvalRequired: true,
      approvalStatus: "pending",
      updatedAt: new Date().toISOString(),
    }));
  }

  async claimNextPlan(input: {
    clientTokenId: string;
    leaseTimeoutMs: number;
    projectId?: string;
  }): Promise<{ plan: PlanRecord; leaseId: string } | undefined> {
    return this.sql.begin(async (tx) => {
      const now = new Date();
      const rows = input.projectId
        ? await tx`
            select record from durable_workloop_plans
            where (record->'workLoop'->>'projectId') = ${input.projectId}
              and (record->>'approvalStatus' in ('approved', 'not_required'))
              and (
                record->>'status' = 'queued'
                or (record->>'status' = 'locked' and (record->'lock'->>'expiresAt')::timestamptz <= ${now.toISOString()})
              )
            order by created_at asc
            for update skip locked
            limit 1
          `
        : await tx`
            select record from durable_workloop_plans
            where (record->>'approvalStatus' in ('approved', 'not_required'))
              and (
                record->>'status' = 'queued'
                or (record->>'status' = 'locked' and (record->'lock'->>'expiresAt')::timestamptz <= ${now.toISOString()})
              )
            order by created_at asc
            for update skip locked
            limit 1
          `;
      if (!rows[0]) {
        return undefined;
      }
      const plan = parsePlanRow(rows[0] as { record: unknown });
      const leaseId = crypto.randomUUID();
      const lockedAt = now.toISOString();
      const updated = PlanRecordSchema.parse({
        ...plan,
        status: "locked",
        lock: {
          leaseId,
          clientTokenId: input.clientTokenId,
          lockedAt,
          expiresAt: new Date(now.getTime() + input.leaseTimeoutMs).toISOString(),
        },
        updatedAt: lockedAt,
      });
      await writePlan(tx, updated);
      await insertAudit(tx, {
        planId: updated.id,
        actorTokenId: input.clientTokenId,
        type: "claim",
        metadata: { leaseId },
      });
      return { plan: updated, leaseId };
    });
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
    return insertAudit(this.sql, event);
  }

  async listAudit(planId?: string): Promise<AuditEvent[]> {
    const rows = planId
      ? await this.sql`select record from durable_workloop_audit where plan_id = ${planId} order by created_at asc`
      : await this.sql`select record from durable_workloop_audit order by created_at asc`;
    return (rows as unknown as Array<{ record: unknown }>).map((row) =>
      AuditEventSchema.parse(row.record),
    );
  }

  private async updatePlan(
    planId: string,
    actor: { userId?: string; tokenId?: string },
    type: AuditEvent["type"],
    metadata: JsonValue,
    update: (plan: PlanRecord) => PlanRecord,
  ): Promise<PlanRecord> {
    return this.sql.begin(async (tx) => {
      const rows = await tx`select record from durable_workloop_plans where id = ${planId} for update`;
      if (!rows[0]) {
        throw new Error(`Plan not found: ${planId}`);
      }
      const updated = PlanRecordSchema.parse(update(parsePlanRow(rows[0] as { record: unknown })));
      await writePlan(tx, updated);
      await insertAudit(tx, {
        planId,
        actorUserId: actor.userId,
        actorTokenId: actor.tokenId,
        type,
        metadata,
      });
      return updated;
    });
  }
}

function parsePlanRow(row: { record: unknown }): PlanRecord {
  return PlanRecordSchema.parse(row.record);
}

async function writePlan(sql: SqlLike, plan: PlanRecord): Promise<void> {
  await sql`
    update durable_workloop_plans
    set record = ${sql.json(plan)}, updated_at = ${plan.updatedAt}
    where id = ${plan.id}
  `;
}

async function insertAudit(sql: SqlLike, event: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent> {
  const fullEvent = AuditEventSchema.parse({
    ...event,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  await sql`
    insert into durable_workloop_audit (id, plan_id, record, created_at)
    values (${fullEvent.id}, ${fullEvent.planId ?? null}, ${sql.json(fullEvent)}, ${fullEvent.createdAt})
  `;
  return fullEvent;
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
