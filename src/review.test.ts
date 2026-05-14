import { describe, expect, it } from "vitest";
import type { WorkLoop } from "./schema.js";
import {
  evaluateWorkLoopFinalReview,
  resolveWorkLoopReviewConfig,
  withWorkLoopSliceReviewIdentity,
  type WorkLoopExecutionReview,
} from "./review.js";

describe("resolveWorkLoopReviewConfig", () => {
  it("uses defaults for required reviews without provider-specific policy", () => {
    expect(
      resolveWorkLoopReviewConfig({
        workLoop: baseWorkLoop(),
        defaultProviders: ["example-reviewer"],
        noneProvider: "none",
      }),
    ).toEqual({
      sliceReview: "required",
      finalReview: "required",
      repairOnReviewFailure: true,
      providers: ["example-reviewer"],
    });
  });

  it("rejects a disabled provider for required reviews", () => {
    expect(() =>
      resolveWorkLoopReviewConfig({
        workLoop: baseWorkLoop(),
        reviewProviders: ["none"],
        noneProvider: "none",
      }),
    ).toThrow("Required WorkLoop reviews need at least one real review provider.");
  });
});

describe("evaluateWorkLoopFinalReview", () => {
  it("passes when all slices are done and latest slice reviews passed", () => {
    const reviews = [
      review("slice-1", "process_failed", "Earlier attempt failed."),
      review("slice-1", "passed", "Repair passed."),
    ];

    expect(
      evaluateWorkLoopFinalReview({
        workLoop: baseWorkLoop({ status: "done", slices: [doneSlice()] }),
        sliceReviews: reviews,
        provider: "example-reviewer",
      }),
    ).toMatchObject({
      scope: "final",
      provider: "example-reviewer",
      status: "passed",
      requiredRepairs: [],
    });
  });

  it("blocks on the latest failed slice review", () => {
    const reviews = [
      review("slice-1", "passed", "Earlier attempt passed."),
      review("slice-1", "failed", "Evidence is incomplete."),
    ];

    expect(
      evaluateWorkLoopFinalReview({
        workLoop: baseWorkLoop({ status: "done", slices: [doneSlice()] }),
        sliceReviews: reviews,
        provider: "example-reviewer",
      }),
    ).toMatchObject({
      status: "failed",
      requiredRepairs: ["Evidence is incomplete."],
    });
  });

  it("blocks unfinished slices before completion", () => {
    expect(
      evaluateWorkLoopFinalReview({
        workLoop: baseWorkLoop(),
        sliceReviews: [review("slice-1", "passed", "Passed.")],
        provider: "example-reviewer",
      }),
    ).toMatchObject({
      status: "failed",
      requiredRepairs: ["Complete or classify unfinished slice slice-1."],
    });
  });

  it("adds slice identity to slice-scoped review records", () => {
    expect(withWorkLoopSliceReviewIdentity(review(undefined, "passed", "Passed."), "slice-1")).toMatchObject({
      scope: "slice",
      sliceId: "slice-1",
    });
  });
});

function baseWorkLoop(overrides: Partial<WorkLoop> = {}): WorkLoop {
  return {
    id: "wl-review",
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
      sliceReview: "required",
      finalReview: "required",
      repairOnReviewFailure: true,
      providers: [],
    },
    runawayGuard: {
      maxConsecutiveAgentRuns: 3,
    },
    slices: [
      {
        id: "slice-1",
        title: "First slice",
        status: "ready",
        dependsOn: [],
        attemptCount: 0,
      },
    ],
    ...overrides,
  };
}

function doneSlice(): WorkLoop["slices"][number] {
  return {
    id: "slice-1",
    title: "First slice",
    status: "done",
    dependsOn: [],
    attemptCount: 1,
  };
}

function review(
  sliceId: string | undefined,
  status: WorkLoopExecutionReview["status"],
  summary: string,
): WorkLoopExecutionReview {
  return {
    scope: "slice",
    ...(sliceId ? { sliceId } : {}),
    provider: "example-reviewer",
    status,
    summary,
    requiredRepairs: status === "failed" || status === "process_failed" ? [summary] : [],
  };
}
