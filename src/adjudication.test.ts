import { describe, expect, it } from "vitest";
import type { WorkLoop } from "./schema.js";
import { adjudicateWorkLoopSlice, applyWorkLoopDecision } from "./adjudication.js";

const workLoop: WorkLoop = {
  id: "wl_test",
  projectId: "example",
  source: "test",
  status: "active",
  objective: "Run durable work.",
  successCriteria: ["All slices complete."],
  completionPolicy: {
    defaultAction: "continue",
    stopOnlyFor: ["blocked", "needs_stefan", "done"],
  },
  reviewPolicy: {
    required: true,
    repairOnReviewFailure: true,
  },
  runawayGuard: {
    maxConsecutiveAgentRuns: 3,
  },
  slices: [
    {
      id: "slice_1",
      title: "First slice",
      status: "running",
      dependsOn: [],
      attemptCount: 1,
    },
    {
      id: "slice_2",
      title: "Second slice",
      status: "ready",
      dependsOn: ["slice_1"],
      attemptCount: 0,
    },
  ],
};

describe("adjudicateWorkLoopSlice", () => {
  it("queues repair when peer review fails", () => {
    const decision = adjudicateWorkLoopSlice({
      workLoop,
      slice: workLoop.slices[0]!,
      outcomePath: "outcome.json",
      outcome: {
        disposition: "completed",
        continuationDecision: {
          action: "complete",
          summary: "Implemented.",
          nextStepOwner: "agent",
        },
      },
      peerReview: {
        status: "failed",
        reviewArtifactPath: "review.md",
      },
    });

    expect(decision.action).toBe("repair");
    expect(applyWorkLoopDecision(workLoop, decision).slices[0]?.status).toBe("repair_queued");
  });

  it("queues repair before trusting blockers from a failed outcome review", () => {
    const decision = adjudicateWorkLoopSlice({
      workLoop,
      slice: workLoop.slices[0]!,
      outcomePath: "outcome.json",
      outcome: {
        disposition: "completed",
        blockers: ["Outcome used blocker for a non-terminal caveat."],
        continuationDecision: {
          action: "continue",
          summary: "Continue after investigation.",
          nextStepOwner: "agent",
        },
      },
      peerReview: {
        status: "failed",
        reviewArtifactPath: "review.md",
      },
    });

    expect(decision.action).toBe("repair");
  });

  it("marks the loop done only when the final open slice is complete", () => {
    const almostDone: WorkLoop = {
      ...workLoop,
      slices: [
        { ...workLoop.slices[0]!, status: "done" },
        { ...workLoop.slices[1]!, status: "running", attemptCount: 1 },
      ],
    };

    const decision = adjudicateWorkLoopSlice({
      workLoop: almostDone,
      slice: almostDone.slices[1]!,
      outcomePath: "outcome.json",
      outcome: {
        disposition: "completed",
        continuationDecision: {
          action: "complete",
          summary: "All done.",
          nextStepOwner: "agent",
        },
      },
      peerReview: {
        status: "passed",
        reviewArtifactPath: "review.md",
      },
    });
    const next = applyWorkLoopDecision(almostDone, decision, {
      outcomePath: "outcome.json",
      peerReviewPath: "review.md",
    });

    expect(decision.action).toBe("done");
    expect(next.status).toBe("done");
    expect(next.slices.every((slice) => slice.status === "done")).toBe(true);
  });
});
