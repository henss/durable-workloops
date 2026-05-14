import { ActionIcon, Button, Code, Group, Table, Text, Tooltip } from "@mantine/core";
import { Check, Eye, RotateCcw, X } from "lucide-react";
import type { PlanRecord } from "@agent-workloops/api";
import { EmptyState } from "../../components/EmptyState.js";
import { ApprovalBadge, StatusBadge } from "../../components/PlanBadges.js";
import { getPlanActionPresentation, type PlanAction } from "../dashboard/productCopy.js";

export function PlanTable(props: {
  queueLabel: string;
  dataTestId: string;
  plans: PlanRecord[];
  onDetail: (planId: string) => void;
  onApprove?: (planId: string) => void;
  onReject?: (planId: string) => void;
  onRequestReview?: (planId: string) => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyCheckedAt?: Date | null;
  emptyLinks?: Array<{ label: string; onClick: () => void }>;
  onRefresh?: () => void;
}) {
  if (props.plans.length === 0) {
    return (
      <EmptyState
        dataTestId={`${props.dataTestId}-empty`}
        title={props.emptyTitle}
        description={props.emptyDescription}
        checkedAt={props.emptyCheckedAt}
        actionLabel="Refresh queue"
        onAction={props.onRefresh}
        links={props.emptyLinks}
      />
    );
  }

  return (
    <Table.ScrollContainer minWidth={920}>
      <Table
        className="aw-plan-table"
        highlightOnHover
        verticalSpacing="xs"
        aria-label={props.queueLabel}
        data-testid={props.dataTestId}
      >
        <Table.Caption className="aw-sr-only">
          {props.queueLabel}. A plan is the unit of work an agent executor will run.
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col"><ColumnHeader label="Plan" help="Agent work unit" /></Table.Th>
            <Table.Th scope="col" w={120}><ColumnHeader label="Project" help="Routing metadata" /></Table.Th>
            <Table.Th scope="col" w={150}><ColumnHeader label="Approval" help="Human review gate" /></Table.Th>
            <Table.Th scope="col" w={156}><ColumnHeader label="Execution status" help="Queue or lease state" /></Table.Th>
            <Table.Th scope="col" w={148}><ColumnHeader label="Last update" help="Record changed" /></Table.Th>
            <Table.Th scope="col" className="aw-actions-header" w={164}><ColumnHeader label="Actions" help="Review or inspect" align="right" /></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {props.plans.map((plan) => (
            <Table.Tr key={plan.id} data-testid={`plan-row-${plan.id}`}>
              <Table.Td>
                <Text fw={600} lineClamp={2}>{plan.workLoop.objective}</Text>
                <Text size="xs" c="dimmed" ff="monospace">{plan.id}</Text>
              </Table.Td>
              <Table.Td>
                <Code className="aw-nowrap">{plan.workLoop.projectId}</Code>
              </Table.Td>
              <Table.Td><ApprovalBadge plan={plan} /></Table.Td>
              <Table.Td><StatusBadge plan={plan} /></Table.Td>
              <Table.Td>
                <Text size="sm">{formatPlanTimestamp(plan.updatedAt)}</Text>
              </Table.Td>
              <Table.Td className="aw-actions-cell">
                <Group className="aw-actions-group" gap="xs" justify="flex-end" wrap="nowrap">
                  {props.onApprove ? (
                    <Tooltip label={getPlanActionPresentation("approve", plan.workLoop.objective).tooltip}>
                      <ActionIcon
                        variant="gradient"
                        aria-label={getPlanActionPresentation("approve", plan.workLoop.objective).ariaLabel}
                        title={getPlanActionPresentation("approve", plan.workLoop.objective).tooltip}
                        data-testid={`plan-action-approve-${plan.id}`}
                        onClick={() => props.onApprove?.(plan.id)}
                      >
                        <Check size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : null}
                  {props.onReject ? (
                    <Tooltip label={getPlanActionPresentation("reject", plan.workLoop.objective).tooltip}>
                      <ActionIcon
                        variant="light"
                        color="red"
                        aria-label={getPlanActionPresentation("reject", plan.workLoop.objective).ariaLabel}
                        title={getPlanActionPresentation("reject", plan.workLoop.objective).tooltip}
                        data-testid={`plan-action-reject-${plan.id}`}
                        onClick={() => {
                          if (confirmPlanAction("reject", plan)) {
                            props.onReject?.(plan.id);
                          }
                        }}
                      >
                        <X size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : null}
                  {props.onRequestReview ? (
                    <Tooltip label={getPlanActionPresentation("request-review", plan.workLoop.objective).tooltip}>
                      <ActionIcon
                        variant="light"
                        color="yellow"
                        aria-label={getPlanActionPresentation("request-review", plan.workLoop.objective).ariaLabel}
                        title={getPlanActionPresentation("request-review", plan.workLoop.objective).tooltip}
                        data-testid={`plan-action-request-review-${plan.id}`}
                        onClick={() => props.onRequestReview?.(plan.id)}
                      >
                        <RotateCcw size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : null}
                  <Tooltip label={getPlanActionPresentation("view", plan.workLoop.objective).tooltip}>
                    <Button
                      variant="default"
                      size="xs"
                      leftSection={<Eye size={14} />}
                      aria-label={getPlanActionPresentation("view", plan.workLoop.objective).ariaLabel}
                      title={getPlanActionPresentation("view", plan.workLoop.objective).tooltip}
                      data-testid={`plan-action-view-${plan.id}`}
                      onClick={() => props.onDetail(plan.id)}
                    >
                      {getPlanActionPresentation("view", plan.workLoop.objective).label}
                    </Button>
                  </Tooltip>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr>
            <Table.Td colSpan={6}>
              <Text size="xs" c="dimmed">{props.plans.length === 1 ? "1 plan" : `${props.plans.length} plans`}</Text>
            </Table.Td>
          </Table.Tr>
        </Table.Tfoot>
      </Table>
    </Table.ScrollContainer>
  );
}

function confirmPlanAction(action: PlanAction, plan: PlanRecord): boolean {
  const message = getPlanActionPresentation(action, plan.workLoop.objective).confirmMessage;
  if (!message || typeof globalThis.confirm !== "function") {
    return true;
  }
  return globalThis.confirm(`${message}\n\n${plan.workLoop.objective}`);
}

function ColumnHeader(props: { label: string; help: string; align?: "left" | "right" }) {
  return (
    <span className="aw-column-header" data-align={props.align ?? "left"}>
      <Text component="span" size="sm" fw={750}>{props.label}</Text>
      <Text component="span" size="xs" c="dimmed" fw={400}>{props.help}</Text>
    </span>
  );
}

function formatPlanTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
