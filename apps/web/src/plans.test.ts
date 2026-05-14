import { describe, expect, it } from "vitest";
import type { PlanRecord } from "@agent-workloops/api";
import { bucketPlans } from "./plans.js";

const basePlan: PlanRecord = {
  id: "plan",
  workLoop: {
    id: "loop",
    projectId: "project",
    source: "test",
    objective: "Review",
    successCriteria: ["ok"],
    slices: [{ id: "slice", title: "Slice", status: "ready", dependsOn: [], attemptCount: 0 }],
    completionPolicy: { defaultAction: "continue", stopOnlyFor: ["done"] },
    reviewPolicy: {
      required: true,
      sliceReview: "required",
      finalReview: "required",
      repairOnReviewFailure: true,
      providers: [],
    },
    runawayGuard: { maxConsecutiveAgentRuns: 5 },
    status: "active",
  },
  approvalRequired: false,
  approvalStatus: "not_required",
  status: "queued",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe("bucketPlans", () => {
  it("groups pending, claimable, and locked plans", () => {
    const buckets = bucketPlans([
      { ...basePlan, id: "pending", approvalStatus: "pending" },
      { ...basePlan, id: "claimable" },
      { ...basePlan, id: "locked", status: "locked" },
    ]);
    expect(buckets.pending.map((plan) => plan.id)).toEqual(["pending"]);
    expect(buckets.claimable.map((plan) => plan.id)).toEqual(["claimable"]);
    expect(buckets.locked.map((plan) => plan.id)).toEqual(["locked"]);
  });
});
