import type { ServerConfig } from "./config.js";
import type { AuthStore, PlanStore } from "./store.js";
import type {
  AuditEvent,
  ClientTokenScope,
  JsonValue,
  PlanRecord,
  PublicClientToken,
  User,
  UserRole,
  WorkLoop,
} from "@agent-workloops/api";
import {
  AuditEventSchema,
  ClientTokenScopeSchema,
  PlanRecordSchema,
  PublicClientTokenSchema,
  UserSchema,
} from "@agent-workloops/api";
import crypto from "node:crypto";
import { MongoClient, type Collection } from "mongodb";
import {
  hashToken,
  makeUser,
  newSecret,
  verifySecret,
  type StoredClientToken,
  type StoredSession,
  type StoredUser,
} from "./auth-utils.js";

export async function createMongoPlanStore(config: ServerConfig): Promise<PlanStore> {
  if (config.persistence.kind !== "mongodb") {
    throw new Error("MongoDB persistence config is required.");
  }
  const client = new MongoClient(config.persistence.connectionString);
  await client.connect();
  const db = client.db(config.persistence.database);
  const store = new MongoPlanStore(client, db.collection("plans"), db.collection("audit"));
  await store.initialize();
  return store;
}

export async function createMongoAuthStore(config: ServerConfig): Promise<AuthStore> {
  if (config.persistence.kind !== "mongodb") {
    throw new Error("MongoDB persistence config is required.");
  }
  const client = new MongoClient(config.persistence.connectionString);
  await client.connect();
  const db = client.db(config.persistence.database);
  const store = new MongoAuthStore(
    client,
    db.collection("users"),
    db.collection("sessions"),
    db.collection("client_tokens"),
  );
  await store.initialize();
  return store;
}

export class MongoPlanStore implements PlanStore {
  constructor(
    private readonly client: MongoClient,
    private readonly plans: Collection<{ _id: string; record: PlanRecord; createdAt: string; updatedAt: string }>,
    private readonly audit: Collection<{ _id: string; planId?: string; record: AuditEvent; createdAt: string }>,
  ) {}

  async close(): Promise<void> {
    await this.client.close();
  }

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

export class MongoAuthStore implements AuthStore {
  constructor(
    private readonly client: MongoClient,
    private readonly users: Collection<StoredUser & { _id: string; emailLower: string }>,
    private readonly sessions: Collection<StoredSession & { _id: string }>,
    private readonly tokens: Collection<StoredClientToken & { _id: string }>,
  ) {}

  async initialize(): Promise<void> {
    await this.users.createIndex({ emailLower: 1 }, { unique: true });
    await this.sessions.createIndex({ secretHash: 1 }, { unique: true });
    await this.tokens.createIndex({ secretHash: 1 }, { unique: true });
    await this.tokens.createIndex({ userId: 1, createdAt: -1 });
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async ensureBootstrapAdmin(input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<User | undefined> {
    if (await this.usersExist()) {
      return undefined;
    }
    try {
      return await this.createUser({ ...input, roles: ["admin"] });
    } catch (error) {
      if (isDuplicateKey(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async usersExist(): Promise<boolean> {
    return (await this.users.countDocuments({}, { limit: 1 })) > 0;
  }

  async createUser(input: {
    email: string;
    password: string;
    name?: string;
    roles: UserRole[];
  }): Promise<User> {
    const user = await makeUser(input);
    try {
      await this.users.insertOne({
        _id: user.id,
        ...user,
        emailLower: user.email.toLowerCase(),
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new Error(`User already exists: ${input.email}`);
      }
      throw error;
    }
    return UserSchema.parse(user);
  }

  async listUsers(): Promise<User[]> {
    return (await this.users.find({}).sort({ createdAt: 1 }).toArray()).map((user) =>
      UserSchema.parse(user),
    );
  }

  async getUser(userId: string): Promise<User | undefined> {
    const user = await this.users.findOne({ _id: userId });
    return user ? UserSchema.parse(user) : undefined;
  }

  async verifyPassword(email: string, password: string): Promise<User | undefined> {
    const user = await this.users.findOne({ emailLower: email.toLowerCase(), disabledAt: { $exists: false } });
    if (!user || !(await verifySecret(password, user.passwordHash))) {
      return undefined;
    }
    return UserSchema.parse(user);
  }

  async createSession(userId: string): Promise<string> {
    const secret = newSecret("awl_session");
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await this.sessions.insertOne({
      _id: id,
      id,
      userId,
      secretHash: hashToken(secret),
      createdAt: now,
    });
    return secret;
  }

  async getSession(secret: string): Promise<User | undefined> {
    const session = await this.sessions.findOne({ secretHash: hashToken(secret) });
    if (!session) {
      return undefined;
    }
    const user = await this.users.findOne({ _id: session.userId, disabledAt: { $exists: false } });
    return user ? UserSchema.parse(user) : undefined;
  }

  async revokeSession(secret: string): Promise<void> {
    await this.sessions.deleteOne({ secretHash: hashToken(secret) });
  }

  async createClientToken(input: {
    userId: string;
    name: string;
    scopes: ClientTokenScope[];
    expiresAt?: string;
  }): Promise<PublicClientToken & { token: string }> {
    const user = await this.users.findOne({ _id: input.userId, disabledAt: { $exists: false } });
    if (!user) {
      throw new Error(`User not found: ${input.userId}`);
    }
    const token = newSecret("awl_client");
    const now = new Date().toISOString();
    const record = PublicClientTokenSchema.parse({
      id: crypto.randomUUID(),
      name: input.name,
      scopes: input.scopes.map((scope) => ClientTokenScopeSchema.parse(scope)),
      expiresAt: input.expiresAt,
      createdAt: now,
    });
    await this.tokens.insertOne({
      _id: record.id,
      ...record,
      userId: input.userId,
      secretHash: hashToken(token),
    });
    return { ...record, token };
  }

  async listClientTokens(userId?: string): Promise<PublicClientToken[]> {
    return (await this.tokens.find(userId ? { userId } : {}).sort({ createdAt: 1 }).toArray()).map((token) =>
      PublicClientTokenSchema.parse(token),
    );
  }

  async revokeClientToken(tokenId: string, actorUserId: string): Promise<PublicClientToken> {
    const now = new Date().toISOString();
    const token = await this.tokens.findOneAndUpdate(
      { _id: tokenId },
      { $set: { revokedAt: now } },
      { returnDocument: "after" },
    );
    void actorUserId;
    if (!token) {
      throw new Error(`Token not found: ${tokenId}`);
    }
    return PublicClientTokenSchema.parse(token);
  }

  async verifyClientToken(secret: string): Promise<
    | {
        tokenId: string;
        userId: string;
        scopes: ClientTokenScope[];
        user: User;
      }
    | undefined
  > {
    const token = await this.tokens.findOneAndUpdate(
      {
        secretHash: hashToken(secret),
        revokedAt: { $exists: false },
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date().toISOString() } }],
      },
      { $set: { lastUsedAt: new Date().toISOString() } },
      { returnDocument: "after" },
    );
    if (!token) {
      return undefined;
    }
    const user = await this.users.findOne({ _id: token.userId, disabledAt: { $exists: false } });
    if (!user) {
      return undefined;
    }
    return {
      tokenId: token.id,
      userId: token.userId,
      scopes: token.scopes,
      user: UserSchema.parse(user),
    };
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
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
