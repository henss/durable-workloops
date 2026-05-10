import { describe, expect, it } from "vitest";
import { parseFlags, runClaimedCodexPlan } from "./index.js";

describe("durable-workloops CLI", () => {
  it("parses boolean and valued flags", () => {
    expect(parseFlags(["--server", "http://localhost:3210", "--approval-required"])).toEqual({
      server: "http://localhost:3210",
      "approval-required": "true",
    });
  });

  it("completes idle run-codex claims without launching", async () => {
    const completed = await runClaimedCodexPlan({
      client: {
        heartbeatPlan: async () => {
          throw new Error("not expected");
        },
        completePlan: async (_planId: string, input: unknown) => input,
      } as never,
      claimed: {},
      workspace: "/tmp/repo",
    });
    expect(completed).toEqual({ status: "idle" });
  });
});
