import { Badge } from "@mantine/core";
import type { PlanRecord } from "@agent-workloops/api";

export function StatusBadge({ plan }: { plan: PlanRecord }) {
  const color =
    plan.status === "completed"
      ? "teal"
      : plan.status === "locked"
        ? "blue"
        : plan.status === "canceled"
          ? "red"
          : "gray";
  return (
    <Badge color={color} variant="light" styles={badgeStyles}>
      {plan.status}
    </Badge>
  );
}

export function ApprovalBadge({ plan }: { plan: PlanRecord }) {
  const color =
    plan.approvalStatus === "approved"
      ? "green"
      : plan.approvalStatus === "pending"
        ? "orange"
        : plan.approvalStatus === "rejected"
          ? "red"
          : "gray";
  return (
    <Badge color={color} variant="light" styles={badgeStyles}>
      {plan.approvalStatus.replace("_", " ")}
    </Badge>
  );
}

const badgeStyles = {
  root: { minWidth: "max-content" },
  label: { overflow: "visible" },
};
