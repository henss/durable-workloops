import { z } from "zod";
import { WorkLoopSchema, type WorkLoop } from "./schema.js";

export const WorkLoopPlanningEvidenceSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

export const WorkLoopPlanningResultSchema = z.object({
  workLoop: WorkLoopSchema,
  selectedProjectId: z.string().min(1).optional(),
  routingRationale: z.string().min(1).optional(),
  evidence: z.array(WorkLoopPlanningEvidenceSchema).default([]),
  notes: z.array(z.string().min(1)).default([]),
});

export interface WorkLoopPlanningProjectHint {
  id: string;
  label?: string;
  description?: string;
}

export interface WorkLoopPlanningPromptInput {
  requirements: string;
  projectHints?: WorkLoopPlanningProjectHint[];
  targetProjectId?: string;
  resultPath?: string;
}

export type WorkLoopPlanningResult = z.infer<typeof WorkLoopPlanningResultSchema>;

export function renderWorkLoopPlanningPrompt(input: WorkLoopPlanningPromptInput): string {
  const requirements = input.requirements.trim();
  if (!requirements) {
    throw new Error("WorkLoop planning requirements are required.");
  }
  const targetProject = input.targetProjectId?.trim() || "auto";
  const projectHints = renderProjectHints(input.projectHints ?? []);
  const resultTarget = input.resultPath
    ? `Write the final JSON object to: ${input.resultPath}`
    : "Return the final JSON object in your final response.";

  return `# WorkLoop Planning

Turn the requirements below into one valid durable WorkLoop plan.

## Requirements

${requirements}

## Target Project

${targetProject}

## Project Hints

${projectHints}

## Output Contract

${resultTarget}

The JSON object must match this shape:

{
  "workLoop": {
    "id": "stable-kebab-id",
    "projectId": "project-id",
    "source": "requirements-planner",
    "status": "active",
    "objective": "one clear objective",
    "successCriteria": ["observable completion criterion"],
    "slices": [
      {
        "id": "slice-1",
        "title": "bounded executable slice",
        "status": "ready",
        "dependsOn": [],
        "attemptCount": 0
      }
    ],
    "completionPolicy": {
      "defaultAction": "continue",
      "stopOnlyFor": ["blocked", "needs_stefan", "done"]
    },
    "reviewPolicy": {
      "required": true,
      "repairOnReviewFailure": true
    },
    "runawayGuard": {
      "maxConsecutiveAgentRuns": 3,
      "requireStefanAfter": "authority expansion, external effects, or repeated repair failure"
    }
  },
  "selectedProjectId": "project-id",
  "routingRationale": "why this project was selected",
  "evidence": [{ "label": "source", "value": "what was inspected" }],
  "notes": ["optional implementation note"]
}

Rules:
- Output valid JSON only, with no Markdown wrapper in the result file.
- Keep slices independently executable and dependency ordered.
- Do not include secrets, credentials, account data, or private customer data.
- Do not invent external effects; model approval or human-decision gates as stop conditions.
- Use project hints only as routing context. Do not copy private local paths into the WorkLoop.
`;
}

export function parseWorkLoopPlanningResult(text: string): WorkLoopPlanningResult {
  const parsed = JSON.parse(extractJsonObject(text)) as unknown;
  return WorkLoopPlanningResultSchema.parse(parsed);
}

export function coerceWorkLoopPlanningResult(value: unknown): WorkLoopPlanningResult {
  return WorkLoopPlanningResultSchema.parse(value);
}

export function validatePlannedWorkLoop(value: unknown): WorkLoop {
  return WorkLoopSchema.parse(value);
}

function renderProjectHints(hints: WorkLoopPlanningProjectHint[]): string {
  if (hints.length === 0) {
    return "- none provided";
  }
  return hints
    .map((hint) => {
      const label = hint.label ? ` (${hint.label})` : "";
      const description = hint.description ? `: ${hint.description}` : "";
      return `- ${hint.id}${label}${description}`;
    })
    .join("\n");
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*(?<body>[\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced?.groups?.body) {
    return fenced.groups.body.trim();
  }
  return trimmed;
}
