import path from "node:path";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import {
  ApprovePlanRequestSchema,
  ClaimPlanRequestSchema,
  ClaimWorkItemRequestSchema,
  CompletePlanRequestSchema,
  CompleteWorkItemRequestSchema,
  CreateWorkItemRequestSchema,
  CreateClientTokenRequestSchema,
  CreateUserRequestSchema,
  FailWorkItemRequestSchema,
  LoginRequestSchema,
  ProgressPlanRequestSchema,
  RejectPlanRequestSchema,
  RequestReviewPlanRequestSchema,
  ReleasePlanRequestSchema,
  SubmitPlanRequestSchema,
  type ClientTokenScope,
  type User,
  type UserRole,
} from "@agent-workloops/api";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import { FilesystemAuthStore, FilesystemPlanStore } from "./filesystem-store.js";
import { createMongoAuthStore, createMongoPlanStore } from "./mongodb-store.js";
import { createSqlPlanStore } from "./sql-store.js";
import type { AuthStore, PlanStore } from "./store.js";
import { createConfiguredWorkItemStore, type WorkItemStore } from "./work-item-store.js";
import {
  createConfiguredWorkItemAuditStore,
  InMemoryWorkItemAuditStore,
  RecordingWorkItemStore,
  sanitizedReason,
  type WorkItemAuditStore,
} from "./work-item-audit-store.js";

export interface AuthContext {
  user: User;
  userId: string;
  tokenId?: string;
  scopes: ClientTokenScope[];
}

export interface BuildServerOptions {
  config: ServerConfig;
  planStore?: PlanStore;
  authStore?: AuthStore;
  workItemStore?: WorkItemStore;
  workItemAuditStore?: WorkItemAuditStore;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: options.config.trustProxy });
  const planStore = options.planStore ?? (await createPlanStore(options.config));
  const authStore = options.authStore ?? (await createAuthStore(options.config));
  const baseWorkItemStore = options.workItemStore ?? createConfiguredWorkItemStore(options.config);
  const workItemAuditStore: WorkItemAuditStore =
    options.workItemAuditStore ?? createDefaultWorkItemAuditStore(options.config);
  const workItemStore: WorkItemStore = new RecordingWorkItemStore(
    baseWorkItemStore,
    workItemAuditStore,
  );

  if (options.config.bootstrapAdmin) {
    await authStore.ensureBootstrapAdmin(options.config.bootstrapAdmin);
  }

  app.addHook("onClose", async () => {
    await closeStore(planStore);
    if ((authStore as unknown) !== planStore) {
      await closeStore(authStore);
    }
  });

  await app.register(cookie);

  if (options.config.webDistDir) {
    await app.register(fastifyStatic, {
      root: path.resolve(options.config.webDistDir),
      prefix: "/",
      wildcard: false,
    });
  }

  app.get("/api/v1/health", async () => ({ ok: true }));

  app.get("/api/v1/auth/setup", async () => ({
    usersExist: await authStore.usersExist(),
    bootstrapConfigured: Boolean(options.config.bootstrapAdmin),
  }));

  app.post("/api/v1/auth/bootstrap", async (request, reply) => {
    if (await authStore.usersExist()) {
      return reply.code(409).send({ error: "Users already exist." });
    }
    const body = CreateUserRequestSchema.parse(request.body);
    const user = await authStore.createUser({ ...body, roles: ["admin"] });
    return { user };
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = LoginRequestSchema.parse(request.body);
    const user = await authStore.verifyPassword(body.email, body.password);
    if (!user) {
      return reply.code(401).send({ error: "Invalid credentials." });
    }
    const session = await authStore.createSession(user.id, options.config.session);
    reply.setCookie("awl_session", session, sessionCookieOptions(options.config));
    return { user };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const session = request.cookies.awl_session ?? request.cookies.dwl_session;
    if (session) {
      await authStore.revokeSession(session);
    }
    reply.clearCookie("awl_session", clearSessionCookieOptions(options.config));
    return { ok: true };
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const auth = await authenticate(request, authStore);
    if (!auth) {
      return reply.code(401).send({ error: "Authentication required." });
    }
    return { user: auth.user };
  });

  app.get("/api/v1/users", async (request, reply) => {
    const auth = await requireRoles(request, reply, authStore, ["admin"]);
    if (!auth) {
      return;
    }
    return authStore.listUsers();
  });

  app.post("/api/v1/users", async (request, reply) => {
    const auth = await requireRoles(request, reply, authStore, ["admin"]);
    if (!auth) {
      return;
    }
    const body = CreateUserRequestSchema.parse(request.body);
    return authStore.createUser(body);
  });

  app.get("/api/v1/tokens", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (!auth) {
      return;
    }
    return authStore.listClientTokens(hasRole(auth.user, "admin") ? undefined : auth.userId);
  });

  app.post("/api/v1/tokens", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (!auth) {
      return;
    }
    const body = CreateClientTokenRequestSchema.parse(request.body);
    const token = await authStore.createClientToken({ userId: auth.userId, ...body });
    await planStore.appendAudit({
      actorUserId: auth.userId,
      type: "token-created",
      metadata: { tokenId: token.id, name: token.name, scopes: token.scopes },
    });
    return token;
  });

  app.delete("/api/v1/tokens/:tokenId", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (!auth) {
      return;
    }
    const params = z.object({ tokenId: z.string().min(1) }).parse(request.params);
    const token = await authStore.revokeClientToken(params.tokenId, auth.userId);
    await planStore.appendAudit({
      actorUserId: auth.userId,
      type: "token-revoked",
      metadata: { tokenId: token.id },
    });
    return token;
  });

  app.get("/api/v1/plans", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (!auth) {
      return;
    }
    const query = z.object({ includeCompleted: z.coerce.boolean().optional() }).parse(request.query);
    return planStore.listPlans({ includeCompleted: query.includeCompleted });
  });

  app.get("/api/v1/work-items", async (request, reply) => {
    const auth = await requireWorkItemAuth(request, reply, authStore, workItemAuditStore, {
      scope: "work_items:read",
      enforceTokenScopeOnly: false,
    });
    if (!auth) {
      return;
    }
    return { work_items: await workItemStore.list() };
  });

  app.post("/api/v1/work-items", async (request, reply) => {
    const auth = await requireWorkItemAuth(request, reply, authStore, workItemAuditStore, {
      scope: "work_items:create",
      enforceTokenScopeOnly: false,
    });
    if (!auth || rejectUnsafePayload(request.body, reply)) {
      return;
    }
    const body = CreateWorkItemRequestSchema.parse(request.body);
    const workItem = await workItemStore.create(body);
    return reply.code(201).send({ work_item: workItem });
  });

  app.get("/api/v1/work-items/:workItemId", async (request, reply) => {
    const auth = await requireWorkItemAuth(request, reply, authStore, workItemAuditStore, {
      scope: "work_items:read",
      enforceTokenScopeOnly: false,
    });
    if (!auth) {
      return;
    }
    const params = z.object({ workItemId: z.string().min(1) }).parse(request.params);
    const workItem = await workItemStore.get(params.workItemId);
    if (!workItem) {
      return reply.code(404).send({ error: "work item not found" });
    }
    return { work_item: workItem };
  });

  app.post("/api/v1/work-items/:workItemId/ready", async (request, reply) => {
    const auth = await requireWorkItemAuth(request, reply, authStore, workItemAuditStore, {
      scope: "work_items:transition",
      enforceTokenScopeOnly: false,
    });
    if (!auth) {
      return;
    }
    const params = z.object({ workItemId: z.string().min(1) }).parse(request.params);
    return { work_item: await workItemStore.markReady(params.workItemId) };
  });

  app.post("/api/v1/work-items/:workItemId/claim", async (request, reply) => {
    const auth = await requireWorkItemAuth(request, reply, authStore, workItemAuditStore, {
      scope: "work_items:claim",
      enforceTokenScopeOnly: true,
    });
    if (!auth || rejectUnsafePayload(request.body, reply)) {
      return;
    }
    const params = z.object({ workItemId: z.string().min(1) }).parse(request.params);
    const body = ClaimWorkItemRequestSchema.parse(request.body ?? {});
    return {
      work_item: await workItemStore.claim(params.workItemId, {
        ...body,
        leaseTimeoutMs: options.config.locks.timeoutMs,
      }),
    };
  });

  app.post("/api/v1/work-items/:workItemId/heartbeat", async (request, reply) => {
    const auth = await requireWorkItemAuth(request, reply, authStore, workItemAuditStore, {
      scope: "work_items:heartbeat",
      enforceTokenScopeOnly: true,
    });
    if (!auth || rejectUnsafePayload(request.body, reply)) {
      return;
    }
    const params = z.object({ workItemId: z.string().min(1) }).parse(request.params);
    const body = z.object({ lease_id: z.string().min(1) }).parse(request.body);
    return {
      work_item: await workItemStore.heartbeat(params.workItemId, {
        lease_id: body.lease_id,
        leaseTimeoutMs: options.config.locks.timeoutMs,
      }),
    };
  });

  app.post("/api/v1/work-items/:workItemId/release-stale", async (request, reply) => {
    const auth = await requireWorkItemAuth(request, reply, authStore, workItemAuditStore, {
      scope: "work_items:transition",
      enforceTokenScopeOnly: true,
    });
    if (!auth) {
      return;
    }
    const params = z.object({ workItemId: z.string().min(1) }).parse(request.params);
    return { work_item: await workItemStore.releaseStale(params.workItemId) };
  });

  app.post("/api/v1/work-items/:workItemId/needs-approval", async (request, reply) => {
    const auth = await requireWorkItemAuth(request, reply, authStore, workItemAuditStore, {
      scope: "work_items:transition",
      enforceTokenScopeOnly: true,
    });
    if (!auth) {
      return;
    }
    const params = z.object({ workItemId: z.string().min(1) }).parse(request.params);
    return { work_item: await workItemStore.moveToNeedsApproval(params.workItemId) };
  });

  app.post("/api/v1/work-items/:workItemId/complete", async (request, reply) => {
    const auth = await requireWorkItemAuth(request, reply, authStore, workItemAuditStore, {
      scope: "work_items:complete",
      enforceTokenScopeOnly: true,
    });
    if (!auth || rejectUnsafePayload(request.body, reply)) {
      return;
    }
    const params = z.object({ workItemId: z.string().min(1) }).parse(request.params);
    const body = CompleteWorkItemRequestSchema.parse(request.body);
    return { work_item: await workItemStore.complete(params.workItemId, body) };
  });

  app.post("/api/v1/work-items/:workItemId/fail", async (request, reply) => {
    const auth = await requireWorkItemAuth(request, reply, authStore, workItemAuditStore, {
      scope: "work_items:transition",
      enforceTokenScopeOnly: true,
    });
    if (!auth || rejectUnsafePayload(request.body, reply)) {
      return;
    }
    const params = z.object({ workItemId: z.string().min(1) }).parse(request.params);
    const body = FailWorkItemRequestSchema.parse(request.body);
    return { work_item: await workItemStore.fail(params.workItemId, body.reason) };
  });

  app.post("/api/v1/work-items/:workItemId/cancel", async (request, reply) => {
    const auth = await requireWorkItemAuth(request, reply, authStore, workItemAuditStore, {
      scope: "work_items:cancel",
      enforceTokenScopeOnly: false,
    });
    if (!auth) {
      return;
    }
    const params = z.object({ workItemId: z.string().min(1) }).parse(request.params);
    return { work_item: await workItemStore.cancel(params.workItemId) };
  });

  app.get("/api/v1/plans/archive", async (request, reply) => {
    const auth = await requireRoles(request, reply, authStore, ["admin", "reviewer"]);
    if (!auth) {
      return;
    }
    return planStore.listCompletedPlans();
  });

  app.get("/api/v1/plans/:planId", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (!auth) {
      return;
    }
    const params = z.object({ planId: z.string().min(1) }).parse(request.params);
    const plan = await planStore.getPlan(params.planId);
    if (!plan) {
      return reply.code(404).send({ error: "Plan not found." });
    }
    return {
      plan,
      audit: await planStore.listAudit(params.planId),
    };
  });

  app.post("/api/v1/plans", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (!auth) {
      return;
    }
    if (auth.tokenId) {
      requireScope(auth, "plans:submit", reply);
      if (reply.sent) {
        return;
      }
    }
    const body = SubmitPlanRequestSchema.parse(request.body);
    const approvalRequired = options.config.approval.forceRequired || body.approvalRequired;
    const plan = await planStore.createPlan({
      workLoop: body.workLoop,
      approvalRequired,
      approvalStatus: approvalRequired ? "pending" : "not_required",
      submitterUserId: auth.userId,
      submitterTokenId: auth.tokenId,
    });
    return reply.code(201).send({ plan });
  });

  app.post("/api/v1/plans/:planId/approve", async (request, reply) => {
    const auth = await requireRoles(request, reply, authStore, ["admin", "reviewer"]);
    if (!auth) {
      return;
    }
    const params = z.object({ planId: z.string().min(1) }).parse(request.params);
    const body = ApprovePlanRequestSchema.parse(request.body ?? {});
    return planStore.approvePlan(params.planId, { userId: auth.userId, tokenId: auth.tokenId }, body.reason);
  });

  app.post("/api/v1/plans/:planId/reject", async (request, reply) => {
    const auth = await requireRoles(request, reply, authStore, ["admin", "reviewer"]);
    if (!auth) {
      return;
    }
    const params = z.object({ planId: z.string().min(1) }).parse(request.params);
    const body = RejectPlanRequestSchema.parse(request.body ?? {});
    return planStore.rejectPlan(params.planId, { userId: auth.userId, tokenId: auth.tokenId }, body.reason);
  });

  app.post("/api/v1/plans/:planId/request-review", async (request, reply) => {
    const auth = await requireRoles(request, reply, authStore, ["admin", "reviewer"]);
    if (!auth) {
      return;
    }
    const params = z.object({ planId: z.string().min(1) }).parse(request.params);
    const body = RequestReviewPlanRequestSchema.parse(request.body ?? {});
    return planStore.requestPlanReview(params.planId, { userId: auth.userId, tokenId: auth.tokenId }, body.reason);
  });

  app.post("/api/v1/plans/claim", async (request, reply) => {
    const auth = await requireTokenScope(request, reply, authStore, "plans:claim");
    if (!auth || !auth.tokenId) {
      return;
    }
    const body = ClaimPlanRequestSchema.parse(request.body ?? {});
    return (
      (await planStore.claimNextPlan({
        clientTokenId: auth.tokenId,
        leaseTimeoutMs: options.config.locks.timeoutMs,
        planId: body.planId,
        projectId: body.projectId,
      })) ?? {}
    );
  });

  app.post("/api/v1/plans/:planId/heartbeat", async (request, reply) => {
    const auth = await requireTokenScope(request, reply, authStore, "plans:complete");
    if (!auth || !auth.tokenId) {
      return;
    }
    const params = z.object({ planId: z.string().min(1) }).parse(request.params);
    const body = z.object({ leaseId: z.string().min(1) }).parse(request.body);
    return planStore.extendLease({
      planId: params.planId,
      leaseId: body.leaseId,
      clientTokenId: auth.tokenId,
      leaseTimeoutMs: options.config.locks.timeoutMs,
    });
  });

  app.post("/api/v1/plans/:planId/progress", async (request, reply) => {
    const auth = await requireTokenScope(request, reply, authStore, "plans:complete");
    if (!auth || !auth.tokenId) {
      return;
    }
    const params = z.object({ planId: z.string().min(1) }).parse(request.params);
    const body = ProgressPlanRequestSchema.parse(request.body);
    return planStore.progressPlan({
      planId: params.planId,
      leaseId: body.leaseId,
      clientTokenId: auth.tokenId,
      workLoop: body.workLoop,
      decision: body.decision,
      metadata: body.metadata,
    });
  });

  app.post("/api/v1/plans/:planId/release", async (request, reply) => {
    const auth = await requireTokenScope(request, reply, authStore, "plans:complete");
    if (!auth || !auth.tokenId) {
      return;
    }
    const params = z.object({ planId: z.string().min(1) }).parse(request.params);
    const body = ReleasePlanRequestSchema.parse(request.body);
    return planStore.releasePlan({
      planId: params.planId,
      leaseId: body.leaseId,
      clientTokenId: auth.tokenId,
      workLoop: body.workLoop,
      decision: body.decision,
      reason: body.reason,
      metadata: body.metadata,
    });
  });

  app.post("/api/v1/plans/:planId/complete", async (request, reply) => {
    const auth = await requireTokenScope(request, reply, authStore, "plans:complete");
    if (!auth || !auth.tokenId) {
      return;
    }
    const params = z.object({ planId: z.string().min(1) }).parse(request.params);
    const body = CompletePlanRequestSchema.parse(request.body);
    return planStore.completePlan({
      planId: params.planId,
      leaseId: body.leaseId,
      clientTokenId: auth.tokenId,
      workLoop: body.workLoop,
      decision: body.decision,
      metadata: body.metadata,
    });
  });

  app.setErrorHandler((error: Error, _request, reply) => {
    const statusCode = error.message.includes("not found")
      ? 404
      : error.message.includes("lease") || error.message.includes("already exists")
        ? 409
        : 400;
    reply.code(statusCode).send({ error: error.message });
  });

  return app;
}

function createDefaultWorkItemAuditStore(config: ServerConfig): WorkItemAuditStore {
  const store = config.workItems.store;
  if (store.kind === "memory" || store.kind === "file") {
    return new InMemoryWorkItemAuditStore();
  }
  return createConfiguredWorkItemAuditStore(config);
}

async function createPlanStore(config: ServerConfig): Promise<PlanStore> {
  if (config.persistence.kind === "filesystem") {
    return new FilesystemPlanStore(config.dataDir);
  }
  if (config.persistence.kind === "sql") {
    return createSqlPlanStore(config);
  }
  return createMongoPlanStore(config);
}

async function createAuthStore(config: ServerConfig): Promise<AuthStore> {
  if (config.persistence.kind === "mongodb") {
    return createMongoAuthStore(config);
  }
  return new FilesystemAuthStore(config.dataDir);
}

async function authenticate(request: FastifyRequest, authStore: AuthStore): Promise<AuthContext | undefined> {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const tokenAuth = await authStore.verifyClientToken(header.slice("Bearer ".length).trim());
    return tokenAuth
      ? {
          user: tokenAuth.user,
          userId: tokenAuth.userId,
          tokenId: tokenAuth.tokenId,
          scopes: tokenAuth.scopes,
        }
      : undefined;
  }
  const session = request.cookies.awl_session ?? request.cookies.dwl_session;
  if (!session) {
    return undefined;
  }
  const user = await authStore.getSession(session);
  return user ? { user, userId: user.id, scopes: [] } : undefined;
}

async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
): Promise<AuthContext | undefined> {
  const auth = await authenticate(request, authStore);
  if (!auth) {
    reply.code(401).send({ error: "Authentication required." });
    return undefined;
  }
  return auth;
}

async function requireRoles(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
  roles: UserRole[],
): Promise<AuthContext | undefined> {
  const auth = await requireAuth(request, reply, authStore);
  if (!auth) {
    return undefined;
  }
  if (!roles.some((role) => hasRole(auth.user, role))) {
    reply.code(403).send({ error: "Forbidden." });
    return undefined;
  }
  return auth;
}

async function requireTokenScope(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
  scope: ClientTokenScope,
): Promise<AuthContext | undefined> {
  const auth = await requireAuth(request, reply, authStore);
  if (!auth) {
    return undefined;
  }
  if (!auth.tokenId || !auth.scopes.includes(scope)) {
    reply.code(403).send({ error: `Client token requires ${scope}.` });
    return undefined;
  }
  return auth;
}

function requireScope(auth: AuthContext, scope: ClientTokenScope, reply: FastifyReply): void {
  if (!auth.scopes.includes(scope)) {
    reply.code(403).send({ error: `Client token requires ${scope}.` });
  }
}

function requireScopeForToken(auth: AuthContext, scope: ClientTokenScope, reply: FastifyReply): void {
  if (auth.tokenId) {
    requireScope(auth, scope, reply);
  }
}

/**
 * Auth wrapper used by the work-item routes. Behaviour matches the existing
 * `requireAuth` + scope helpers, with one addition: every auth failure
 * records an `auth_rejected` audit event. The audit payload contains only
 * the URL-derived `workItemId` (if any) and a short sanitized reason
 * naming the missing scope or the absence of credentials. The audit event
 * never includes the request body, headers, token id, or any caller-supplied
 * value.
 *
 * `enforceTokenScopeOnly: true` matches the previous `requireTokenScope`
 * semantics — only a client token can satisfy these endpoints (claim,
 * heartbeat, complete, etc.). `false` matches `requireScopeForToken` —
 * cookie sessions are accepted, and the scope is only enforced when a
 * client token is presented.
 */
async function requireWorkItemAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
  auditStore: WorkItemAuditStore,
  authOptions: {
    scope: ClientTokenScope;
    enforceTokenScopeOnly: boolean;
  },
): Promise<AuthContext | undefined> {
  const workItemId = extractWorkItemIdFromParams(request);
  const auth = await authenticate(request, authStore);
  if (!auth) {
    reply.code(401).send({ error: "Authentication required." });
    await safeRecordAuthRejected(auditStore, workItemId, "authentication required");
    return undefined;
  }
  if (authOptions.enforceTokenScopeOnly) {
    if (!auth.tokenId || !auth.scopes.includes(authOptions.scope)) {
      reply.code(403).send({ error: `Client token requires ${authOptions.scope}.` });
      await safeRecordAuthRejected(
        auditStore,
        workItemId,
        `missing scope ${authOptions.scope}`,
      );
      return undefined;
    }
    return auth;
  }
  if (auth.tokenId && !auth.scopes.includes(authOptions.scope)) {
    reply.code(403).send({ error: `Client token requires ${authOptions.scope}.` });
    await safeRecordAuthRejected(
      auditStore,
      workItemId,
      `missing scope ${authOptions.scope}`,
    );
    return undefined;
  }
  return auth;
}

function extractWorkItemIdFromParams(request: FastifyRequest): string | undefined {
  const params = request.params as { workItemId?: unknown } | undefined;
  if (params && typeof params.workItemId === "string" && params.workItemId.length > 0) {
    return params.workItemId;
  }
  return undefined;
}

async function safeRecordAuthRejected(
  auditStore: WorkItemAuditStore,
  workItemId: string | undefined,
  reason: string,
): Promise<void> {
  try {
    await auditStore.record({
      event_type: "auth_rejected",
      work_item_id: workItemId ?? null,
      actor_ref: null,
      instance_ref: null,
      status_before: null,
      status_after: null,
      job_class: null,
      trust_zone: null,
      authority_class: null,
      redaction_policy: null,
      artifact_refs: [],
      approval_ref: null,
      receipt_ref: null,
      sanitized_reason: sanitizedReason(reason),
      metadata_hash: null,
      payload_hash: null,
    });
  } catch {
    // Audit failures must never cascade into request handling.
  }
}

function hasRole(user: User, role: UserRole): boolean {
  return user.roles.includes(role);
}

function sessionCookieOptions(config: ServerConfig): Parameters<FastifyReply["setCookie"]>[2] {
  return {
    httpOnly: true,
    sameSite: config.cookies.sameSite,
    secure: config.cookies.secure,
    path: "/",
    maxAge: config.session.ttlMs ? Math.floor(config.session.ttlMs / 1000) : undefined,
  };
}

function clearSessionCookieOptions(config: ServerConfig): Parameters<FastifyReply["clearCookie"]>[1] {
  return {
    sameSite: config.cookies.sameSite,
    secure: config.cookies.secure,
    path: "/",
  };
}

async function closeStore(store: unknown): Promise<void> {
  if (
    typeof store === "object" &&
    store !== null &&
    "close" in store &&
    typeof store.close === "function"
  ) {
    await store.close();
  }
}

function rejectUnsafePayload(value: unknown, reply: FastifyReply): boolean {
  if (containsUnsafeString(value)) {
    reply.code(400).send({ error: "Request contains unsupported sensitive-looking data." });
    return true;
  }
  return false;
}

function containsUnsafeString(value: unknown): boolean {
  if (typeof value === "string") {
    return looksSensitive(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsUnsafeString(entry));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((entry) => containsUnsafeString(entry));
  }
  return false;
}

function looksSensitive(value: string): boolean {
  const tokenPrefixes = ["gh" + "p_", "gh" + "o_", "xo" + "xb-", "xo" + "xa-", "xo" + "xp-", "xo" + "xr-", "xo" + "xs-"];
  if (tokenPrefixes.some((prefix) => value.includes(prefix))) {
    return true;
  }
  if (value.includes("AK" + "IA") || value.includes("-----" + "BEGIN")) {
    return true;
  }
  if (new RegExp(`${"sk"}-[A-Za-z0-9]{20,}`).test(value)) {
    return true;
  }
  return new RegExp(`(${"postgresql"}|${"mongodb"}):\\/\\/`).test(value);
}
