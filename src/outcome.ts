export interface WorkLoopContinuationDecisionLike {
  action: string;
  summary: string;
  nextStepOwner?: "agent" | "stefan" | "external" | string;
  stopConditionClass?: string;
}

export interface WorkLoopOutcomeLike {
  disposition?: string;
  continuationDecision: WorkLoopContinuationDecisionLike;
  needsStefan?: unknown[];
  blockers?: unknown[];
  followUp?: string[];
  canonicalArtifactPath?: string;
}

export interface WorkLoopPeerReviewLike {
  status: "pending" | "passed" | "failed" | "process_failed";
  reviewArtifactPath?: string;
}
