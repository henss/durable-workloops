import { MantineProvider } from "@mantine/core";
import type { PlanRecord } from "@agent-workloops/api";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { appTheme } from "../../theme.js";
import { PlanTable } from "./PlanTable.js";

const plan: PlanRecord = {
  id: "plan-test",
  workLoop: {
    id: "loop",
    projectId: "project",
    source: "test",
    status: "active",
    objective: "Review the action labels",
    successCriteria: ["Labels are clear"],
    slices: [{ id: "slice", title: "Slice", status: "ready", dependsOn: [], attemptCount: 0 }],
    completionPolicy: { defaultAction: "continue", stopOnlyFor: ["done"] },
    reviewPolicy: {
      required: true,
      sliceReview: "required",
      finalReview: "required",
      repairOnReviewFailure: true,
      providers: [],
    },
    runawayGuard: { maxConsecutiveAgentRuns: 5 },
  },
  approvalRequired: true,
  approvalStatus: "approved",
  status: "queued",
  reviewEvidence: [],
  createdAt: "2026-05-14T10:00:00.000Z",
  updatedAt: "2026-05-14T10:00:00.000Z",
};

describe("PlanTable", () => {
  it("renders accessible action labels", () => {
    const html = renderToStaticMarkup(
      <MantineProvider theme={appTheme}>
        <PlanTable
          queueLabel="Ready to Claim plans"
          dataTestId="queue-claimable-plans"
          plans={[plan]}
          onDetail={() => undefined}
          onReject={() => undefined}
          onRequestReview={() => undefined}
          emptyTitle="No plans"
          emptyDescription="Nothing to show"
        />
      </MantineProvider>,
    );

    expect(html).toContain("Ready to Claim plans");
    expect(html).toContain("More actions for plan: Review the action labels");
    expect(html).toContain("View plan details: Review the action labels");
    expect(html).toContain("Ready");
    expect(html).toContain(">View<");
  });

  it("can render the pending approval primary action as Review", () => {
    const html = renderToStaticMarkup(
      <MantineProvider theme={appTheme}>
        <PlanTable
          queueLabel="Pending approval plans"
          dataTestId="queue-pending-plans"
          plans={[{ ...plan, approvalStatus: "pending" }]}
          onDetail={() => undefined}
          detailAction="review"
          onApprove={() => undefined}
          onReject={() => undefined}
          emptyTitle="No plans"
          emptyDescription="Nothing to show"
        />
      </MantineProvider>,
    );

    expect(html).toContain("Open plan details for approval review: Review the action labels");
    expect(html).toContain(">Review<");
    expect(html).toContain("More actions for plan: Review the action labels");
  });
});
