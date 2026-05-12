import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  AuditEventSchema,
  ClientTokenScopeSchema,
  PlanRecordSchema,
  PublicClientTokenSchema,
  UserSchema,
  type AuditEvent,
  type ClientTokenScope,
  type JsonValue,
  type PlanRecord,
  type PublicClientToken,
  type User,
  type UserRole,
  type WorkLoop,
} from "@agent-workloops/api";
import {
  emptyAuthState,
  hashToken,
  makeUser,
  newSecret,
  verifySecret,
  type AuthState,
} from "./auth-utils.js";
import type { AuthStore, PlanActor, PlanStore } from "./store.js";

type AuthFile = AuthState;

export class FilesystemPlanStore implements PlanStore {
  private readonly plansDir: string;
  private readonly auditPath: string;
  private readonly lockDir: string;

  constructor(private readonly dataDir: string) {
    this.plansDir = path.join(dataDir, "plans");
    this.auditPath = path.join(dataDir, "audit.jsonl");
    this.lockDir = path.join(dataDir, ".plan-store.lock");
  }

  async createPlan(input: {
    workLoop: WorkLoop;
    approvalRequired: boolean;
    approvalStatus: PlanRecord["approvalStatus"];
    submitterUserId?: string;
    submitterTokenId?: string;
  }): Promise<PlanRecord> {
    return this.withLock(async () => {
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
      await this.writePlan(plan);
      await this.appendAuditUnlocked({
        planId: plan.id,
        actorUserId: input.submitterUserId,
        actorTokenId: input.submitterTokenId,
        type: "submit",
        metadata: { approvalRequired: input.approvalRequired },
      });
      return plan;
    });
  }

  async listPlans(filter: { includeCompleted?: boolean } = {}): Promise<PlanRecord[]> {
    const plans = await this.readAllPlans();
    return plans
      .filter((plan) => filter.includeCompleted || plan.status !== "completed")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async listCompletedPlans(): Promise<PlanRecord[]> {
    return (await this.readAllPlans())
      .filter((plan) => plan.status === "completed")
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getPlan(planId: string): Promise<PlanRecord | undefined> {
    return this.readPlan(planId);
  }

  async approvePlan(planId: string, actor: PlanActor, reason?: string): Promise<PlanRecord> {
    return this.withLock(async () => {
      const plan = await this.requirePlan(planId);
      const updated = {
        ...plan,
        approvalStatus: "approved" as const,
        updatedAt: new Date().toISOString(),
      };
      await this.writePlan(updated);
      await this.appendAuditUnlocked({
        planId,
        actorUserId: actor.userId,
        actorTokenId: actor.tokenId,
        type: "approve",
        metadata: reason ? { reason } : {},
      });
      return updated;
    });
  }

  async rejectPlan(planId: string, actor: PlanActor, reason?: string): Promise<PlanRecord> {
    return this.withLock(async () => {
      const plan = await this.requirePlan(planId);
      const updated = {
        ...plan,
        approvalStatus: "rejected" as const,
        updatedAt: new Date().toISOString(),
      };
      await this.writePlan(updated);
      await this.appendAuditUnlocked({
        planId,
        actorUserId: actor.userId,
        actorTokenId: actor.tokenId,
        type: "reject",
        metadata: reason ? { reason } : {},
      });
      return updated;
    });
  }

  async requestPlanReview(planId: string, actor: PlanActor, reason?: string): Promise<PlanRecord> {
    return this.withLock(async () => {
      const plan = await this.requirePlan(planId);
      const updated = {
        ...plan,
        approvalRequired: true,
        approvalStatus: "pending" as const,
        updatedAt: new Date().toISOString(),
      };
      await this.writePlan(updated);
      await this.appendAuditUnlocked({
        planId,
        actorUserId: actor.userId,
        actorTokenId: actor.tokenId,
        type: "request_review",
        metadata: reason ? { reason } : {},
      });
      return updated;
    });
  }

  async claimNextPlan(input: {
    clientTokenId: string;
    leaseTimeoutMs: number;
    projectId?: string;
  }): Promise<{ plan: PlanRecord; leaseId: string } | undefined> {
    return this.withLock(async () => {
      const now = new Date();
      const plans = await this.readAllPlans();
      const candidate = plans
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .find((plan) => {
          if (input.projectId && plan.workLoop.projectId !== input.projectId) {
            return false;
          }
          if (plan.approvalStatus !== "approved" && plan.approvalStatus !== "not_required") {
            return false;
          }
          if (plan.status === "queued") {
            return true;
          }
          return plan.status === "locked" && plan.lock && new Date(plan.lock.expiresAt) <= now;
        });
      if (!candidate) {
        return undefined;
      }
      const leaseId = crypto.randomUUID();
      const lockedAt = now.toISOString();
      const updated = {
        ...candidate,
        status: "locked" as const,
        lock: {
          leaseId,
          clientTokenId: input.clientTokenId,
          lockedAt,
          expiresAt: new Date(now.getTime() + input.leaseTimeoutMs).toISOString(),
        },
        updatedAt: lockedAt,
      };
      await this.writePlan(updated);
      await this.appendAuditUnlocked({
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
    return this.withLock(async () => {
      const plan = await this.requirePlan(input.planId);
      assertLease(plan, input.leaseId, input.clientTokenId);
      const now = new Date();
      const updated = {
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
      await this.writePlan(updated);
      await this.appendAuditUnlocked({
        planId: input.planId,
        actorTokenId: input.clientTokenId,
        type: "heartbeat",
        metadata: { leaseId: input.leaseId },
      });
      return updated;
    });
  }

  async completePlan(input: {
    planId: string;
    leaseId: string;
    clientTokenId: string;
    metadata: JsonValue;
  }): Promise<PlanRecord> {
    return this.withLock(async () => {
      const plan = await this.requirePlan(input.planId);
      assertLease(plan, input.leaseId, input.clientTokenId);
      const now = new Date().toISOString();
      const updated = {
        ...plan,
        status: "completed" as const,
        lock: undefined,
        completion: {
          completedAt: now,
          completedByTokenId: input.clientTokenId,
          metadata: input.metadata,
        },
        updatedAt: now,
      };
      await this.writePlan(updated);
      await this.appendAuditUnlocked({
        planId: input.planId,
        actorTokenId: input.clientTokenId,
        type: "complete",
        metadata: input.metadata,
      });
      return updated;
    });
  }

  async appendAudit(event: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent> {
    return this.withLock(() => this.appendAuditUnlocked(event));
  }

  async listAudit(planId?: string): Promise<AuditEvent[]> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const raw = await fs.readFile(this.auditPath, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return "";
      }
      throw error;
    });
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => AuditEventSchema.parse(JSON.parse(line)))
      .filter((event) => !planId || event.planId === planId);
  }

  private async appendAuditUnlocked(event: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const fullEvent = AuditEventSchema.parse({
      ...event,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    await fs.appendFile(this.auditPath, `${JSON.stringify(fullEvent)}\n`, "utf8");
    return fullEvent;
  }

  private async readAllPlans(): Promise<PlanRecord[]> {
    await fs.mkdir(this.plansDir, { recursive: true });
    const entries = await fs.readdir(this.plansDir, { withFileTypes: true });
    const plans = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => this.readPlan(entry.name.slice(0, -".json".length))),
    );
    return plans.filter((plan): plan is PlanRecord => Boolean(plan));
  }

  private async readPlan(planId: string): Promise<PlanRecord | undefined> {
    const filePath = this.planPath(planId);
    const raw = await fs.readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    });
    return raw ? PlanRecordSchema.parse(JSON.parse(raw)) : undefined;
  }

  private async requirePlan(planId: string): Promise<PlanRecord> {
    const plan = await this.readPlan(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    return plan;
  }

  private async writePlan(plan: PlanRecord): Promise<void> {
    await fs.mkdir(this.plansDir, { recursive: true });
    await fs.writeFile(this.planPath(plan.id), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  }

  private planPath(planId: string): string {
    return path.join(this.plansDir, `${planId}.json`);
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await fs.mkdir(this.dataDir, { recursive: true });
    while (true) {
      try {
        await fs.mkdir(this.lockDir);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    try {
      return await fn();
    } finally {
      await fs.rm(this.lockDir, { recursive: true, force: true });
    }
  }
}

export class FilesystemAuthStore implements AuthStore {
  private readonly authPath: string;
  private readonly lockDir: string;

  constructor(private readonly dataDir: string) {
    this.authPath = path.join(dataDir, "auth.json");
    this.lockDir = path.join(dataDir, ".auth-store.lock");
  }

  async ensureBootstrapAdmin(input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<User | undefined> {
    return this.withLock(async () => {
      const auth = await this.readAuth();
      if (auth.users.length > 0) {
        return undefined;
      }
      const user = await makeUser({
        email: input.email,
        password: input.password,
        name: input.name,
        roles: ["admin"],
      });
      auth.users.push(user);
      await this.writeAuth(auth);
      return UserSchema.parse(user);
    });
  }

  async usersExist(): Promise<boolean> {
    return (await this.readAuth()).users.length > 0;
  }

  async createUser(input: {
    email: string;
    password: string;
    name?: string;
    roles: UserRole[];
  }): Promise<User> {
    return this.withLock(async () => {
      const auth = await this.readAuth();
      if (auth.users.some((user) => user.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error(`User already exists: ${input.email}`);
      }
      const user = await makeUser(input);
      auth.users.push(user);
      await this.writeAuth(auth);
      return UserSchema.parse(user);
    });
  }

  async listUsers(): Promise<User[]> {
    return (await this.readAuth()).users.map((user) => UserSchema.parse(user));
  }

  async getUser(userId: string): Promise<User | undefined> {
    const user = (await this.readAuth()).users.find((candidate) => candidate.id === userId);
    return user ? UserSchema.parse(user) : undefined;
  }

  async verifyPassword(email: string, password: string): Promise<User | undefined> {
    const auth = await this.readAuth();
    const user = auth.users.find(
      (candidate) => candidate.email.toLowerCase() === email.toLowerCase() && !candidate.disabledAt,
    );
    if (!user || !(await verifySecret(password, user.passwordHash))) {
      return undefined;
    }
    return UserSchema.parse(user);
  }

  async createSession(userId: string, options: { ttlMs?: number } = {}): Promise<string> {
    return this.withLock(async () => {
      const auth = await this.readAuth();
      const secret = newSecret("awl_session");
      const now = Date.now();
      auth.sessions.push({
        id: crypto.randomUUID(),
        userId,
        secretHash: hashToken(secret),
        createdAt: new Date(now).toISOString(),
        expiresAt: options.ttlMs ? new Date(now + options.ttlMs).toISOString() : undefined,
      });
      await this.writeAuth(auth);
      return secret;
    });
  }

  async getSession(secret: string): Promise<User | undefined> {
    const auth = await this.readAuth();
    const session = auth.sessions.find((candidate) => candidate.secretHash === hashToken(secret));
    if (session?.expiresAt && new Date(session.expiresAt) <= new Date()) {
      await this.revokeSession(secret);
      return undefined;
    }
    const user = session
      ? auth.users.find((candidate) => candidate.id === session.userId && !candidate.disabledAt)
      : undefined;
    return user ? UserSchema.parse(user) : undefined;
  }

  async revokeSession(secret: string): Promise<void> {
    return this.withLock(async () => {
      const auth = await this.readAuth();
      auth.sessions = auth.sessions.filter((session) => session.secretHash !== hashToken(secret));
      await this.writeAuth(auth);
    });
  }

  async createClientToken(input: {
    userId: string;
    name: string;
    scopes: ClientTokenScope[];
    expiresAt?: string;
  }): Promise<PublicClientToken & { token: string }> {
    return this.withLock(async () => {
      const auth = await this.readAuth();
      if (!auth.users.some((user) => user.id === input.userId && !user.disabledAt)) {
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
      auth.tokens.push({
        ...record,
        userId: input.userId,
        secretHash: hashToken(token),
      });
      await this.writeAuth(auth);
      return { ...record, token };
    });
  }

  async listClientTokens(userId?: string): Promise<PublicClientToken[]> {
    return (await this.readAuth()).tokens
      .filter((token) => !userId || token.userId === userId)
      .map((token) => PublicClientTokenSchema.parse(token));
  }

  async revokeClientToken(tokenId: string, actorUserId: string): Promise<PublicClientToken> {
    return this.withLock(async () => {
      const auth = await this.readAuth();
      const token = auth.tokens.find((candidate) => candidate.id === tokenId);
      if (!token) {
        throw new Error(`Token not found: ${tokenId}`);
      }
      token.revokedAt = new Date().toISOString();
      await this.writeAuth(auth);
      void actorUserId;
      return PublicClientTokenSchema.parse(token);
    });
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
    return this.withLock(async () => {
      const auth = await this.readAuth();
      const token = auth.tokens.find((candidate) => candidate.secretHash === hashToken(secret));
      if (!token || token.revokedAt || (token.expiresAt && new Date(token.expiresAt) <= new Date())) {
        return undefined;
      }
      const user = auth.users.find((candidate) => candidate.id === token.userId && !candidate.disabledAt);
      if (!user) {
        return undefined;
      }
      token.lastUsedAt = new Date().toISOString();
      await this.writeAuth(auth);
      return {
        tokenId: token.id,
        userId: token.userId,
        scopes: token.scopes,
        user: UserSchema.parse(user),
      };
    });
  }

  private async readAuth(): Promise<AuthFile> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const raw = await fs.readFile(this.authPath, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    });
    if (!raw) {
      return emptyAuthState();
    }
    const parsed = JSON.parse(raw) as AuthFile;
    return {
      users: parsed.users ?? [],
      sessions: parsed.sessions ?? [],
      tokens: parsed.tokens ?? [],
    };
  }

  private async writeAuth(auth: AuthFile): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await fs.mkdir(this.dataDir, { recursive: true });
    while (true) {
      try {
        await fs.mkdir(this.lockDir);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    try {
      return await fn();
    } finally {
      await fs.rm(this.lockDir, { recursive: true, force: true });
    }
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

