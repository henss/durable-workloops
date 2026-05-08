import { describe, expect, it } from "vitest";
import type { WorkLoop } from "./schema.js";
import {
  runWorkLoopAiQualityReview,
  type WorkLoopAiQualityReviewRunner,
} from "./ai-quality-loops.js";

describe("ai-quality-loops WorkLoop adapter", () => {
  it("maps a WorkLoop slice into an AIQL review request", async () => {
    const calls: Parameters<WorkLoopAiQualityReviewRunner>[0][] = [];
    const runQualityReview: WorkLoopAiQualityReviewRunner = async (input) => {
      calls.push(input);
      return {
        status: "failed",
        summary: "Needs repair.",
        reviewArtifactPath: "reviews/slice-1.md",
        requiredRepairs: ["Add verification evidence."],
      };
    };

    const review = await runWorkLoopAiQualityReview({
      workLoop: makeWorkLoop(),
      slice: makeWorkLoop().slices[0]!,
      provider: { provider: "codex", model: "gpt-5.2", cwd: "/repo" },
      outcomePath: "outcomes/slice-1.json",
      promptPath: "prompts/slice-1.md",
      changedPaths: ["src/app.ts"],
      outputPath: "reviews/slice-1.md",
      runQualityReview,
    });

    expect(review).toEqual({
      status: "failed",
      reviewArtifactPath: "reviews/slice-1.md",
    });
    expect(calls[0]).toMatchObject({
      subject: {
        kind: "workloop-slice",
        objective: "Ship a durable review adapter.",
        successCriteria: ["review can run", "review maps to WorkLoop status"],
        outcomePath: "outcomes/slice-1.json",
        promptPath: "prompts/slice-1.md",
        changedPaths: ["src/app.ts"],
      },
      provider: { provider: "codex", model: "gpt-5.2", cwd: "/repo" },
      outputPath: "reviews/slice-1.md",
    });
  });
});

function makeWorkLoop(): WorkLoop {
  return {
    id: "review-loop",
    projectId: "demo",
    source: "test",
    status: "active",
    objective: "Ship a durable review adapter.",
    successCriteria: ["review can run", "review maps to WorkLoop status"],
    slices: [
      {
        id: "slice-1",
        title: "Review adapter",
        status: "running",
        dependsOn: [],
        attemptCount: 1,
      },
    ],
    completionPolicy: {
      defaultAction: "continue",
      stopOnlyFor: ["blocker"],
    },
    reviewPolicy: {
      required: true,
      repairOnReviewFailure: true,
    },
    runawayGuard: {
      maxConsecutiveAgentRuns: 5,
    },
  };
}
