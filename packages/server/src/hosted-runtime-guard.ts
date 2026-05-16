import { z } from "zod";

export interface HostedRuntimeGuardResult {
  ok: boolean;
  errors: string[];
}

const HostedMaxJobClassSchema = z.enum([
  "planning_only",
  "read_only_sanitized",
  "approval_required_write_action",
  "forbidden",
]);

export function validateHostedRuntimeSafety(env: Record<string, string | undefined>): HostedRuntimeGuardResult {
  if (env.AWL_HOSTED_MODE !== "true") {
    return { ok: true, errors: [] };
  }

  const errors: string[] = [];
  requireFlagValue(env, "AWL_ENABLE_LOCAL_COMMAND_EXECUTION", "false", errors);
  requireFlagValue(env, "AWL_ENABLE_WORKSPACE_PATH_EXECUTION", "false", errors);
  requireFlagValue(env, "AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD", "false", errors);
  requireFlagValue(env, "AWL_ALLOW_BROAD_PERSONAL_TOKENS", "false", errors);
  requireWorkItemStoreConfig(env, errors);

  const maxJobClass = env.AWL_MAX_JOB_CLASS;
  if (!maxJobClass) {
    errors.push("AWL_MAX_JOB_CLASS is required in hosted mode");
  } else if (!HostedMaxJobClassSchema.safeParse(maxJobClass).success) {
    errors.push("AWL_MAX_JOB_CLASS is not recognized");
  } else if (!["planning_only", "read_only_sanitized"].includes(maxJobClass)) {
    errors.push("AWL_MAX_JOB_CLASS exceeds hosted coordination limits without a policy layer");
  }

  return { ok: errors.length === 0, errors };
}

export function assertHostedRuntimeSafety(env: Record<string, string | undefined>): void {
  const result = validateHostedRuntimeSafety(env);
  if (!result.ok) {
    throw new Error(`Hosted runtime safety check failed: ${result.errors.join("; ")}`);
  }
}

function requireWorkItemStoreConfig(env: Record<string, string | undefined>, errors: string[]): void {
  const storeKind = env.AWL_WORK_ITEM_STORE;
  if (!storeKind) {
    errors.push("AWL_WORK_ITEM_STORE is required in hosted mode");
    return;
  }
  if (storeKind === "memory") {
    if (env.AWL_ALLOW_EPHEMERAL_WORK_ITEM_STORE !== "true") {
      errors.push("AWL_WORK_ITEM_STORE must not be memory in hosted mode without an explicit ephemeral-store override");
    }
    return;
  }
  if (storeKind === "file") {
    if (!env.AWL_WORK_ITEM_STORE_FILE) {
      errors.push("AWL_WORK_ITEM_STORE_FILE is required when AWL_WORK_ITEM_STORE is file");
    }
    return;
  }
  if (storeKind === "database") {
    if (!env.AWL_WORK_ITEM_STORE_DATABASE_URL) {
      errors.push("AWL_WORK_ITEM_STORE_DATABASE_URL is required when AWL_WORK_ITEM_STORE is database");
    }
    return;
  }
  errors.push("AWL_WORK_ITEM_STORE is not recognized");
}

function requireFlagValue(
  env: Record<string, string | undefined>,
  key: string,
  expected: string,
  errors: string[],
): void {
  if (env[key] !== expected) {
    errors.push(`${key} must be ${expected} in hosted mode`);
  }
}
