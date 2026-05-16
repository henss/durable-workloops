import type { CreateWorkItemInput } from "./coordination.js";

export const syntheticPlanningWorkItemInput: CreateWorkItemInput = {
  id: "wi_synthetic_planning_001",
  created_by: "human_operator:example",
  target_repo: "example-service",
  title: "Draft a public-safe coordination plan",
  objective: "Create a sanitized plan for a fake service without local execution.",
  priority: "normal",
  trust_zone: "B_cloud_private",
  job_class: "planning_only",
  authority_class: "planning_only",
  required_capabilities: ["planning_packet"],
  payload_ref: "artifact://example/input",
  redaction_policy: "public_safe_no_sensitive_payloads",
  idempotency_key: "synthetic-planning-work-item-v1",
};
