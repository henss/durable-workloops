#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
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

  if (!command || command === "help" || flags.help === "true") {
    printHelp(io.stdout);
    return;
  }

  if (!["submit", "claim", "poll", "complete", "run-codex"].includes(command)) {
    io.stderr.write(`Unknown command: ${command}\n`);
    printHelp(io.stderr);
    io.exit(2);
  }

  const env = await loadCliEnvironment(flags);
  const client = makeClient(flags, env);

  if (command === "submit") {
    const file = requireFlag(flags, "file", env);
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
    const planId = requireFlag(flags, "plan", env);
    const leaseId = requireFlag(flags, "lease", env);
    const metadata = flags.metadata
      ? (JSON.parse(await fs.readFile(flags.metadata, "utf8")) as JsonValue)
      : {};
    writeJson(io.stdout, await client.completePlan(planId, { leaseId, metadata }));
    return;
  }

  if (command === "run-codex") {
    const workspace = requireFlag(flags, "workspace", env);
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

function makeClient(
  flags: Record<string, string | undefined>,
  env: Record<string, string | undefined>,
): AgentWorkloopsApiClient {
  return new AgentWorkloopsApiClient({
    serverUrl: requireFlag(flags, "server", env),
    token: requireFlag(flags, "token", env),
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

function requireFlag(
  flags: Record<string, string | undefined>,
  name: string,
  env: Record<string, string | undefined>,
): string {
  const envName = name.toUpperCase().replaceAll("-", "_");
  const value = flags[name] ?? env[`AWL_${envName}`] ?? env[`DWL_${envName}`];
  if (!value) {
    throw new Error(`Missing required --${name}.`);
  }
  return value;
}

export async function loadCliEnvironment(
  flags: Record<string, string | undefined>,
  baseEnv: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): Promise<Record<string, string | undefined>> {
  const envFile = flags["env-file"] ?? ".env";
  const envFilePath = path.isAbsolute(envFile) ? envFile : path.join(cwd, envFile);
  return {
    ...(await readEnvFile(envFilePath)),
    ...baseEnv,
  };
}

async function readEnvFile(envFilePath: string): Promise<Record<string, string>> {
  const text = await fs.readFile(envFilePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  });
  return parseEnvText(text);
}

export function parseEnvText(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const assignment = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separator = assignment.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = assignment.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    values[key] = parseEnvValue(assignment.slice(separator + 1).trim());
  }
  return values;
}

function parseEnvValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll("\\n", "\n").replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/, "");
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

Credentials:
  --server and --token can also be provided by AWL_SERVER and AWL_TOKEN in the
  environment or in a local .env file. Flags override environment values, and
  environment values override .env values. Use --env-file <path> to choose a
  different file.
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
