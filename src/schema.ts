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

export const WorkLoopCompletionPolicySchema = z.object({
  defaultAction: z.string().min(1),
  stopOnlyFor: z.array(z.string().min(1)).min(1),
});

export const WorkLoopReviewPolicySchema = z.preprocess(
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
);

export const WorkLoopRunawayGuardSchema = z.object({
  maxConsecutiveAgentRuns: z.number().int().min(1).default(5),
  requireStefanAfter: z.string().min(1).optional(),
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
  completionPolicy: WorkLoopCompletionPolicySchema,
  reviewPolicy: WorkLoopReviewPolicySchema.default({
    required: true,
    sliceReview: "required",
    finalReview: "required",
    repairOnReviewFailure: true,
    providers: [],
  }),
  runawayGuard: WorkLoopRunawayGuardSchema.default({
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

export const WorkLoopCurrentStateSchema = z.object({
  workLoop: WorkLoopSchema,
  updatedAt: z.string().min(1),
  lastDecision: WorkLoopDecisionSchema.optional(),
});

export type WorkLoop = z.infer<typeof WorkLoopSchema>;
export type WorkLoopSlice = z.infer<typeof WorkLoopSliceSchema>;
export type WorkLoopStatus = z.infer<typeof WorkLoopStatusSchema>;
export type WorkLoopSliceStatus = z.infer<typeof WorkLoopSliceStatusSchema>;
export type WorkLoopReviewMode = z.infer<typeof WorkLoopReviewModeSchema>;
export type WorkLoopReviewProvider = z.infer<typeof WorkLoopReviewProviderSchema>;
export type WorkLoopDecision = z.infer<typeof WorkLoopDecisionSchema>;
export type WorkLoopDecisionAction = z.infer<typeof WorkLoopDecisionActionSchema>;
export type WorkLoopCurrentState = z.infer<typeof WorkLoopCurrentStateSchema>;

function normalizeReviewPolicyInput(value: unknown): unknown {
  if (value === undefined) {
    return {
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
