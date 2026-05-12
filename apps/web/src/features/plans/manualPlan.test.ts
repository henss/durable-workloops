import { describe, expect, it } from "vitest";
import { parseManualPlanSubmission } from "./manualPlan.js";

describe("parseManualPlanSubmission", () => {
  it("accepts a JSON WorkLoop and wraps it as a submit request", () => {
    const request = parseManualPlanSubmission(JSON.stringify(workLoop()), true);

    expect(request.approvalRequired).toBe(true);
    expect(request.workLoop.id).toBe("manual-loop");
  });

  it("accepts YAML submit request input", () => {
    const request = parseManualPlanSubmission(
      `approvalRequired: false
workLoop:
  id: manual-loop
  projectId: project
  source: manual
  objective: Submit by hand
  successCriteria:
    - Plan submitted
  slices:
    - id: slice-1
      title: First slice
  completionPolicy:
    defaultAction: continue
    stopOnlyFor:
      - done
`,
      true,
    );

    expect(request.approvalRequired).toBe(true);
    expect(request.workLoop.slices[0]?.status).toBe("ready");
  });

  it("rejects invalid input", () => {
    expect(() => parseManualPlanSubmission("not: [valid", true)).toThrow();
  });
});

function workLoop(): unknown {
  return {
    id: "manual-loop",
    projectId: "project",
    source: "manual",
    objective: "Submit by hand",
    successCriteria: ["Plan submitted"],
    slices: [{ id: "slice-1", title: "First slice" }],
    completionPolicy: { defaultAction: "continue", stopOnlyFor: ["done"] },
  };
}
