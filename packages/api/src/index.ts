import { z } from "zod";

export * from "./work-items.js";

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

export const WorkLoopDecisionActionSchema = z.enum([
  "continue",
  "repair",
  "blocked",
  "needs_stefan",
  "done",
  "canceled",
]);

export const WorkLoopReviewModeSchema = z.enum([
  "disabled",
  "optional",
  "required",
]);

export const WorkLoopReviewProviderSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

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
    .preprocess(
      normalizeReviewPolicyInput,
      z
        .object({
          sliceReview: WorkLoopReviewModeSchema.default("required"),
          finalReview: WorkLoopReviewModeSchema.default("required"),
          repairOnReviewFailure: z.boolean().default(true),
          providers: z.array(WorkLoopReviewProviderSchema).default([]),
          required: z.boolean().optional(),
        })
        .transform((policy) => ({
          ...policy,
          required:
            policy.required ??
            (policy.sliceReview === "required" || policy.finalReview === "required"),
        })),
    )
    .default({
      required: true,
      sliceReview: "required",
      finalReview: "required",
      repairOnReviewFailure: true,
      providers: [],
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

export const WorkLoopDecisionSchema = z.object({
  action: WorkLoopDecisionActionSchema,
  reason: z.string().min(1),
  evidencePaths: z.array(z.string().min(1)).default([]),
  nextOwner: z.enum(["agent", "stefan", "external"]).optional(),
  workLoopId: z.string().min(1),
  sliceId: z.string().min(1).optional(),
});

export const PlanApprovalStatusSchema = z.enum([
  "not_required",
  "pending",
  "approved",
  "rejected",
]);

export const PlanStatusSchema = z.enum([
  "queued",
  "locked",
  "blocked",
  "completed",
  "canceled",
]);

export const ClientTokenScopeSchema = z.enum([
  "plans:submit",
  "plans:claim",
  "plans:complete",
  "work_items:read",
  "work_items:create",
  "work_items:transition",
  "work_items:claim",
  "work_items:heartbeat",
  "work_items:complete",
  "work_items:cancel",
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
  "request_review",
  "claim",
  "heartbeat",
  "progress",
  "release",
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
  planId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});

export const ClaimPlanResponseSchema = z.object({
  plan: PlanRecordSchema.optional(),
  leaseId: z.string().min(1).optional(),
});

export const HeartbeatPlanRequestSchema = z.object({
  leaseId: z.string().min(1),
});

export const ProgressPlanRequestSchema = z.object({
  leaseId: z.string().min(1),
  workLoop: WorkLoopSchema,
  decision: WorkLoopDecisionSchema.optional(),
  metadata: JsonValueSchema.default({}),
});

export const ReleasePlanReasonSchema = z.enum([
  "ready",
  "review_needed",
  "blocked",
  "needs_stefan",
  "failed",
  "canceled",
  "max_slices",
]);

export const ReleasePlanRequestSchema = z.object({
  leaseId: z.string().min(1),
  workLoop: WorkLoopSchema,
  decision: WorkLoopDecisionSchema.optional(),
  reason: ReleasePlanReasonSchema,
  metadata: JsonValueSchema.default({}),
});

export const CompletePlanRequestSchema = z.object({
  leaseId: z.string().min(1),
  workLoop: WorkLoopSchema.optional(),
  decision: WorkLoopDecisionSchema.optional(),
  metadata: JsonValueSchema.default({}),
});

export const ApprovePlanRequestSchema = z.object({
  reason: z.string().min(1).optional(),
});

export const RejectPlanRequestSchema = z.object({
  reason: z.string().min(1).optional(),
});

export const RequestReviewPlanRequestSchema = z.object({
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
export type WorkLoopDecision = z.infer<typeof WorkLoopDecisionSchema>;
export type WorkLoopReviewMode = z.infer<typeof WorkLoopReviewModeSchema>;
export type WorkLoopReviewProvider = z.infer<typeof WorkLoopReviewProviderSchema>;
export type SubmitPlanRequest = z.infer<typeof SubmitPlanRequestSchema>;
export type ClaimPlanRequest = z.infer<typeof ClaimPlanRequestSchema>;
export type ClaimPlanResponse = z.infer<typeof ClaimPlanResponseSchema>;
export type ProgressPlanRequest = z.infer<typeof ProgressPlanRequestSchema>;
export type ReleasePlanReason = z.infer<typeof ReleasePlanReasonSchema>;
export type ReleasePlanRequest = z.infer<typeof ReleasePlanRequestSchema>;
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

  async getPlan(planId: string): Promise<{ plan: PlanRecord; audit: AuditEvent[] }> {
    const response = await this.request(`/api/v1/plans/${encodeURIComponent(planId)}`, {
      method: "GET",
    });
    return z
      .object({ plan: PlanRecordSchema, audit: z.array(AuditEventSchema) })
      .parse(await response.json());
  }

  async heartbeatPlan(planId: string, leaseId: string): Promise<PlanRecord> {
    const response = await this.request(`/api/v1/plans/${encodeURIComponent(planId)}/heartbeat`, {
      method: "POST",
      body: JSON.stringify(HeartbeatPlanRequestSchema.parse({ leaseId })),
    });
    return PlanRecordSchema.parse(await response.json());
  }

  async progressPlan(planId: string, input: ProgressPlanRequest): Promise<PlanRecord> {
    const response = await this.request(`/api/v1/plans/${encodeURIComponent(planId)}/progress`, {
      method: "POST",
      body: JSON.stringify(ProgressPlanRequestSchema.parse(input)),
    });
    return PlanRecordSchema.parse(await response.json());
  }

  async releasePlan(planId: string, input: ReleasePlanRequest): Promise<PlanRecord> {
    const response = await this.request(`/api/v1/plans/${encodeURIComponent(planId)}/release`, {
      method: "POST",
      body: JSON.stringify(ReleasePlanRequestSchema.parse(input)),
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

  async listPlans(input: { includeCompleted?: boolean } = {}): Promise<PlanRecord[]> {
    const query = input.includeCompleted ? "?includeCompleted=true" : "";
    const response = await this.request(`/api/v1/plans${query}`, { method: "GET" });
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

  async requestPlanReview(planId: string, reason?: string): Promise<PlanRecord> {
    const response = await this.request(`/api/v1/plans/${encodeURIComponent(planId)}/request-review`, {
      method: "POST",
      body: JSON.stringify(RequestReviewPlanRequestSchema.parse({ reason })),
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

function normalizeReviewPolicyInput(value: unknown): unknown {
  if (value === undefined) {
    return {
      required: true,
      sliceReview: "required",
      finalReview: "required",
      repairOnReviewFailure: true,
      providers: [],
    };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const legacyRequired = typeof record.required === "boolean" ? record.required : undefined;
  const legacyMode = legacyRequired === false ? "disabled" : "required";
  return {
    ...record,
    sliceReview: record.sliceReview ?? legacyMode,
    finalReview: record.finalReview ?? legacyMode,
    repairOnReviewFailure: record.repairOnReviewFailure ?? true,
    providers: record.providers ?? [],
  };
}
