#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import {
  AgentWorkloopsApiClient,
  SubmitPlanRequestSchema,
  type ClaimPlanResponse,
  type JsonValue,
} from "@agent-workloops/api";
import { prepareWorkLoopCodexLaunch, runPreparedWorkLoopCodexLaunch } from "agent-workloops/launcher";
import { selectNextWorkLoopSlice } from "agent-workloops/selection";

export interface CliIo {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
  exit(code: number): never;
}

export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<void> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  const client = makeClient(flags);

  if (!command || command === "help" || flags.help === "true") {
    printHelp(io.stdout);
    return;
  }

  if (command === "submit") {
    const file = requireFlag(flags, "file");
    const raw = await fs.readFile(file, "utf8");
    const body = SubmitPlanRequestSchema.parse({
      workLoop: JSON.parse(raw),
      approvalRequired: flags["approval-required"] === "true",
    });
    const plan = await client.submitPlan(body);
    writeJson(io.stdout, plan);
    return;
  }

  if (command === "claim") {
    writeJson(io.stdout, await client.claimPlan(projectFilter(flags)));
    return;
  }

  if (command === "poll") {
    const intervalMs = parseDuration(flags.interval ?? "30s");
    while (true) {
      const claimed = await client.claimPlan(projectFilter(flags));
      if (claimed.plan) {
        writeJson(io.stdout, claimed);
        return;
      }
      await sleep(intervalMs);
    }
  }

  if (command === "complete") {
    const planId = requireFlag(flags, "plan");
    const leaseId = requireFlag(flags, "lease");
    const metadata = flags.metadata
      ? (JSON.parse(await fs.readFile(flags.metadata, "utf8")) as JsonValue)
      : {};
    writeJson(io.stdout, await client.completePlan(planId, { leaseId, metadata }));
    return;
  }

  if (command === "run-codex") {
    const workspace = requireFlag(flags, "workspace");
    const claimed = await client.claimPlan(projectFilter(flags));
    if (!claimed.plan || !claimed.leaseId) {
      writeJson(io.stdout, { status: "idle" });
      return;
    }
    const result = await runClaimedCodexPlan({
      client,
      claimed,
      workspace,
      model: flags.model,
      codexCommand: flags["codex-command"],
    });
    writeJson(io.stdout, result);
    return;
  }

  io.stderr.write(`Unknown command: ${command}\n`);
  printHelp(io.stderr);
  io.exit(2);
}

export async function runClaimedCodexPlan(input: {
  client: AgentWorkloopsApiClient;
  claimed: ClaimPlanResponse;
  workspace: string;
  model?: string;
  codexCommand?: string;
}): Promise<unknown> {
  const { plan, leaseId } = input.claimed;
  if (!plan || !leaseId) {
    return { status: "idle" };
  }
  const slice = selectNextWorkLoopSlice(plan.workLoop) ?? plan.workLoop.slices[0];
  if (!slice) {
    return input.client.completePlan(plan.id, {
      leaseId,
      metadata: { status: "completed", reason: "Plan has no executable slices." },
    });
  }
  const heartbeat = setInterval(() => {
    void input.client.heartbeatPlan(plan.id, leaseId).catch(() => undefined);
  }, 30_000);
  try {
    const launch = prepareWorkLoopCodexLaunch({
      workLoop: plan.workLoop,
      slice,
      workspaceRoot: input.workspace,
      model: input.model,
      codexCommand: input.codexCommand,
    });
    const result = runPreparedWorkLoopCodexLaunch(launch);
    return input.client.completePlan(plan.id, {
      leaseId,
      metadata: {
        executor: "codex",
        status: result.status,
        exitCode: result.exitCode,
        signal: result.signal,
        outcomePath: launch.outcomePath,
        promptPath: launch.promptPath,
        launchRecordPath: launch.launchRecordPath,
      },
    });
  } finally {
    clearInterval(heartbeat);
  }
}

function makeClient(flags: Record<string, string | undefined>): AgentWorkloopsApiClient {
  return new AgentWorkloopsApiClient({
    serverUrl: requireFlag(flags, "server"),
    token: requireFlag(flags, "token"),
  });
}

function projectFilter(flags: Record<string, string | undefined>): { projectId?: string } {
  return flags.project ? { projectId: flags.project } : {};
}

export function parseFlags(args: string[]): Record<string, string | undefined> {
  const flags: Record<string, string | undefined> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = "true";
    } else {
      flags[key] = next;
      index += 1;
    }
  }
  return flags;
}

function requireFlag(flags: Record<string, string | undefined>, name: string): string {
  const envName = name.toUpperCase().replaceAll("-", "_");
  const value = flags[name] ?? process.env[`AWL_${envName}`] ?? process.env[`DWL_${envName}`];
  if (!value) {
    throw new Error(`Missing required --${name}.`);
  }
  return value;
}

function parseDuration(value: string): number {
  const match = /^(?<amount>\d+)(?<unit>ms|s|m)?$/.exec(value);
  if (!match?.groups) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const amount = Number(match.groups.amount);
  const unit = match.groups.unit ?? "ms";
  return unit === "m" ? amount * 60_000 : unit === "s" ? amount * 1000 : amount;
}

function writeJson(stdout: Pick<NodeJS.WriteStream, "write">, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp(stdout: Pick<NodeJS.WriteStream, "write">): void {
  stdout.write(`agent-workloops <command> [options]

Commands:
  submit --server <url> --token <token> --file <workloop.json> [--approval-required]
  claim --server <url> --token <token> [--project <id>]
  poll --server <url> --token <token> [--interval 30s] [--project <id>]
  run-codex --server <url> --token <token> --workspace <path> [--model <model>]
  complete --server <url> --token <token> --plan <id> --lease <id> [--metadata <json-file>]
`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const defaultIo: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
  exit(code): never {
    process.exit(code);
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2)).catch((error: Error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
