import { describe, expect, it } from "vitest";
import {
  ClaimPlanRequestSchema,
  CompletePlanRequestSchema,
  CreateClientTokenRequestSchema,
  PlanRecordSchema,
  ProgressPlanRequestSchema,
  RequestReviewPlanRequestSchema,
  ReleasePlanRequestSchema,
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

const doneWorkLoop = {
  ...workLoop,
  status: "done",
  slices: [{ id: "slice-1", title: "Do the work", status: "done" }],
};

describe("Agent Workloops API schemas", () => {
  it("parses plan submission requests", () => {
    expect(SubmitPlanRequestSchema.parse({ workLoop })).toMatchObject({
      approvalRequired: false,
      workLoop: { id: "loop-1" },
    });
  });

  it("parses claim and completion requests", () => {
    expect(ClaimPlanRequestSchema.parse({ planId: "plan-1", projectId: "project-1" })).toEqual({
      planId: "plan-1",
      projectId: "project-1",
    });
    expect(
      CompletePlanRequestSchema.parse({
        leaseId: "lease-1",
        workLoop: doneWorkLoop,
        metadata: { ok: true },
      }),
    ).toMatchObject({ metadata: { ok: true } });
    expect(
      ProgressPlanRequestSchema.parse({
        leaseId: "lease-1",
        workLoop,
        decision: { action: "continue", reason: "keep going", workLoopId: "loop-1" },
      }),
    ).toMatchObject({ decision: { action: "continue" } });
    expect(
      ReleasePlanRequestSchema.parse({
        leaseId: "lease-1",
        workLoop,
        reason: "review_needed",
      }),
    ).toMatchObject({ reason: "review_needed" });
    expect(RequestReviewPlanRequestSchema.parse({ reason: "Needs another look" })).toEqual({
      reason: "Needs another look",
    });
  });

  it("normalizes legacy and explicit review policy shape", () => {
    expect(SubmitPlanRequestSchema.parse({ workLoop }).workLoop.reviewPolicy).toMatchObject({
      sliceReview: "required",
      finalReview: "required",
      repairOnReviewFailure: true,
      required: true,
    });
    expect(
      SubmitPlanRequestSchema.parse({
        workLoop: {
          ...workLoop,
          reviewPolicy: {
            sliceReview: "optional",
            finalReview: "disabled",
            providers: [{ id: "codex", label: "Codex" }],
            repairOnReviewFailure: false,
          },
        },
      }).workLoop.reviewPolicy,
    ).toMatchObject({
      sliceReview: "optional",
      finalReview: "disabled",
      providers: [{ id: "codex", label: "Codex" }],
      repairOnReviewFailure: false,
      required: false,
    });
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
