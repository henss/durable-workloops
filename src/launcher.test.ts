import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkLoop } from "./schema.js";
import {
  prepareWorkLoopCodexLaunch,
  renderWorkLoopCodexPrompt,
} from "./launcher.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("WorkLoop Codex launcher", () => {
  it("renders a bounded slice prompt with an outcome contract", () => {
    const workLoop = makeWorkLoop();
    const slice = workLoop.slices[0]!;

    const prompt = renderWorkLoopCodexPrompt(
      {
        workLoop,
        slice,
        workspaceRoot: "/repo",
      },
      "/repo/.runtime/current/work-loops/demo/slice-1-outcome.json",
    );

    expect(prompt).toContain("Do not turn the whole WorkLoop into a chat-only checklist.");
    expect(prompt).toContain("- id: slice-1");
    expect(prompt).toContain("- last outcome: none");
    expect(prompt).toContain("Use `blockers` only for terminal blockers");
    expect(prompt).toContain('"workLoopId": "demo-work-loop"');
    expect(prompt).toContain("Required Outcome Artifact");
  });

  it("renders repair context when a slice is repair queued", () => {
    const workLoop = makeWorkLoop();
    const slice = {
      ...workLoop.slices[0]!,
      status: "repair_queued" as const,
      lastOutcomePath: "outcome.json",
      lastPeerReviewPath: "review.md",
    };

    const prompt = renderWorkLoopCodexPrompt(
      {
        workLoop,
        slice,
        workspaceRoot: "/repo",
      },
      "/repo/.runtime/current/work-loops/demo/slice-1-outcome.json",
    );

    expect(prompt).toContain("- last outcome: outcome.json");
    expect(prompt).toContain("- last peer review: review.md");
    expect(prompt).toContain("This is a repair run.");
  });

  it("writes launch files and a codex exec command", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workloops-launch-"));
    tempDirs.push(repo);
    const workLoop = makeWorkLoop();

    const launch = prepareWorkLoopCodexLaunch({
      workLoop,
      slice: workLoop.slices[0]!,
      workspaceRoot: repo,
      sandbox: "danger-full-access",
    });

    expect(fs.existsSync(launch.promptPath)).toBe(true);
    expect(fs.existsSync(launch.launchRecordPath)).toBe(true);
    expect(launch.command).toEqual([
      "codex",
      "exec",
      "--cd",
      repo,
      "--sandbox",
      "danger-full-access",
      "-",
    ]);
    expect(JSON.parse(fs.readFileSync(launch.launchRecordPath, "utf8"))).toMatchObject({
      workLoopId: "demo-work-loop",
      sliceId: "slice-1",
      stdinPath: launch.promptPath,
      continuationMode: "fresh_session",
      workingDirectory: repo,
    });
  });

  it("writes continuation launch files for an existing Codex session", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workloops-continuation-"));
    tempDirs.push(repo);
    const workLoop = makeWorkLoop();

    const launch = prepareWorkLoopCodexLaunch({
      workLoop,
      slice: workLoop.slices[1]!,
      workspaceRoot: repo,
      continuationMode: "same_session",
      codexSessionId: "session-123",
      previousSliceId: "slice-1",
      fullAuto: true,
    });

    expect(launch.command).toEqual([
      "codex",
      "exec",
      "resume",
      "session-123",
      "--full-auto",
      "-",
    ]);
    const prompt = fs.readFileSync(launch.promptPath, "utf8");
    expect(prompt).toContain("# WorkLoop Slice Continuation");
    expect(prompt).toContain("- previous slice: slice-1");
    expect(prompt).toContain("Carry forward useful context from the existing Codex session");
    expect(JSON.parse(fs.readFileSync(launch.launchRecordPath, "utf8"))).toMatchObject({
      continuationMode: "same_session",
      codexSessionId: "session-123",
      previousSliceId: "slice-1",
    });
  });

  it("requires a session id or --last for same-session continuation", () => {
    const workLoop = makeWorkLoop();

    expect(() =>
      prepareWorkLoopCodexLaunch({
        workLoop,
        slice: workLoop.slices[1]!,
        workspaceRoot: "/repo",
        continuationMode: "same_session",
      }),
    ).toThrow("same_session Codex launches require codexSessionId or resumeLastSession.");
  });

  it("does not pass fresh-session sandbox flags to codex resume", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workloops-resume-flags-"));
    tempDirs.push(repo);
    const workLoop = makeWorkLoop();

    const launch = prepareWorkLoopCodexLaunch({
      workLoop,
      slice: workLoop.slices[1]!,
      workspaceRoot: repo,
      continuationMode: "same_session",
      codexSessionId: "session-123",
      sandbox: "danger-full-access",
    });

    expect(launch.command).toEqual(["codex", "exec", "resume", "session-123", "-"]);
  });
});

function makeWorkLoop(): WorkLoop {
  return {
    id: "demo-work-loop",
    projectId: "demo",
    source: "test",
    status: "active",
    objective: "Prove launch envelopes are reusable.",
    successCriteria: ["a prompt exists", "an outcome contract exists"],
    slices: [
      {
        id: "slice-1",
        title: "Build launcher",
        status: "running",
        dependsOn: [],
        attemptCount: 1,
      },
      {
        id: "slice-2",
        title: "Use launcher",
        status: "ready",
        dependsOn: ["slice-1"],
        attemptCount: 0,
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
