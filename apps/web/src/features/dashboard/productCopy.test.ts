import { describe, expect, it } from "vitest";
import {
  dashboardTabCopy,
  getLifecycleStepAriaLabel,
  getApprovalPresentation,
  getPlanActionPresentation,
  getPlanStatusPresentation,
  planLifecycleStages,
  productSummary,
} from "./productCopy.js";

describe("productCopy", () => {
  it("describes the queue lifecycle in plain language", () => {
    expect(productSummary).toContain("approval");
    expect(productSummary).toContain("executors");
    expect(planLifecycleStages.map((stage) => stage.label)).toEqual([
      "New Plan",
      "Pending Approval",
      "Ready to Claim",
      "Locked / Running",
      "Archived",
    ]);
    expect(dashboardTabCopy.pending.description).toBe("Plans waiting for human review before they can run.");
    expect(dashboardTabCopy.claimable.label).toBe("Ready to Claim");
    expect(dashboardTabCopy.claimable.sidebarHelp).toBe("Available to executors");
  });

  it("announces the current lifecycle step", () => {
    const readyToClaim = planLifecycleStages.find((stage) => stage.key === "claimable");
    expect(readyToClaim).toBeDefined();
    expect(getLifecycleStepAriaLabel(readyToClaim!, "claimable")).toContain("Current step. Ready to Claim");
    expect(getLifecycleStepAriaLabel(readyToClaim!, "locked")).not.toContain("Current step.");
  });

  it("labels approval states with user-facing meaning", () => {
    expect(getApprovalPresentation("not_required").label).toBe("Approval not required");
    expect(getApprovalPresentation("pending").description).toContain("reviewer must approve");
    expect(getApprovalPresentation("rejected").label).toBe("Rejected");
  });

  it("labels execution statuses with queue behavior", () => {
    expect(getPlanStatusPresentation({ status: "queued", approvalStatus: "approved" }).label).toBe("Ready to Claim");
    expect(getPlanStatusPresentation({ status: "queued", approvalStatus: "pending" }).label).toBe("Waiting review");
    expect(getPlanStatusPresentation({ status: "blocked", approvalStatus: "pending" }).description).toContain("blocked");
    expect(
      getPlanStatusPresentation(
        {
          status: "locked",
          approvalStatus: "not_required",
          lock: {
            leaseId: "lease",
            clientTokenId: "token",
            lockedAt: "2026-05-14T10:00:00.000Z",
            expiresAt: "2026-05-14T10:10:00.000Z",
          },
        },
        new Date("2026-05-14T10:11:00.000Z"),
      ).label,
    ).toBe("Lease expired");
  });

  it("labels plan table actions by actual handler behavior", () => {
    expect(getPlanActionPresentation("view", "Inspect").ariaLabel).toBe("View plan details: Inspect");
    expect(getPlanActionPresentation("reject", "Unsafe work").tooltip).toContain("executors cannot claim");
    expect(getPlanActionPresentation("reject", "Unsafe work").confirmMessage).toContain("Reject this plan?");
    expect(getPlanActionPresentation("request-review", "Needs review").tooltip).toContain("Pending Approval");
  });
});
