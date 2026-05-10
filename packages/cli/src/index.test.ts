import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCliEnvironment, parseEnvText, parseFlags, runClaimedCodexPlan } from "./index.js";

describe("agent-workloops CLI", () => {
  it("parses boolean and valued flags", () => {
    expect(parseFlags(["--server", "http://localhost:3210", "--approval-required"])).toEqual({
      server: "http://localhost:3210",
      "approval-required": "true",
    });
  });

  it("parses dotenv-style CLI environment files", () => {
    expect(
      parseEnvText(`
        # local CLI defaults
        AWL_SERVER=http://127.0.0.1:3210
        export AWL_TOKEN="awl_client_test"
        EXTRA='kept as-is'
      `),
    ).toEqual({
      AWL_SERVER: "http://127.0.0.1:3210",
      AWL_TOKEN: "awl_client_test",
      EXTRA: "kept as-is",
    });
  });

  it("lets process env override .env values", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "agent-workloops-cli-env-"));
    await fs.writeFile(path.join(cwd, ".env"), "AWL_SERVER=http://from-file\nAWL_TOKEN=from-file\n");

    const env = await loadCliEnvironment({}, { AWL_TOKEN: "from-process" }, cwd);

    expect(env.AWL_SERVER).toBe("http://from-file");
    expect(env.AWL_TOKEN).toBe("from-process");
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
