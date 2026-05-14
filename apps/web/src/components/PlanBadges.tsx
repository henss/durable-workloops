import { Badge } from "@mantine/core";
import type { PlanRecord } from "@agent-workloops/api";
import { getApprovalPresentation, getPlanStatusPresentation } from "../features/dashboard/productCopy.js";

export function StatusBadge({ plan }: { plan: PlanRecord }) {
  const presentation = getPlanStatusPresentation(plan);
  return (
    <Badge
      color={presentation.color}
      variant="light"
      styles={badgeStyles}
      title={presentation.description}
      aria-label={`Execution status: ${presentation.label}. ${presentation.description}`}
      data-testid={`status-badge-${plan.status}`}
    >
      {presentation.label}
    </Badge>
  );
}

export function ApprovalBadge({ plan }: { plan: PlanRecord }) {
  const presentation = getApprovalPresentation(plan.approvalStatus);
  return (
    <Badge
      color={presentation.color}
      variant="light"
      styles={badgeStyles}
      title={presentation.description}
      aria-label={`Approval status: ${presentation.label}. ${presentation.description}`}
      data-testid={`approval-badge-${plan.approvalStatus.replaceAll("_", "-")}`}
    >
      {presentation.label}
    </Badge>
  );
}

const badgeStyles = {
  root: { minWidth: "max-content" },
  label: { overflow: "visible", textTransform: "none" },
};
