import { Code, Group, JsonInput, ScrollArea, Stack, Text, Title } from "@mantine/core";
import { ApprovalBadge, StatusBadge } from "../../components/PlanBadges.js";
import type { PlanDetailRecord } from "../../types.js";

export function PlanDetail({ detail }: { detail: PlanDetailRecord }) {
  return (
    <Stack>
      <Group>
        <StatusBadge plan={detail.plan} />
        <ApprovalBadge plan={detail.plan} />
        <Code>{detail.plan.workLoop.projectId}</Code>
      </Group>
      <JsonInput autosize minRows={12} value={JSON.stringify(detail.plan.workLoop, null, 2)} readOnly />
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
