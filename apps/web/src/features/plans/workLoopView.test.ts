import { describe, expect, it } from "vitest";
import type { WorkLoop } from "@agent-workloops/api";
import { countSlicesByStatus, getBlockedByLabels, getSliceProgress } from "./workLoopView.js";

const workLoop: WorkLoop = {
  id: "loop",
  projectId: "project",
  source: "test",
  status: "active",
  objective: "Ship a useful change",
  successCriteria: ["Tests pass"],
  slices: [
    { id: "a", title: "First slice", status: "done", dependsOn: [], attemptCount: 1 },
    { id: "b", title: "Second slice", status: "ready", dependsOn: ["a", "external"], attemptCount: 0 },
  ],
  completionPolicy: { defaultAction: "continue", stopOnlyFor: ["done"] },
  reviewPolicy: { required: true, repairOnReviewFailure: true },
  runawayGuard: { maxConsecutiveAgentRuns: 5 },
};

describe("workLoopView", () => {
  it("derives status counts and progress", () => {
    expect(countSlicesByStatus(workLoop)).toEqual({ done: 1, ready: 1 });
    expect(getSliceProgress(workLoop)).toEqual({ completed: 1, total: 2, value: 50 });
  });

  it("labels dependencies by slice title when possible", () => {
    expect(getBlockedByLabels(workLoop.slices[1]!, workLoop)).toEqual(["First slice", "external"]);
  });
});
