import {
  PlanReviewEvidenceSchema,
  type JsonValue,
  type PlanRecord,
  type PlanReviewEvidence,
} from "@agent-workloops/api";

export function normalizePlanReviewEvidence(input: {
  plan: PlanRecord;
  evidence: PlanReviewEvidence;
  now?: string;
}): PlanReviewEvidence {
  if (
    input.plan.reviewEvidence.some(
      (evidence) => evidence.reviewEvidenceId === input.evidence.reviewEvidenceId,
    )
  ) {
    throw new Error(`Review evidence already exists: ${input.evidence.reviewEvidenceId}`);
  }
  const planId = input.evidence.planId ?? input.plan.id;
  if (input.evidence.planId && input.evidence.planId !== input.plan.id) {
    throw new Error("Review evidence planId does not match the route plan.");
  }
  return PlanReviewEvidenceSchema.parse({
    ...input.evidence,
    planId,
    createdAt: input.evidence.createdAt || input.now || new Date().toISOString(),
  });
}

export function assertCanAttachReviewEvidence(plan: PlanRecord): void {
  if (plan.status !== "completed" || !plan.completion) {
    throw new Error("Review evidence can only be attached to a completed plan.");
  }
}

export function reviewEvidenceAuditMetadata(evidence: PlanReviewEvidence): JsonValue {
  return {
    reviewEvidenceId: evidence.reviewEvidenceId,
    source: evidence.source,
    status: evidence.status,
    severityRollup: evidence.severityRollup,
    findingCount: evidence.findings.length,
    artifactRefs: evidence.artifactRefs,
  };
}
