import { describe, expect, it } from "vitest";
import { validateHostedRuntimeSafety } from "./hosted-runtime-guard.js";

describe("hosted runtime guard", () => {
  it("fails closed when hosted mode omits safety flags", () => {
    const result = validateHostedRuntimeSafety({ AWL_HOSTED_MODE: "true" });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("AWL_ENABLE_LOCAL_COMMAND_EXECUTION must be false in hosted mode");
    expect(result.errors).toContain("AWL_MAX_JOB_CLASS is required in hosted mode");
    expect(result.errors).toContain("AWL_WORK_ITEM_STORE is required in hosted mode");
  });

  it("rejects unsafe hosted execution settings", () => {
    const result = validateHostedRuntimeSafety({
      AWL_HOSTED_MODE: "true",
      AWL_ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      AWL_ENABLE_WORKSPACE_PATH_EXECUTION: "false",
      AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD: "false",
      AWL_ALLOW_BROAD_PERSONAL_TOKENS: "false",
      AWL_MAX_JOB_CLASS: "approval_required_write_action",
      AWL_WORK_ITEM_STORE: "memory",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("AWL_ENABLE_LOCAL_COMMAND_EXECUTION must be false in hosted mode");
    expect(result.errors).toContain("AWL_MAX_JOB_CLASS exceeds hosted coordination limits without a policy layer");
    expect(result.errors).toContain(
      "AWL_WORK_ITEM_STORE must not be memory in hosted mode without an explicit ephemeral-store override",
    );
  });

  it("accepts safe hosted coordination settings with an explicit single-node file store", () => {
    const result = validateHostedRuntimeSafety({
      AWL_HOSTED_MODE: "true",
      AWL_ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      AWL_ENABLE_WORKSPACE_PATH_EXECUTION: "false",
      AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD: "false",
      AWL_ALLOW_BROAD_PERSONAL_TOKENS: "false",
      AWL_MAX_JOB_CLASS: "planning_only",
      AWL_WORK_ITEM_STORE: "file",
      AWL_WORK_ITEM_STORE_FILE: "/tmp/agent-workloops-test/work-items.json",
      AWL_ALLOW_SINGLE_NODE_FILE_WORK_ITEM_STORE: "true",
    });

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("rejects unknown and incompletely configured store settings in hosted mode", () => {
    const base = {
      AWL_HOSTED_MODE: "true",
      AWL_ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      AWL_ENABLE_WORKSPACE_PATH_EXECUTION: "false",
      AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD: "false",
      AWL_ALLOW_BROAD_PERSONAL_TOKENS: "false",
      AWL_MAX_JOB_CLASS: "planning_only",
    };

    expect(validateHostedRuntimeSafety({ ...base, AWL_WORK_ITEM_STORE: "unknown" }).errors).toContain(
      "AWL_WORK_ITEM_STORE is not recognized",
    );
    expect(validateHostedRuntimeSafety({ ...base, AWL_WORK_ITEM_STORE: "file" }).errors).toContain(
      "AWL_WORK_ITEM_STORE_FILE is required when AWL_WORK_ITEM_STORE is file",
    );
    expect(validateHostedRuntimeSafety({ ...base, AWL_WORK_ITEM_STORE: "database" }).errors).toContain(
      "AWL_WORK_ITEM_STORE_DATABASE_URL is required when AWL_WORK_ITEM_STORE is database",
    );
  });

  it("rejects file store in hosted mode unless explicitly marked single-node", () => {
    const result = validateHostedRuntimeSafety({
      AWL_HOSTED_MODE: "true",
      AWL_ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      AWL_ENABLE_WORKSPACE_PATH_EXECUTION: "false",
      AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD: "false",
      AWL_ALLOW_BROAD_PERSONAL_TOKENS: "false",
      AWL_MAX_JOB_CLASS: "planning_only",
      AWL_WORK_ITEM_STORE: "file",
      AWL_WORK_ITEM_STORE_FILE: "/tmp/agent-workloops-test/work-items.json",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "AWL_WORK_ITEM_STORE file is single-node only and requires AWL_ALLOW_SINGLE_NODE_FILE_WORK_ITEM_STORE=true in hosted mode",
    );
  });

  it("rejects memory and file stores when cloud-grade storage is required", () => {
    const base = {
      AWL_HOSTED_MODE: "true",
      AWL_ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      AWL_ENABLE_WORKSPACE_PATH_EXECUTION: "false",
      AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD: "false",
      AWL_ALLOW_BROAD_PERSONAL_TOKENS: "false",
      AWL_MAX_JOB_CLASS: "planning_only",
      AWL_REQUIRE_CLOUD_GRADE_WORK_ITEM_STORE: "true",
    };

    const memoryResult = validateHostedRuntimeSafety({
      ...base,
      AWL_WORK_ITEM_STORE: "memory",
      AWL_ALLOW_EPHEMERAL_WORK_ITEM_STORE: "true",
    });
    expect(memoryResult.ok).toBe(false);
    expect(memoryResult.errors).toContain(
      "AWL_WORK_ITEM_STORE memory is not cloud-grade when AWL_REQUIRE_CLOUD_GRADE_WORK_ITEM_STORE=true",
    );

    const fileResult = validateHostedRuntimeSafety({
      ...base,
      AWL_WORK_ITEM_STORE: "file",
      AWL_WORK_ITEM_STORE_FILE: "/tmp/agent-workloops-test/work-items.json",
      AWL_ALLOW_SINGLE_NODE_FILE_WORK_ITEM_STORE: "true",
    });
    expect(fileResult.ok).toBe(false);
    expect(fileResult.errors).toContain(
      "AWL_WORK_ITEM_STORE file is not cloud-grade when AWL_REQUIRE_CLOUD_GRADE_WORK_ITEM_STORE=true",
    );
  });

  it("accepts database store selection when cloud-grade storage is required and config is present", () => {
    const result = validateHostedRuntimeSafety({
      AWL_HOSTED_MODE: "true",
      AWL_ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      AWL_ENABLE_WORKSPACE_PATH_EXECUTION: "false",
      AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD: "false",
      AWL_ALLOW_BROAD_PERSONAL_TOKENS: "false",
      AWL_MAX_JOB_CLASS: "planning_only",
      AWL_WORK_ITEM_STORE: "database",
      AWL_WORK_ITEM_STORE_DATABASE_URL: "redacted://example.invalid/awl",
      AWL_WORK_ITEM_STORE_DATABASE_KIND: "postgres",
      AWL_REQUIRE_CLOUD_GRADE_WORK_ITEM_STORE: "true",
    });

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("rejects unknown database kinds in hosted mode", () => {
    const result = validateHostedRuntimeSafety({
      AWL_HOSTED_MODE: "true",
      AWL_ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      AWL_ENABLE_WORKSPACE_PATH_EXECUTION: "false",
      AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD: "false",
      AWL_ALLOW_BROAD_PERSONAL_TOKENS: "false",
      AWL_MAX_JOB_CLASS: "planning_only",
      AWL_WORK_ITEM_STORE: "database",
      AWL_WORK_ITEM_STORE_DATABASE_URL: "redacted://example.invalid/awl",
      AWL_WORK_ITEM_STORE_DATABASE_KIND: "exotic-engine",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("AWL_WORK_ITEM_STORE_DATABASE_KIND is not recognized");
  });
});
