import type { WorkLoop, WorkLoopSlice } from "./schema.js";
import type { WorkLoopPeerReviewLike } from "./outcome.js";

export type WorkLoopAiQualityReviewProvider = "ollama" | "codex" | "claude";

export interface WorkLoopAiQualityReviewProviderOptions {
  provider: WorkLoopAiQualityReviewProvider;
  model?: string;
  cwd?: string;
  command?: string;
  extraArgs?: string[];
  ollamaUrl?: string;
  ollamaKeepAlive?: string | number;
}

export interface WorkLoopAiQualityReviewResult {
  status: "passed" | "failed" | "process_failed";
  summary: string;
  reviewArtifactPath?: string;
  requiredRepairs: string[];
}

export interface WorkLoopAiQualityReviewRunnerInput {
  subject: {
    kind: "workloop-slice";
    objective: string;
    successCriteria: string[];
    outcomePath?: string;
    promptPath?: string;
    changedPaths?: string[];
    content?: string;
  };
  provider: WorkLoopAiQualityReviewProviderOptions;
  outputPath?: string;
  structuredOutputPath?: string;
}

export type WorkLoopAiQualityReviewRunner = (
  input: WorkLoopAiQualityReviewRunnerInput,
) => Promise<WorkLoopAiQualityReviewResult>;

export interface RunWorkLoopAiQualityReviewInput {
  workLoop: WorkLoop;
  slice: WorkLoopSlice;
  provider: WorkLoopAiQualityReviewProviderOptions;
  runQualityReview: WorkLoopAiQualityReviewRunner;
  outcomePath?: string;
  promptPath?: string;
  changedPaths?: string[];
  outputPath?: string;
  structuredOutputPath?: string;
  content?: string;
}

export async function runWorkLoopAiQualityReview(
  input: RunWorkLoopAiQualityReviewInput,
): Promise<WorkLoopPeerReviewLike> {
  const result = await input.runQualityReview({
    subject: {
      kind: "workloop-slice",
      objective: input.workLoop.objective,
      successCriteria: input.workLoop.successCriteria,
      outcomePath: input.outcomePath ?? input.slice.lastOutcomePath,
      promptPath: input.promptPath ?? input.slice.taskPacketPath,
      changedPaths: input.changedPaths,
      content: input.content,
    },
    provider: input.provider,
    outputPath: input.outputPath,
    structuredOutputPath: input.structuredOutputPath,
  });

  return {
    status: result.status,
    reviewArtifactPath: result.reviewArtifactPath ?? input.outputPath,
  };
}
