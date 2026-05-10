import type {
  AuditEvent,
  ClientTokenScope,
  JsonValue,
  PlanRecord,
  PublicClientToken,
  User,
  UserRole,
  WorkLoop,
} from "@durable-workloops/api";

export interface PlanActor {
  userId?: string;
  tokenId?: string;
}

export interface PlanStore {
  createPlan(input: {
    workLoop: WorkLoop;
    approvalRequired: boolean;
    approvalStatus: PlanRecord["approvalStatus"];
    submitterUserId?: string;
    submitterTokenId?: string;
  }): Promise<PlanRecord>;
  listPlans(filter?: { includeCompleted?: boolean }): Promise<PlanRecord[]>;
  listCompletedPlans(): Promise<PlanRecord[]>;
  getPlan(planId: string): Promise<PlanRecord | undefined>;
  approvePlan(planId: string, actor: PlanActor, reason?: string): Promise<PlanRecord>;
  rejectPlan(planId: string, actor: PlanActor, reason?: string): Promise<PlanRecord>;
  claimNextPlan(input: {
    clientTokenId: string;
    leaseTimeoutMs: number;
    projectId?: string;
  }): Promise<{ plan: PlanRecord; leaseId: string } | undefined>;
  extendLease(input: {
    planId: string;
    leaseId: string;
    clientTokenId: string;
    leaseTimeoutMs: number;
  }): Promise<PlanRecord>;
  completePlan(input: {
    planId: string;
    leaseId: string;
    clientTokenId: string;
    metadata: JsonValue;
  }): Promise<PlanRecord>;
  appendAudit(event: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent>;
  listAudit(planId?: string): Promise<AuditEvent[]>;
}

export interface AuthStore {
  ensureBootstrapAdmin(input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<User | undefined>;
  usersExist(): Promise<boolean>;
  createUser(input: {
    email: string;
    password: string;
    name?: string;
    roles: UserRole[];
  }): Promise<User>;
  listUsers(): Promise<User[]>;
  getUser(userId: string): Promise<User | undefined>;
  verifyPassword(email: string, password: string): Promise<User | undefined>;
  createSession(userId: string): Promise<string>;
  getSession(secret: string): Promise<User | undefined>;
  revokeSession(secret: string): Promise<void>;
  createClientToken(input: {
    userId: string;
    name: string;
    scopes: ClientTokenScope[];
    expiresAt?: string;
  }): Promise<PublicClientToken & { token: string }>;
  listClientTokens(userId?: string): Promise<PublicClientToken[]>;
  revokeClientToken(tokenId: string, actorUserId: string): Promise<PublicClientToken>;
  verifyClientToken(secret: string): Promise<
    | {
        tokenId: string;
        userId: string;
        scopes: ClientTokenScope[];
        user: User;
      }
    | undefined
  >;
}
