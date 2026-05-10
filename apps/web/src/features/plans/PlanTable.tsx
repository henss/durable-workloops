import { Button, Code, Group, Table, Text } from "@mantine/core";
import { Check, X } from "lucide-react";
import type { PlanRecord } from "@agent-workloops/api";
import { EmptyState } from "../../components/EmptyState.js";
import { ApprovalBadge, StatusBadge } from "../../components/PlanBadges.js";

export function PlanTable(props: {
  plans: PlanRecord[];
  onDetail: (planId: string) => void;
  onApprove?: (planId: string) => void;
  onReject?: (planId: string) => void;
  emptyTitle: string;
  emptyDescription: string;
  onRefresh?: () => void;
}) {
  if (props.plans.length === 0) {
    return <EmptyState title={props.emptyTitle} description={props.emptyDescription} actionLabel="Refresh" onAction={props.onRefresh} />;
  }

  return (
    <Table.ScrollContainer minWidth={980}>
      <Table highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Plan</Table.Th>
            <Table.Th>Project</Table.Th>
            <Table.Th>Approval</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Updated</Table.Th>
            <Table.Th />
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
                <Code>{plan.workLoop.projectId}</Code>
              </Table.Td>
              <Table.Td><ApprovalBadge plan={plan} /></Table.Td>
              <Table.Td><StatusBadge plan={plan} /></Table.Td>
              <Table.Td>
                <Text size="sm">{new Date(plan.updatedAt).toLocaleString()}</Text>
              </Table.Td>
              <Table.Td>
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  {props.onApprove ? <Button size="xs" leftSection={<Check size={14} />} onClick={() => props.onApprove?.(plan.id)}>Approve</Button> : null}
                  {props.onReject ? <Button size="xs" variant="light" color="red" leftSection={<X size={14} />} onClick={() => props.onReject?.(plan.id)}>Reject</Button> : null}
                  <Button size="xs" variant="default" onClick={() => props.onDetail(plan.id)}>Open</Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
