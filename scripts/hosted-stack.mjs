#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
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
  const server = spawnManaged(pnpm, ["--filter", "@durable-workloops/server", "dev"]);
  const web = spawnManaged(pnpm, ["--filter", "@durable-workloops/web", "dev"]);

  console.log("Durable Workloops dev stack:");
  console.log("  API: http://127.0.0.1:3210");
  console.log("  UI:  http://127.0.0.1:5173");

  exitWhenAnyChildExits([server, web]);
}

async function runStart() {
  runChecked(pnpm, ["--filter", "@durable-workloops/server", "build"]);
  runChecked(pnpm, ["--filter", "@durable-workloops/web", "build"]);

  const webDistDir = path.join(root, "apps", "web", "dist");
  const serverEntry = path.join(root, "packages", "server", "dist", "index.js");
  console.log("Durable Workloops hosted stack:");
  console.log("  Server + UI: http://127.0.0.1:3210");
  spawnManaged(node, [serverEntry], {
    DWL_WEB_DIST_DIR: webDistDir,
  });
}

function runChecked(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function spawnManaged(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
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
    child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => stopChildren(130));
process.on("SIGTERM", () => stopChildren(143));
