import { ActionIcon, Code, Group, Table, Text, Tooltip } from "@mantine/core";
import { Check, Eye, RotateCcw, X } from "lucide-react";
import type { PlanRecord } from "@agent-workloops/api";
import { EmptyState } from "../../components/EmptyState.js";
import { ApprovalBadge, StatusBadge } from "../../components/PlanBadges.js";

export function PlanTable(props: {
  plans: PlanRecord[];
  onDetail: (planId: string) => void;
  onApprove?: (planId: string) => void;
  onReject?: (planId: string) => void;
  onRequestReview?: (planId: string) => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyCheckedAt?: Date | null;
  onRefresh?: () => void;
}) {
  if (props.plans.length === 0) {
    return (
      <EmptyState
        title={props.emptyTitle}
        description={props.emptyDescription}
        checkedAt={props.emptyCheckedAt}
        actionLabel="Refresh queue"
        onAction={props.onRefresh}
      />
    );
  }

  return (
    <Table.ScrollContainer minWidth={980}>
      <Table className="aw-plan-table" highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Plan</Table.Th>
            <Table.Th w={130}>Project</Table.Th>
            <Table.Th w={130}>Approval</Table.Th>
            <Table.Th w={110}>Status</Table.Th>
            <Table.Th w={150}>Updated</Table.Th>
            <Table.Th w={150} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {props.plans.map((plan) => (
            <Table.Tr key={plan.id}>
              <Table.Td maw={760}>
                <Text fw={650} lineClamp={2}>{plan.workLoop.objective}</Text>
                <Text size="xs" c="dimmed" ff="monospace">{plan.id}</Text>
              </Table.Td>
              <Table.Td>
                <Code className="aw-nowrap">{plan.workLoop.projectId}</Code>
              </Table.Td>
              <Table.Td><ApprovalBadge plan={plan} /></Table.Td>
              <Table.Td><StatusBadge plan={plan} /></Table.Td>
              <Table.Td>
                <Text size="sm">{new Date(plan.updatedAt).toLocaleString()}</Text>
              </Table.Td>
              <Table.Td>
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  {props.onApprove ? (
                    <Tooltip label="Approve plan">
                      <ActionIcon variant="gradient" aria-label="Approve plan" onClick={() => props.onApprove?.(plan.id)}>
                        <Check size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : null}
                  {props.onReject ? (
                    <Tooltip label="Reject plan">
                      <ActionIcon variant="light" color="red" aria-label="Reject plan" onClick={() => props.onReject?.(plan.id)}>
                        <X size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : null}
                  {props.onRequestReview ? (
                    <Tooltip label="Request manual review">
                      <ActionIcon variant="light" color="yellow" aria-label="Request manual review" onClick={() => props.onRequestReview?.(plan.id)}>
                        <RotateCcw size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : null}
                  <Tooltip label="Open plan">
                    <ActionIcon variant="default" aria-label="Open plan" onClick={() => props.onDetail(plan.id)}>
                      <Eye size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
