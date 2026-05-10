import { Code, Group, ScrollArea, Stack, Text, Title } from "@mantine/core";
import { ApprovalBadge, StatusBadge } from "../../components/PlanBadges.js";
import type { PlanDetailRecord } from "../../types.js";
import { WorkLoopVisualization } from "./WorkLoopVisualization.js";

export function PlanDetail({ detail }: { detail: PlanDetailRecord }) {
  return (
    <Stack>
      <Group>
        <StatusBadge plan={detail.plan} />
        <ApprovalBadge plan={detail.plan} />
        <Code>{detail.plan.workLoop.projectId}</Code>
      </Group>
      <WorkLoopVisualization workLoop={detail.plan.workLoop} />
      <Title order={4}>Audit trail</Title>
      <ScrollArea h={220}>
        <Stack gap="xs">
          {detail.audit.length === 0 ? <Text size="sm" c="dimmed">No audit events recorded.</Text> : null}
          {detail.audit.map((event) => (
            <Code key={event.id} block>{JSON.stringify(event, null, 2)}</Code>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
