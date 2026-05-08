import { describe, expect, it } from "vitest";
import type { WorkLoop } from "./schema.js";
import { markSliceRunning, selectNextWorkLoopSlice } from "./selection.js";

function makeWorkLoop(): WorkLoop {
  return {
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
        status: "done",
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
      {
        id: "slice_3",
        title: "Third slice",
        status: "ready",
        dependsOn: ["slice_2"],
        attemptCount: 0,
      },
    ],
  };
}

describe("selectNextWorkLoopSlice", () => {
  it("selects the first ready slice whose dependencies are done", () => {
    expect(selectNextWorkLoopSlice(makeWorkLoop())?.id).toBe("slice_2");
  });

  it("increments attempt count when marking a slice running", () => {
    const next = markSliceRunning(makeWorkLoop(), "slice_2");

    expect(next.slices[1]?.status).toBe("running");
    expect(next.slices[1]?.attemptCount).toBe(1);
  });
});
