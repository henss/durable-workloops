import { describe, expect, it } from "vitest";
import {
  ClaimPlanRequestSchema,
  CompletePlanRequestSchema,
  CreateClientTokenRequestSchema,
  PlanRecordSchema,
  SubmitPlanRequestSchema,
} from "./index.js";

const workLoop = {
  id: "loop-1",
  projectId: "project-1",
  source: "test",
  objective: "Ship a durable plan",
  successCriteria: ["Plan is accepted"],
  slices: [{ id: "slice-1", title: "Do the work" }],
  completionPolicy: { defaultAction: "continue", stopOnlyFor: ["done"] },
};

describe("Agent Workloops API schemas", () => {
  it("parses plan submission requests", () => {
    expect(SubmitPlanRequestSchema.parse({ workLoop })).toMatchObject({
      approvalRequired: false,
      workLoop: { id: "loop-1" },
    });
  });

  it("parses claim and completion requests", () => {
    expect(ClaimPlanRequestSchema.parse({ projectId: "project-1" })).toEqual({
      projectId: "project-1",
    });
    expect(
      CompletePlanRequestSchema.parse({ leaseId: "lease-1", metadata: { ok: true } }),
    ).toMatchObject({ metadata: { ok: true } });
  });

  it("parses client token requests", () => {
    expect(
      CreateClientTokenRequestSchema.parse({
        name: "executor",
        scopes: ["plans:submit", "plans:claim", "plans:complete"],
      }),
    ).toMatchObject({ name: "executor" });
  });

  it("parses plan records with approval and lock state", () => {
    const now = new Date().toISOString();
    expect(
      PlanRecordSchema.parse({
        id: "plan-1",
        workLoop,
        approvalRequired: true,
        approvalStatus: "pending",
        status: "queued",
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ id: "plan-1", approvalStatus: "pending" });
  });
});
