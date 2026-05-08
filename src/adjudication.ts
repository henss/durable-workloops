import type { WorkLoop, WorkLoopDecision, WorkLoopSlice } from "./schema.js";
import type { WorkLoopOutcomeLike, WorkLoopPeerReviewLike } from "./outcome.js";

interface WorkLoopAdjudicationInput {
  workLoop: WorkLoop;
  slice: WorkLoopSlice;
  outcome?: WorkLoopOutcomeLike;
  outcomePath?: string;
  peerReview?: WorkLoopPeerReviewLike;
}

export function adjudicateWorkLoopSlice(input: WorkLoopAdjudicationInput): WorkLoopDecision {
  const evidencePaths = [
    input.outcomePath,
    input.peerReview?.reviewArtifactPath,
    input.outcome?.canonicalArtifactPath,
  ].filter((value): value is string => Boolean(value));

  if (!input.outcome) {
    return {
      action: "continue",
      reason: "No outcome artifact was available after execution; keep the slice active.",
      evidencePaths,
      nextOwner: "agent",
      workLoopId: input.workLoop.id,
      sliceId: input.slice.id,
    };
  }

  if (
    input.peerReview?.status === "failed" ||
    input.peerReview?.status === "process_failed"
  ) {
    return {
      action: "repair",
      reason: `Peer review ${input.peerReview.status}; queue a bounded repair before completion.`,
      evidencePaths,
      nextOwner: "agent",
      workLoopId: input.workLoop.id,
      sliceId: input.slice.id,
    };
  }

  if (
    (input.outcome.needsStefan ?? []).length > 0 ||
    input.outcome.continuationDecision.nextStepOwner === "stefan"
  ) {
    return {
      action: "needs_stefan",
      reason: input.outcome.continuationDecision.summary,
      evidencePaths,
      nextOwner: "stefan",
      workLoopId: input.workLoop.id,
      sliceId: input.slice.id,
    };
  }

  if (
    input.outcome.disposition === "stopped" ||
    (input.outcome.blockers ?? []).length > 0 ||
    input.outcome.continuationDecision.stopConditionClass
  ) {
    return {
      action: "blocked",
      reason: input.outcome.continuationDecision.summary,
      evidencePaths,
      nextOwner: "external",
      workLoopId: input.workLoop.id,
      sliceId: input.slice.id,
    };
  }

  if (
    input.outcome.continuationDecision.action === "continue" ||
    (input.outcome.followUp ?? []).some((item) =>
      /\b(?:continue|follow[- ]up|repair|next)\b/i.test(item),
    )
  ) {
    return {
      action: "continue",
      reason: input.outcome.continuationDecision.summary,
      evidencePaths,
      nextOwner: "agent",
      workLoopId: input.workLoop.id,
      sliceId: input.slice.id,
    };
  }

  return {
    action: allSlicesDone(input.workLoop, input.slice.id) ? "done" : "continue",
    reason: input.outcome.continuationDecision.summary,
    evidencePaths,
    nextOwner: "agent",
    workLoopId: input.workLoop.id,
    sliceId: input.slice.id,
  };
}

export function applyWorkLoopDecision(
  workLoop: WorkLoop,
  decision: WorkLoopDecision,
  evidence: {
    outcomePath?: string;
    peerReviewPath?: string;
  } = {},
): WorkLoop {
  const slices = workLoop.slices.map((slice) => {
    if (slice.id !== decision.sliceId) {
      return slice;
    }

    const base = {
      ...slice,
      lastOutcomePath: evidence.outcomePath ?? slice.lastOutcomePath,
      lastPeerReviewPath: evidence.peerReviewPath ?? slice.lastPeerReviewPath,
    };
    if (decision.action === "done") {
      return { ...base, status: "done" as const };
    }
    if (decision.action === "repair") {
      return { ...base, status: "repair_queued" as const };
    }
    if (decision.action === "blocked") {
      return { ...base, status: "blocked" as const };
    }
    if (decision.action === "needs_stefan") {
      return { ...base, status: "needs_stefan" as const };
    }
    if (decision.action === "canceled") {
      return { ...base, status: "canceled" as const };
    }
    if (decision.action === "continue" && evidence.outcomePath) {
      return { ...base, status: "done" as const };
    }
    return { ...base, status: "ready" as const };
  });

  const nextStatus =
    decision.action === "blocked"
      ? "blocked"
      : decision.action === "needs_stefan"
        ? "needs_stefan"
        : decision.action === "canceled"
          ? "canceled"
          : slices.every((slice) => slice.status === "done")
            ? "done"
            : "active";

  return {
    ...workLoop,
    status: nextStatus,
    slices,
  };
}

function allSlicesDone(workLoop: WorkLoop, activeSliceId: string): boolean {
  return workLoop.slices.every((slice) => slice.id === activeSliceId || slice.status === "done");
}
