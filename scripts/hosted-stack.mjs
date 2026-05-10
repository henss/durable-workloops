#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const node = process.execPath;
const children = new Set();

if (mode !== "dev" && mode !== "start") {
  console.error("Usage: node scripts/hosted-stack.mjs <dev|start>");
  process.exit(2);
}

if (mode === "dev") {
  runDev();
} else {
  await runStart();
}

function runDev() {
  runChecked(pnpm, ["--filter", "@agent-workloops/api", "build"]);

  const server = spawnManaged(pnpm, ["--filter", "@agent-workloops/server", "dev"]);
  const web = spawnManaged(pnpm, ["--filter", "@agent-workloops/web", "dev"]);

  console.log("Agent Workloops dev stack:");
  console.log("  API: http://127.0.0.1:3210");
  console.log("  UI:  http://127.0.0.1:5173");

  exitWhenAnyChildExits([server, web]);
}

async function runStart() {
  runChecked(pnpm, ["--filter", "@agent-workloops/server", "build"]);
  runChecked(pnpm, ["--filter", "@agent-workloops/web", "build"]);

  const webDistDir = path.join(root, "apps", "web", "dist");
  const serverEntry = path.join(root, "packages", "server", "dist", "index.js");
  console.log("Agent Workloops hosted stack:");
  console.log("  Server + UI: http://127.0.0.1:3210");
  spawnManaged(node, [serverEntry], {
    AWL_WEB_DIST_DIR: webDistDir,
  });
}

function runChecked(command, args) {
  const spawnCommand = resolveSpawnCommand(command, args);
  const result = spawnSync(spawnCommand.command, spawnCommand.args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: spawnCommand.shell,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function spawnManaged(command, args, env = {}) {
  const spawnCommand = resolveSpawnCommand(command, args);
  const child = spawn(spawnCommand.command, spawnCommand.args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: spawnCommand.shell,
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  child.on("error", (error) => {
    console.error(`Failed to start ${command}: ${error.message}`);
    stopChildren(1);
  });
  return child;
}

function resolveSpawnCommand(command, args) {
  if (!isWindows) {
    return { command, args, shell: false };
  }
  return {
    command: quoteWindowsCommand([command, ...args]),
    args: [],
    shell: true,
  };
}

function quoteWindowsCommand(parts) {
  return parts.map(quoteWindowsArg).join(" ");
}

function quoteWindowsArg(value) {
  const arg = String(value);
  if (!/[\s&()<>^|"]/u.test(arg)) {
    return arg;
  }
  return `"${arg.replaceAll('"', '""')}"`;
}

function exitWhenAnyChildExits(trackedChildren) {
  for (const child of trackedChildren) {
    child.on("exit", (status, signal) => {
      stopChildren(signal ? 1 : (status ?? 0));
    });
  }
}

function stopChildren(code) {
  for (const child of children) {
    stopChild(child);
  }
  process.exit(code);
}

function stopChild(child) {
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }
  child.kill("SIGTERM");
}

process.on("SIGINT", () => stopChildren(130));
process.on("SIGTERM", () => stopChildren(143));
