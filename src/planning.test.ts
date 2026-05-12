import { describe, expect, it } from "vitest";
import {
  parseWorkLoopPlanningResult,
  renderWorkLoopPlanningPrompt,
} from "./planning.js";

describe("WorkLoop planning helpers", () => {
  it("renders a public-safe requirements planning prompt", () => {
    const prompt = renderWorkLoopPlanningPrompt({
      requirements: "Add a queue for messages and launch agents from it.",
      targetProjectId: "sap-ui",
      projectHints: [{ id: "sap-ui", label: "SAP UI" }],
      resultPath: "/tmp/result.json",
    });

    expect(prompt).toContain("Add a queue for messages");
    expect(prompt).toContain("sap-ui (SAP UI)");
    expect(prompt).toContain("/tmp/result.json");
    expect(prompt).toContain("Do not include secrets");
    expect(prompt).not.toContain("SMARTSEER");
    expect(prompt).not.toContain("Slack");
  });

  it("parses and validates a valid planning result", () => {
    const result = parseWorkLoopPlanningResult(JSON.stringify(validPlanningResult()));

    expect(result.workLoop.id).toBe("message-cockpit");
    expect(result.workLoop.slices).toHaveLength(2);
    expect(result.evidence).toEqual([{ label: "repo", value: "sap-ui" }]);
  });

  it("rejects invalid or incomplete WorkLoop output", () => {
    expect(() => parseWorkLoopPlanningResult(JSON.stringify({ workLoop: { id: "missing" } }))).toThrow();
  });
});

function validPlanningResult(): unknown {
  return {
    workLoop: {
      id: "message-cockpit",
      projectId: "sap-ui",
      source: "requirements-planner",
      status: "active",
      objective: "Add a message cockpit to the UI.",
      successCriteria: ["The cockpit can show messages.", "An agent can be launched."],
      slices: [
        { id: "slice-1", title: "Inspect existing UI", status: "ready", dependsOn: [], attemptCount: 0 },
        { id: "slice-2", title: "Build cockpit", status: "ready", dependsOn: ["slice-1"], attemptCount: 0 },
      ],
      completionPolicy: { defaultAction: "continue", stopOnlyFor: ["blocked", "needs_stefan", "done"] },
      reviewPolicy: { required: true, repairOnReviewFailure: true },
      runawayGuard: { maxConsecutiveAgentRuns: 3 },
    },
    selectedProjectId: "sap-ui",
    routingRationale: "The requirement names the SAP UI.",
    evidence: [{ label: "repo", value: "sap-ui" }],
    notes: [],
  };
}
