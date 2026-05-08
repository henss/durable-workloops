import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { WorkLoop, WorkLoopCurrentState, WorkLoopSlice } from "./schema.js";

export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type WorkLoopCodexContinuationMode = "fresh_session" | "same_session";

export interface WorkLoopCodexLaunchOptions {
  workLoop: WorkLoop;
  slice: WorkLoopSlice;
  workspaceRoot: string;
  launchRoot?: string;
  continuationMode?: WorkLoopCodexContinuationMode;
  codexSessionId?: string;
  resumeLastSession?: boolean;
  previousSliceId?: string;
  codexCommand?: string;
  model?: string;
  sandbox?: CodexSandboxMode;
  fullAuto?: boolean;
  bypassApprovalsAndSandbox?: boolean;
  extraInstructions?: string[];
}

export interface PreparedWorkLoopCodexLaunch {
  workLoopId: string;
  sliceId: string;
  promptPath: string;
  outcomePath: string;
  launchRecordPath: string;
  command: string[];
  stdinPath: string;
  workingDirectory: string;
  continuationMode: WorkLoopCodexContinuationMode;
  codexSessionId?: string;
  previousSliceId?: string;
}

export interface RunWorkLoopCodexLaunchResult {
  status: "completed" | "failed";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

const DEFAULT_CODEX_COMMAND = "codex";

export function prepareWorkLoopCodexLaunch(
  options: WorkLoopCodexLaunchOptions,
): PreparedWorkLoopCodexLaunch {
  const launchRoot =
    options.launchRoot ??
    path.join(options.workspaceRoot, ".runtime", "current", "work-loops", options.workLoop.id);
  const promptPath = path.join(launchRoot, `${options.slice.id}-codex-prompt.md`);
  const outcomePath = path.join(launchRoot, `${options.slice.id}-outcome.json`);
  const command = buildCodexCommand(options);
  const launchRecordPath = path.join(launchRoot, `${options.slice.id}-launch.json`);
  const launch: PreparedWorkLoopCodexLaunch = {
    workLoopId: options.workLoop.id,
    sliceId: options.slice.id,
    promptPath,
    outcomePath,
    launchRecordPath,
    command,
    stdinPath: promptPath,
    workingDirectory: options.workspaceRoot,
    continuationMode: options.continuationMode ?? "fresh_session",
    codexSessionId: options.codexSessionId,
    previousSliceId: options.previousSliceId,
  };

  fs.mkdirSync(launchRoot, { recursive: true });
  fs.writeFileSync(promptPath, renderWorkLoopCodexPrompt(options, outcomePath), "utf8");
  fs.writeFileSync(launchRecordPath, `${JSON.stringify(launch, null, 2)}\n`, "utf8");

  return launch;
}

export function prepareCurrentStateCodexLaunch(
  state: WorkLoopCurrentState,
  slice: WorkLoopSlice,
  options: Omit<WorkLoopCodexLaunchOptions, "workLoop" | "slice">,
): PreparedWorkLoopCodexLaunch {
  return prepareWorkLoopCodexLaunch({
    ...options,
    workLoop: state.workLoop,
    slice,
  });
}

export function runPreparedWorkLoopCodexLaunch(
  launch: PreparedWorkLoopCodexLaunch,
): RunWorkLoopCodexLaunchResult {
  const [command, ...args] = launch.command;
  if (!command) {
    throw new Error("Codex launch command is empty.");
  }
  const result = spawnSync(command, args, {
    input: fs.readFileSync(launch.stdinPath, "utf8"),
    encoding: "utf8",
    shell: process.platform === "win32",
    cwd: launch.workingDirectory,
  });
  return {
    status: result.status === 0 ? "completed" : "failed",
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function renderWorkLoopCodexPrompt(
  options: WorkLoopCodexLaunchOptions,
  outcomePath: string,
): string {
  const { workLoop, slice } = options;
  const dependencies = slice.dependsOn.length > 0 ? slice.dependsOn.join(", ") : "none";
  const successCriteria = workLoop.successCriteria.map((criterion) => `- ${criterion}`).join("\n");
  const otherSlices = workLoop.slices
    .filter((candidate) => candidate.id !== slice.id)
    .map((candidate) => `- ${candidate.id}: ${candidate.title} (${candidate.status})`)
    .join("\n");
  const extras =
    options.extraInstructions && options.extraInstructions.length > 0
      ? `\n## Host Instructions\n\n${options.extraInstructions.map((line) => `- ${line}`).join("\n")}\n`
      : "";

  const heading =
    options.continuationMode === "same_session"
      ? "WorkLoop Slice Continuation"
      : "WorkLoop Slice Execution";
  const contextRule =
    options.continuationMode === "same_session"
      ? "- Carry forward useful context from the existing Codex session, but treat this prompt and the current state as authoritative when they conflict with prior assumptions."
      : "- Start from the current repo state and the durable WorkLoop state, not from unstated chat history.";

  return `# ${heading}

You are executing one durable WorkLoop slice. Do not turn the whole WorkLoop into a chat-only checklist.

## WorkLoop

- id: ${workLoop.id}
- project: ${workLoop.projectId}
- objective: ${workLoop.objective}
- status: ${workLoop.status}
- continuation mode: ${options.continuationMode ?? "fresh_session"}
- previous slice: ${options.previousSliceId ?? "none"}

## Current Slice

- id: ${slice.id}
- title: ${slice.title}
- status at launch: ${slice.status}
- attempt: ${slice.attemptCount}
- dependencies: ${dependencies}
- task packet: ${slice.taskPacketPath ?? "not provided"}
- last outcome: ${slice.lastOutcomePath ?? "none"}
- last peer review: ${slice.lastPeerReviewPath ?? "none"}

## Success Criteria

${successCriteria}

## Other Slices

${otherSlices || "- none"}
${extras}
## Execution Rules

- Work only on the current slice unless a dependency or verification step requires a narrow supporting edit.
- Do not mark the WorkLoop complete just because this session reaches a stopping point.
- If the slice cannot be completed, classify the blocker clearly and keep the outcome bounded to this slice.
- Run the narrowest meaningful verification available for the files or artifacts you touched.
- Preserve unrelated local work.
${contextRule}
${renderRepairRule(slice.status)}

## Required Outcome Artifact

Write a JSON outcome artifact to:

\`${outcomePath}\`

Use this shape:

\`\`\`json
{
  "workLoopId": "${workLoop.id}",
  "sliceId": "${slice.id}",
  "disposition": "completed | stopped",
  "summary": "short factual result",
  "canonicalArtifactPath": "path/to/main/evidence-or-change",
  "verification": ["commands or checks run"],
  "blockers": [],
  "needsStefan": [],
  "followUp": [],
  "continuationDecision": {
    "action": "done | continue | blocked | needs_stefan",
    "nextStepOwner": "agent | stefan | external",
    "summary": "why this is the right next state",
    "stopConditionClass": null
  }
}
\`\`\`
`;
}

function renderRepairRule(status: WorkLoopSlice["status"]): string {
  if (status !== "repair_queued") {
    return "";
  }
  return "- This is a repair run. Read the last outcome and last peer review paths above first, then repair only the review-required gaps before writing the new outcome artifact.";
}

function buildCodexCommand(options: WorkLoopCodexLaunchOptions): string[] {
  const command = [options.codexCommand ?? DEFAULT_CODEX_COMMAND, "exec"];
  const continuationMode = options.continuationMode ?? "fresh_session";
  if (continuationMode === "same_session") {
    command.push("resume");
    if (options.codexSessionId) {
      command.push(options.codexSessionId);
    } else if (options.resumeLastSession) {
      command.push("--last");
    } else {
      throw new Error("same_session Codex launches require codexSessionId or resumeLastSession.");
    }
  } else {
    command.push("--cd", options.workspaceRoot);
  }
  if (options.model) {
    command.push("--model", options.model);
  }
  if (options.bypassApprovalsAndSandbox) {
    command.push("--dangerously-bypass-approvals-and-sandbox");
  } else if (options.fullAuto) {
    command.push("--full-auto");
  } else if (continuationMode === "fresh_session" && options.sandbox) {
    command.push("--sandbox", options.sandbox);
  }
  command.push("-");
  return command;
}
