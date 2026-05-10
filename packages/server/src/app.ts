import path from "node:path";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import {
  ApprovePlanRequestSchema,
  ClaimPlanRequestSchema,
  CompletePlanRequestSchema,
  CreateClientTokenRequestSchema,
  CreateUserRequestSchema,
  LoginRequestSchema,
  RejectPlanRequestSchema,
  SubmitPlanRequestSchema,
  type ClientTokenScope,
  type User,
  type UserRole,
} from "@durable-workloops/api";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import { FilesystemAuthStore, FilesystemPlanStore } from "./filesystem-store.js";
import { createMongoPlanStore } from "./mongodb-store.js";
import { createSqlPlanStore } from "./sql-store.js";
import type { AuthStore, PlanStore } from "./store.js";

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
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const planStore = options.planStore ?? (await createPlanStore(options.config));
  const authStore = options.authStore ?? new FilesystemAuthStore(options.config.dataDir);

  if (options.config.bootstrapAdmin) {
    await authStore.ensureBootstrapAdmin(options.config.bootstrapAdmin);
  }

  await app.register(cookie);

  if (options.config.webDistDir) {
    await app.register(fastifyStatic, {
      root: path.resolve(options.config.webDistDir),
      prefix: "/",
      wildcard: false,
    });
  }

  app.get("/api/v1/health", async () => ({ ok: true }));

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
    const session = await authStore.createSession(user.id);
    reply.setCookie("dwl_session", session, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
    return { user };
  });

  app.post("/api/v1/auth/logout", async (request) => {
    const session = request.cookies.dwl_session;
    if (session) {
      await authStore.revokeSession(session);
    }
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

async function createPlanStore(config: ServerConfig): Promise<PlanStore> {
  if (config.persistence.kind === "filesystem") {
    return new FilesystemPlanStore(config.dataDir);
  }
  if (config.persistence.kind === "sql") {
    return createSqlPlanStore(config);
  }
  return createMongoPlanStore(config);
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
  const session = request.cookies.dwl_session;
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

function hasRole(user: User, role: UserRole): boolean {
  return user.roles.includes(role);
}
