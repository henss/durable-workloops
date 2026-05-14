import type { PlanApprovalStatus, PlanRecord, PlanStatus } from "@agent-workloops/api";
import type { DashboardTab } from "../../types.js";

export type PlanAction = "approve" | "reject" | "request-review" | "view";

export const productSummary =
  "Agent Workloops coordinates agent execution plans through approval, executors claiming work, locked running leases, and completion into the archive.";

export const productConcepts = [
  {
    label: "Plan",
    description: "One WorkLoop unit of agent work.",
  },
  {
    label: "Executor",
    description: "A client or worker that claims and runs a plan.",
  },
  {
    label: "Approval",
    description: "A human review gate before execution.",
  },
] as const;

export const dashboardTabCopy: Record<
  DashboardTab,
  {
    label: string;
    heading: string;
    description: string;
    sidebarHelp: string;
    ariaLabel: string;
  }
> = {
  pending: {
    label: "Pending",
    heading: "Pending Approval",
    description: "Plans waiting for human review before they can run.",
    sidebarHelp: "Needs review",
    ariaLabel: "Pending approval queue: plans waiting for human review",
  },
  claimable: {
    label: "Ready to Claim",
    heading: "Ready to Claim",
    description: "Approved or approval-free plans available for executors to claim.",
    sidebarHelp: "Available to executors",
    ariaLabel: "Ready to Claim queue: plans available for executors",
  },
  locked: {
    label: "Locked",
    heading: "Locked / Running Plans",
    description: "Plans claimed by an executor and protected from duplicate execution.",
    sidebarHelp: "Currently running",
    ariaLabel: "Locked plans queue: plans currently claimed by an executor",
  },
  archive: {
    label: "Archive",
    heading: "Completed Archive",
    description: "Completed plans that are no longer active.",
    sidebarHelp: "Completed history",
    ariaLabel: "Completed archive: plans no longer active after executor completion",
  },
  "new-plan": {
    label: "New Plan",
    heading: "Submit a WorkLoop Plan",
    description: "Create a plan from a public-safe WorkLoop JSON or YAML document.",
    sidebarHelp: "Author work",
    ariaLabel: "New plan authoring page",
  },
  users: {
    label: "Users",
    heading: "Users and Roles",
    description: "Local accounts that can author, review, or administer plans.",
    sidebarHelp: "Access control",
    ariaLabel: "Users administration page",
  },
  tokens: {
    label: "Tokens",
    heading: "Client Tokens",
    description: "Bearer tokens for CLI users, API clients, and executors.",
    sidebarHelp: "API credentials",
    ariaLabel: "Client token administration page",
  },
};

export const planLifecycleStages = [
  {
    key: "new-plan",
    label: "New Plan",
    description: "A user or API client submits a WorkLoop plan with objective, slices, policies, and project metadata.",
  },
  {
    key: "pending",
    label: "Pending Approval",
    description: "The plan is waiting for a human reviewer before any executor can run it.",
  },
  {
    key: "claimable",
    label: "Ready to Claim",
    description: "The plan is queued, approved or approval-free, and available for an executor to claim.",
  },
  {
    key: "locked",
    label: "Locked / Running",
    description: "An executor has claimed the plan and holds a lease so another executor cannot run it at the same time.",
  },
  {
    key: "archive",
    label: "Archived",
    description: "A completed plan leaves the active list and appears in the archive after its WorkLoop status is done.",
  },
] as const;

export type PlanLifecycleStageKey = (typeof planLifecycleStages)[number]["key"];

export function getLifecycleStepAriaLabel(stage: (typeof planLifecycleStages)[number], activeTab: DashboardTab): string {
  const currentPrefix = stage.key === activeTab ? "Current step. " : "";
  return `${currentPrefix}${stage.label}: ${stage.description}`;
}

export interface BadgePresentation {
  label: string;
  description: string;
  color: string;
}

export function getApprovalPresentation(status: PlanApprovalStatus): BadgePresentation {
  const presentations: Record<PlanApprovalStatus, BadgePresentation> = {
    not_required: {
      label: "Approval not required",
      description: "This plan can be claimed without a human approval step.",
      color: "gray",
    },
    pending: {
      label: "Needs approval",
      description: "A reviewer must approve this plan before an executor can claim it.",
      color: "orange",
    },
    approved: {
      label: "Approved",
      description: "A reviewer approved this plan for executor work.",
      color: "green",
    },
    rejected: {
      label: "Rejected",
      description: "A reviewer rejected this plan; it should not be claimed.",
      color: "red",
    },
  };
  return presentations[status];
}

export function getPlanStatusPresentation(
  plan: Pick<PlanRecord, "status" | "approvalStatus" | "lock">,
  now = new Date(),
): BadgePresentation {
  if (plan.status === "queued") {
    if (plan.approvalStatus === "pending") {
      return {
        label: "Waiting review",
        description: "The plan is queued but cannot run until a reviewer approves it.",
        color: "orange",
      };
    }
    if (plan.approvalStatus === "rejected") {
      return {
        label: "Rejected",
        description: "The plan is queued in storage but rejected for execution.",
        color: "red",
      };
    }
    return {
      label: "Ready to Claim",
      description: "The plan is queued and available for an executor to claim.",
      color: "aqua",
    };
  }

  if (plan.status === "locked") {
    if (plan.lock && new Date(plan.lock.expiresAt) <= now) {
      return {
        label: "Lease expired",
        description: "The plan is locked by a lease that has expired and can be reclaimed by an executor.",
        color: "yellow",
      };
    }
    return {
      label: "Locked / running",
      description: "An executor has claimed this plan and holds the current lease.",
      color: "blue",
    };
  }

  const presentations: Record<Exclude<PlanStatus, "queued" | "locked">, BadgePresentation> = {
    blocked: {
      label: "Blocked",
      description: "Execution released this plan in a blocked state and it needs review before more work.",
      color: "red",
    },
    completed: {
      label: "Completed",
      description: "The executor completed the plan after the WorkLoop reached done.",
      color: "teal",
    },
    canceled: {
      label: "Canceled",
      description: "Execution canceled this plan and it should not continue.",
      color: "red",
    },
  };
  return presentations[plan.status];
}

export function getPlanActionPresentation(action: PlanAction, planObjective: string): {
  label: string;
  tooltip: string;
  ariaLabel: string;
  confirmMessage?: string;
} {
  const presentations: Record<PlanAction, { label: string; tooltip: string; consequence?: string }> = {
    approve: {
      label: "Approve",
      tooltip: "Approve plan for executor work",
    },
    reject: {
      label: "Reject",
      tooltip: "Reject plan so executors cannot claim it",
      consequence: "Reject this plan? Executors will not be able to claim it unless a reviewer changes it later.",
    },
    "request-review": {
      label: "Request review",
      tooltip: "Move plan back to Pending Approval before execution",
    },
    view: {
      label: "View",
      tooltip: "View plan details",
    },
  };
  const presentation = presentations[action];
  return {
    label: presentation.label,
    tooltip: presentation.tooltip,
    ariaLabel: `${presentation.tooltip}: ${planObjective}`,
    confirmMessage: presentation.consequence,
  };
}
