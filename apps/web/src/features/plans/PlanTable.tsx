import { ActionIcon, Button, Code, Group, Menu, Modal, Stack, Table, Text, Tooltip } from "@mantine/core";
import { Check, Eye, MoreHorizontal, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type { PlanRecord } from "@agent-workloops/api";
import { EmptyState } from "../../components/EmptyState.js";
import { ApprovalBadge, StatusBadge } from "../../components/PlanBadges.js";
import { getPlanActionPresentation } from "../dashboard/productCopy.js";

export function PlanTable(props: {
  queueLabel: string;
  dataTestId: string;
  plans: PlanRecord[];
  onDetail: (planId: string) => void;
  detailAction?: "view" | "review";
  onApprove?: (planId: string) => void;
  onReject?: (planId: string) => void;
  onRequestReview?: (planId: string) => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyCheckedAt?: Date | null;
  emptyLinks?: Array<{ label: string; onClick: () => void }>;
  onRefresh?: () => void;
}) {
  const [confirmingReject, setConfirmingReject] = useState<PlanRecord | null>(null);
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
    <>
      <Table.ScrollContainer minWidth={1040}>
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
              <Table.Th scope="col" w={140}><ColumnHeader label="Project" help="Routing metadata" /></Table.Th>
              <Table.Th scope="col" w={132}><ColumnHeader label="Approval" help="Human review gate" /></Table.Th>
              <Table.Th scope="col" w={124}><ColumnHeader label="Status" help="Queue or lease state" /></Table.Th>
              <Table.Th scope="col" w={154}><ColumnHeader label="Updated" help="Last record change" /></Table.Th>
              <Table.Th scope="col" className="aw-actions-header" w={168}><ColumnHeader label="Actions" help="Review or manage" align="right" /></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {props.plans.map((plan) => {
              const detailPresentation = getPlanActionPresentation(props.detailAction ?? "view", plan.workLoop.objective);
              return (
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
                      <Tooltip label={detailPresentation.tooltip}>
                        <Button
                          variant="default"
                          size="xs"
                          leftSection={<Eye size={14} />}
                          aria-label={detailPresentation.ariaLabel}
                          title={detailPresentation.tooltip}
                          data-testid={`plan-action-view-${plan.id}`}
                          onClick={() => props.onDetail(plan.id)}
                        >
                          {detailPresentation.label}
                        </Button>
                      </Tooltip>
                      {props.onApprove || props.onReject || props.onRequestReview ? (
                        <PlanActionsMenu
                          plan={plan}
                          onApprove={props.onApprove}
                          onReject={() => setConfirmingReject(plan)}
                          onRequestReview={props.onRequestReview}
                        />
                      ) : null}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
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
      <RejectPlanModal
        plan={confirmingReject}
        onCancel={() => setConfirmingReject(null)}
        onConfirm={() => {
          if (confirmingReject) {
            props.onReject?.(confirmingReject.id);
            setConfirmingReject(null);
          }
        }}
      />
    </>
  );
}

function PlanActionsMenu(props: {
  plan: PlanRecord;
  onApprove?: (planId: string) => void;
  onReject?: () => void;
  onRequestReview?: (planId: string) => void;
}) {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Tooltip label="More plan actions">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`More actions for plan: ${props.plan.workLoop.objective}`}
            title="More plan actions"
            data-testid={`plan-action-more-${props.plan.id}`}
          >
            <MoreHorizontal size={16} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {props.onApprove ? (
          <Menu.Item
            leftSection={<Check size={14} />}
            onClick={() => props.onApprove?.(props.plan.id)}
            aria-label={getPlanActionPresentation("approve", props.plan.workLoop.objective).ariaLabel}
          >
            {getPlanActionPresentation("approve", props.plan.workLoop.objective).menuLabel}
          </Menu.Item>
        ) : null}
        {props.onRequestReview ? (
          <Menu.Item
            leftSection={<RotateCcw size={14} />}
            onClick={() => props.onRequestReview?.(props.plan.id)}
            aria-label={getPlanActionPresentation("request-review", props.plan.workLoop.objective).ariaLabel}
          >
            {getPlanActionPresentation("request-review", props.plan.workLoop.objective).menuLabel}
          </Menu.Item>
        ) : null}
        {props.onReject ? (
          <Menu.Item
            color="red"
            leftSection={<X size={14} />}
            onClick={props.onReject}
            aria-label={getPlanActionPresentation("reject", props.plan.workLoop.objective).ariaLabel}
          >
            {getPlanActionPresentation("reject", props.plan.workLoop.objective).menuLabel}
          </Menu.Item>
        ) : null}
      </Menu.Dropdown>
    </Menu>
  );
}

function RejectPlanModal(props: {
  plan: PlanRecord | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const presentation = props.plan ? getPlanActionPresentation("reject", props.plan.workLoop.objective) : null;
  return (
    <Modal opened={Boolean(props.plan)} onClose={props.onCancel} title={presentation?.confirmTitle ?? "Reject plan?"} centered>
      <Stack gap="md">
        <Text size="sm">{presentation?.confirmMessage}</Text>
        {props.plan ? (
          <Text size="sm" fw={650} className="aw-break-anywhere">
            {props.plan.workLoop.objective}
          </Text>
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onCancel}>
            Keep plan
          </Button>
          <Button color="red" onClick={props.onConfirm} data-testid="confirm-reject-plan">
            {presentation?.confirmButtonLabel ?? "Reject plan"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ColumnHeader(props: { label: string; help: string; align?: "left" | "right" }) {
  return (
    <span className="aw-column-header" data-align={props.align ?? "left"} title={props.help} aria-label={`${props.label}: ${props.help}`}>
      <Text component="span" size="sm" fw={750}>{props.label}</Text>
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
