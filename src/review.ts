import type { WorkLoop, WorkLoopReviewMode } from "./schema.js";

export type WorkLoopReviewScope = "slice" | "final";
export type WorkLoopExecutionReviewStatus = "passed" | "failed" | "process_failed" | "skipped";

export interface WorkLoopExecutionReview<ProviderId extends string = string> {
  scope: WorkLoopReviewScope;
  sliceId?: string;
  provider: ProviderId;
  status: WorkLoopExecutionReviewStatus;
  summary: string;
  artifactPath?: string;
  requiredRepairs: string[];
}

export interface ResolvedWorkLoopReviewConfig<ProviderId extends string = string> {
  sliceReview: WorkLoopReviewMode;
  finalReview: WorkLoopReviewMode;
  repairOnReviewFailure: boolean;
  providers: ProviderId[];
}

export interface ResolveWorkLoopReviewConfigInput<ProviderId extends string = string> {
  workLoop: WorkLoop;
  sliceReview?: WorkLoopReviewMode;
  finalReview?: WorkLoopReviewMode;
  repairOnReviewFailure?: boolean;
  reviewProviders?: ProviderId[];
  defaultProviders?: ProviderId[];
  noneProvider?: ProviderId;
}

export interface EvaluateWorkLoopFinalReviewInput<ProviderId extends string = string> {
  workLoop: WorkLoop;
  sliceReviews: WorkLoopExecutionReview<ProviderId>[];
  provider: ProviderId;
}

export function resolveWorkLoopReviewConfig<ProviderId extends string = string>(
  input: ResolveWorkLoopReviewConfigInput<ProviderId>,
): ResolvedWorkLoopReviewConfig<ProviderId> {
  const policy = input.workLoop.reviewPolicy;
  const sliceReview = input.sliceReview ?? policy.sliceReview ?? (policy.required ? "required" : "disabled");
  const finalReview = input.finalReview ?? policy.finalReview ?? (policy.required ? "required" : "disabled");
  const providerIds = policy.providers.map((provider) => provider.id as ProviderId);
  const providers =
    input.reviewProviders ??
    (providerIds.length > 0
      ? providerIds
      : requiredReviewConfigured(sliceReview, finalReview)
        ? (input.defaultProviders ?? [])
        : input.noneProvider
          ? [input.noneProvider]
          : []);
  const normalizedProviders = providers.length === 0 ? [] : providers;
  if (requiredReviewConfigured(sliceReview, finalReview)) {
    if (normalizedProviders.length === 0) {
      throw new Error("Required WorkLoop reviews need at least one real review provider.");
    }
    if (input.noneProvider && normalizedProviders.includes(input.noneProvider)) {
      throw new Error("Required WorkLoop reviews need at least one real review provider.");
    }
  }
  return {
    sliceReview,
    finalReview,
    repairOnReviewFailure: input.repairOnReviewFailure ?? policy.repairOnReviewFailure ?? true,
    providers: normalizedProviders,
  };
}

export function withWorkLoopSliceReviewIdentity<ProviderId extends string>(
  review: WorkLoopExecutionReview<ProviderId>,
  sliceId: string | undefined,
): WorkLoopExecutionReview<ProviderId> {
  if (review.scope !== "slice" || !sliceId) {
    return review;
  }
  return { ...review, sliceId };
}

export function latestWorkLoopSliceReviews<ProviderId extends string>(
  workLoop: WorkLoop,
  reviews: WorkLoopExecutionReview<ProviderId>[],
): WorkLoopExecutionReview<ProviderId>[] {
  const completedSliceIds = new Set(
    workLoop.slices.filter((slice) => slice.status === "done").map((slice) => slice.id),
  );
  const latestBySliceAndProvider = new Map<string, WorkLoopExecutionReview<ProviderId>>();
  for (const review of reviews) {
    if (review.scope !== "slice") {
      continue;
    }
    if (review.sliceId && !completedSliceIds.has(review.sliceId)) {
      continue;
    }
    latestBySliceAndProvider.set(sliceReviewKey(review), review);
  }
  return Array.from(latestBySliceAndProvider.values());
}

export function blockingLatestWorkLoopSliceReviews<ProviderId extends string>(
  workLoop: WorkLoop,
  reviews: WorkLoopExecutionReview<ProviderId>[],
): WorkLoopExecutionReview<ProviderId>[] {
  return latestWorkLoopSliceReviews(workLoop, reviews).filter(isBlockingReview);
}

export function evaluateWorkLoopFinalReview<ProviderId extends string>(
  input: EvaluateWorkLoopFinalReviewInput<ProviderId>,
): WorkLoopExecutionReview<ProviderId> {
  const unfinishedSlices = input.workLoop.slices.filter((slice) => slice.status !== "done");
  const failedSliceReviews = blockingLatestWorkLoopSliceReviews(input.workLoop, input.sliceReviews);
  const done = input.workLoop.status === "done" && unfinishedSlices.length === 0;
  return {
    scope: "final",
    provider: input.provider,
    status: done && failedSliceReviews.length === 0 ? "passed" : "failed",
    summary:
      done && failedSliceReviews.length === 0
        ? "All slices are done and no slice review failed."
        : "Final gate found unfinished slices or failed slice reviews.",
    requiredRepairs: [
      ...unfinishedSlices.map((slice) => `Complete or classify unfinished slice ${slice.id}.`),
      ...failedSliceReviews.map((review) => review.summary),
    ],
  };
}

function requiredReviewConfigured(...modes: WorkLoopReviewMode[]): boolean {
  return modes.some((mode) => mode === "required");
}

function isBlockingReview(review: WorkLoopExecutionReview): boolean {
  return review.status === "failed" || review.status === "process_failed";
}

function sliceReviewKey(review: WorkLoopExecutionReview): string {
  return `${review.sliceId ?? "__legacy_slice_review"}:${review.provider}`;
}
