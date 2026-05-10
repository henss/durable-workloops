#!/usr/bin/env node
/* global Buffer, console, process */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(await readFile(path.join(rootPath, "package.json"), "utf8"));
const packageName = assertString(packageJson.name, "package.json name");
const packageVersion = assertString(packageJson.version, "package.json version");
const npmAuth = await prepareNpmAuth();

if (options.version && options.version !== packageVersion) {
  throw new Error(`Requested version ${options.version} does not match package version ${packageVersion}.`);
}

console.log(`Release candidate: ${packageName}@${packageVersion}`);
console.log(`Dist tag: ${options.tag}`);
console.log(`Publish: ${options.publish ? "yes" : "no"}`);

await runPackageScript("build");
await runPackageScript("typecheck");
await runPackageScript("test");
await runPackageScript("lint", { optional: true });
await runPackageScript("atlas:check", { optional: true });

const tarballPath = await packPackage();
try {
  await assertPackageShape(tarballPath);
  await runCleanInstallSmoke(packageName, tarballPath);

  if (options.publish) {
    await run("npm", ["publish", "--access", "public", "--tag", options.tag], rootPath);
    await run("npm", ["view", `${packageName}@${packageVersion}`, "version", "dist-tags", "--json"], rootPath);
  } else {
    console.log("Dry run complete. Re-run with --publish to publish this package.");
  }
} finally {
  if (!options.keepTarball) {
    await rm(tarballPath, { force: true });
  }
  await npmAuth.cleanup();
}

function parseArgs(args) {
  const parsed = {
    tag: "preview",
    version: undefined,
    publish: false,
    keepTarball: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--tag") {
      parsed.tag = requireValue(args, (index += 1), arg);
    } else if (arg === "--version") {
      parsed.version = requireValue(args, (index += 1), arg);
    } else if (arg === "--publish") {
      parsed.publish = true;
    } else if (arg === "--keep-tarball") {
      parsed.keepTarball = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/release-package.mjs [options]

Options:
  --version <version>       Assert the package version before release.
  --tag <tag>               npm dist-tag. Defaults to preview.
  --publish                 Publish after all gates pass. Omit for a dry run.
  --keep-tarball            Keep the generated npm pack tarball.
`);
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }
  return value;
}

async function runPackageScript(script, { optional = false } = {}) {
  if (!packageJson.scripts?.[script]) {
    if (optional) return;
    throw new Error(`Missing required package script: ${script}`);
  }
  await run("pnpm", ["run", script], rootPath);
}

async function packPackage() {
  const output = await runCapture("npm", ["pack", "--json"], rootPath);
  const parsed = JSON.parse(extractJsonArray(output));
  const filename = parsed[0]?.filename;
  if (typeof filename !== "string") {
    throw new Error(`Could not parse npm pack output: ${output}`);
  }
  return path.join(rootPath, filename);
}

async function assertPackageShape(tarballPath) {
  const listing = await runCapture("tar", ["-tf", tarballPath], rootPath);
  const files = listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
  const forbidden = files.filter(
    (file) =>
      file.includes("/src/") ||
      file.includes("/.agent-atlas/") ||
      file.includes("/.runtime/") ||
      file.endsWith(".test.js") ||
      file.endsWith(".test.d.ts") ||
      file.endsWith("/tsconfig.json") ||
      file.endsWith("/tsconfig.build.json"),
  );
  if (forbidden.length > 0) {
    throw new Error(`Packed package contains forbidden files:\n${forbidden.join("\n")}`);
  }

  const required = ["package/package.json", "package/README.md", "package/LICENSE", "package/dist/index.js", "package/dist/index.d.ts"];
  const missing = required.filter((file) => !files.includes(file));
  if (missing.length > 0) {
    throw new Error(`Packed package is missing required files:\n${missing.join("\n")}`);
  }
}

async function runCleanInstallSmoke(packageName, tarballPath) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agent-workloops-package-smoke-"));
  try {
    await writeFile(path.join(tempRoot, "package.json"), '{"private":true,"type":"module"}\n');
    await run("npm", ["install", tarballPath], tempRoot);
    await writeFile(
      path.join(tempRoot, "smoke.mjs"),
      `import { WorkLoopSchema, selectNextWorkLoopSlice } from "${packageName}";
const parsed = WorkLoopSchema.parse({
  id: "smoke",
  projectId: "example",
  source: "test",
  status: "active",
  objective: "verify package import",
  successCriteria: ["imports work"],
  slices: [{ id: "slice", title: "Slice", status: "ready", taskPacketPath: "slice.md" }],
  completionPolicy: { defaultAction: "continue", stopOnlyFor: ["blocker"] },
  reviewPolicy: { required: true, repairOnReviewFailure: true },
  runawayGuard: { maxConsecutiveAgentRuns: 2, requireStefanAfter: "smoke guard" },
});
if (selectNextWorkLoopSlice(parsed)?.id !== "slice") throw new Error("slice selection failed");
`,
    );
    await run("node", ["smoke.mjs"], tempRoot);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function run(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: npmAuth.env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`))));
  });
}

async function runCapture(command, args, cwd) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: npmAuth.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code === 0) {
        resolve(out);
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}\n${err}`));
      }
    });
  });
}

function extractJsonArray(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find JSON array in output: ${output}`);
  }
  return output.slice(start, end + 1);
}

async function prepareNpmAuth() {
  const token = process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN;
  if (!token) {
    return {
      env: process.env,
      cleanup: async () => {},
    };
  }

  const authDir = await mkdtemp(path.join(os.tmpdir(), "agent-workloops-npm-auth-"));
  const userConfigPath = path.join(authDir, ".npmrc");
  await writeFile(userConfigPath, "registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n");

  return {
    env: {
      ...process.env,
      NODE_AUTH_TOKEN: token,
      npm_config_userconfig: userConfigPath,
    },
    cleanup: async () => {
      await rm(authDir, { recursive: true, force: true });
    },
  };
}
