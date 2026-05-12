import { SubmitPlanRequestSchema, WorkLoopSchema, type SubmitPlanRequest } from "@agent-workloops/api";
import YAML from "yaml";

export function parseManualPlanSubmission(text: string, approvalRequired: boolean): SubmitPlanRequest {
  const parsed = parseJsonOrYaml(text);
  if (isRecord(parsed) && "workLoop" in parsed) {
    return SubmitPlanRequestSchema.parse({ ...parsed, approvalRequired });
  }
  return SubmitPlanRequestSchema.parse({
    workLoop: WorkLoopSchema.parse(parsed),
    approvalRequired,
  });
}

function parseJsonOrYaml(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Paste a WorkLoop plan before submitting.");
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return YAML.parse(trimmed) as unknown;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
