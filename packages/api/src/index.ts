import { z } from "zod";

export const WorkLoopSliceStatusSchema = z.enum([
  "ready",
  "running",
  "reviewing",
  "repair_queued",
  "blocked",
  "needs_stefan",
  "done",
  "canceled",
]);

export const WorkLoopStatusSchema = z.enum([
  "active",
  "blocked",
  "needs_stefan",
  "done",
  "canceled",
]);

export const WorkLoopSliceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: WorkLoopSliceStatusSchema.default("ready"),
  taskPacketPath: z.string().min(1).optional(),
  linearIssueId: z.string().min(1).optional(),
  dependsOn: z.array(z.string().min(1)).default([]),
  attemptCount: z.number().int().min(0).default(0),
  lastOutcomePath: z.string().min(1).optional(),
  lastPeerReviewPath: z.string().min(1).optional(),
});

export const WorkLoopSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  source: z.string().min(1),
  status: WorkLoopStatusSchema.default("active"),
  linearIssueId: z.string().min(1).optional(),
  objective: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
  slices: z.array(WorkLoopSliceSchema).min(1),
  completionPolicy: z.object({
    defaultAction: z.string().min(1),
    stopOnlyFor: z.array(z.string().min(1)).min(1),
  }),
  reviewPolicy: z
    .object({
      required: z.boolean().default(true),
      repairOnReviewFailure: z.boolean().default(true),
    })
    .default({
      required: true,
      repairOnReviewFailure: true,
    }),
  runawayGuard: z
    .object({
      maxConsecutiveAgentRuns: z.number().int().min(1).default(5),
      requireStefanAfter: z.string().min(1).optional(),
    })
    .default({
      maxConsecutiveAgentRuns: 5,
    }),
});

export const PlanApprovalStatusSchema = z.enum([
  "not_required",
  "pending",
  "approved",
  "rejected",
]);

export const PlanStatusSchema = z.enum(["queued", "locked", "completed", "canceled"]);

export const ClientTokenScopeSchema = z.enum([
  "plans:submit",
  "plans:claim",
  "plans:complete",
]);

export const UserRoleSchema = z.enum(["admin", "user", "reviewer"]);

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const PlanLockSchema = z.object({
  leaseId: z.string().min(1),
  clientTokenId: z.string().min(1),
  lockedAt: z.string().min(1),
  expiresAt: z.string().min(1),
});

export const PlanCompletionSchema = z.object({
  completedAt: z.string().min(1),
  completedByTokenId: z.string().min(1),
  metadata: JsonValueSchema,
});

export const AuditEventTypeSchema = z.enum([
  "submit",
  "approve",
  "reject",
  "claim",
  "heartbeat",
  "complete",
  "cancel",
  "token-created",
  "token-revoked",
]);

export const AuditEventSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1).optional(),
  actorUserId: z.string().min(1).optional(),
  actorTokenId: z.string().min(1).optional(),
  type: AuditEventTypeSchema,
  createdAt: z.string().min(1),
  metadata: JsonValueSchema.default({}),
});

export const PlanRecordSchema = z.object({
  id: z.string().min(1),
  workLoop: WorkLoopSchema,
  submitterUserId: z.string().min(1).optional(),
  submitterTokenId: z.string().min(1).optional(),
  approvalRequired: z.boolean(),
  approvalStatus: PlanApprovalStatusSchema,
  status: PlanStatusSchema,
  lock: PlanLockSchema.optional(),
  completion: PlanCompletionSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const SubmitPlanRequestSchema = z.object({
  workLoop: WorkLoopSchema,
  approvalRequired: z.boolean().default(false),
});

export const SubmitPlanResponseSchema = z.object({
  plan: PlanRecordSchema,
});

export const ClaimPlanRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
});

export const ClaimPlanResponseSchema = z.object({
  plan: PlanRecordSchema.optional(),
  leaseId: z.string().min(1).optional(),
});

export const HeartbeatPlanRequestSchema = z.object({
  leaseId: z.string().min(1),
});

export const CompletePlanRequestSchema = z.object({
  leaseId: z.string().min(1),
  metadata: JsonValueSchema.default({}),
});

export const ApprovePlanRequestSchema = z.object({
  reason: z.string().min(1).optional(),
});

export const RejectPlanRequestSchema = z.object({
  reason: z.string().min(1).optional(),
});

export const CreateClientTokenRequestSchema = z.object({
  name: z.string().min(1),
  scopes: z.array(ClientTokenScopeSchema).min(1),
  expiresAt: z.string().min(1).optional(),
});

export const CreatedClientTokenSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  token: z.string().min(1),
  scopes: z.array(ClientTokenScopeSchema),
  expiresAt: z.string().min(1).optional(),
  createdAt: z.string().min(1),
});

export const PublicClientTokenSchema = CreatedClientTokenSchema.omit({ token: true }).extend({
  revokedAt: z.string().min(1).optional(),
  lastUsedAt: z.string().min(1).optional(),
});

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).optional(),
  roles: z.array(UserRoleSchema).min(1),
  disabledAt: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  roles: z.array(UserRoleSchema).min(1).default(["user"]),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const AuthSessionSchema = z.object({
  user: UserSchema,
});

export const AuthSetupStatusSchema = z.object({
  usersExist: z.boolean(),
  bootstrapConfigured: z.boolean(),
});

export type PlanApprovalStatus = z.infer<typeof PlanApprovalStatusSchema>;
export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type ClientTokenScope = z.infer<typeof ClientTokenScopeSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type PlanLock = z.infer<typeof PlanLockSchema>;
export type PlanCompletion = z.infer<typeof PlanCompletionSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type PlanRecord = z.infer<typeof PlanRecordSchema>;
export type SubmitPlanRequest = z.infer<typeof SubmitPlanRequestSchema>;
export type ClaimPlanRequest = z.infer<typeof ClaimPlanRequestSchema>;
export type ClaimPlanResponse = z.infer<typeof ClaimPlanResponseSchema>;
export type CompletePlanRequest = z.infer<typeof CompletePlanRequestSchema>;
export type CreatedClientToken = z.infer<typeof CreatedClientTokenSchema>;
export type PublicClientToken = z.infer<typeof PublicClientTokenSchema>;
export type User = z.infer<typeof UserSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type AuthSetupStatus = z.infer<typeof AuthSetupStatusSchema>;
export type WorkLoop = z.infer<typeof WorkLoopSchema>;

export class AgentWorkloopsApiClient {
  constructor(
    private readonly options: {
      serverUrl: string;
      token?: string;
      fetch?: typeof fetch;
    },
  ) {}

  async submitPlan(input: SubmitPlanRequest): Promise<PlanRecord> {
    const response = await this.request("/api/v1/plans", {
      method: "POST",
      body: JSON.stringify(SubmitPlanRequestSchema.parse(input)),
    });
    return SubmitPlanResponseSchema.parse(await response.json()).plan;
  }

  async claimPlan(input: ClaimPlanRequest = {}): Promise<ClaimPlanResponse> {
    const response = await this.request("/api/v1/plans/claim", {
      method: "POST",
      body: JSON.stringify(ClaimPlanRequestSchema.parse(input)),
    });
    return ClaimPlanResponseSchema.parse(await response.json());
  }

  async heartbeatPlan(planId: string, leaseId: string): Promise<PlanRecord> {
    const response = await this.request(`/api/v1/plans/${encodeURIComponent(planId)}/heartbeat`, {
      method: "POST",
      body: JSON.stringify(HeartbeatPlanRequestSchema.parse({ leaseId })),
    });
    return PlanRecordSchema.parse(await response.json());
  }

  async completePlan(planId: string, input: CompletePlanRequest): Promise<PlanRecord> {
    const response = await this.request(`/api/v1/plans/${encodeURIComponent(planId)}/complete`, {
      method: "POST",
      body: JSON.stringify(CompletePlanRequestSchema.parse(input)),
    });
    return PlanRecordSchema.parse(await response.json());
  }

  async listPlans(): Promise<PlanRecord[]> {
    const response = await this.request("/api/v1/plans", { method: "GET" });
    return z.array(PlanRecordSchema).parse(await response.json());
  }

  async approvePlan(planId: string, reason?: string): Promise<PlanRecord> {
    const response = await this.request(`/api/v1/plans/${encodeURIComponent(planId)}/approve`, {
      method: "POST",
      body: JSON.stringify(ApprovePlanRequestSchema.parse({ reason })),
    });
    return PlanRecordSchema.parse(await response.json());
  }

  async rejectPlan(planId: string, reason?: string): Promise<PlanRecord> {
    const response = await this.request(`/api/v1/plans/${encodeURIComponent(planId)}/reject`, {
      method: "POST",
      body: JSON.stringify(RejectPlanRequestSchema.parse({ reason })),
    });
    return PlanRecordSchema.parse(await response.json());
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const fetchImpl = this.options.fetch ?? fetch;
    const response = await fetchImpl(new URL(path, this.options.serverUrl), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Agent Workloops API ${response.status}: ${await response.text()}`);
    }
    return response;
  }
}

export const DurableWorkloopsApiClient = AgentWorkloopsApiClient;
