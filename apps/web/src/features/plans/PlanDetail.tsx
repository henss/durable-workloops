import { Badge, Box, Code, Divider, Group, Modal, Paper, ScrollArea, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { ApprovalBadge, StatusBadge } from "../../components/PlanBadges.js";
import type { PlanDetailRecord } from "../../types.js";
import { WorkLoopVisualization } from "./WorkLoopVisualization.js";

export type PlanDetailTab = "overview" | "slices" | "policies" | "raw";

export function PlanDetailModal(props: {
  opened: boolean;
  onClose: () => void;
  detail: PlanDetailRecord | null;
  initialTab?: PlanDetailTab;
}) {
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      size="min(1180px, calc(100vw - 32px))"
      title="Plan detail"
      centered
      classNames={{
        content: "aw-plan-detail-modal-content",
        body: "aw-plan-detail-modal-body",
        header: "aw-plan-detail-modal-header",
        title: "aw-plan-detail-modal-title",
      }}
    >
      {props.detail ? <PlanDetail detail={props.detail} initialTab={props.initialTab} /> : null}
    </Modal>
  );
}

export function PlanDetail({ detail, initialTab = "overview" }: { detail: PlanDetailRecord; initialTab?: PlanDetailTab }) {
  const { plan } = detail;
  const workLoop = plan.workLoop;

  return (
    <Stack gap="lg" className="aw-plan-detail">
      <Paper withBorder p="lg" className="aw-plan-detail-hero">
        <Stack gap="md">
          <Group className="aw-plan-detail-hero-top" justify="space-between" align="flex-start" gap="md">
            <Box className="aw-plan-detail-heading">
              <Text size="xs" tt="uppercase" fw={800} c="dimmed">Objective</Text>
              <Title order={2} className="aw-plan-detail-objective">{workLoop.objective}</Title>
              <Text size="xs" c="dimmed" ff="monospace" className="aw-break-anywhere">{plan.id}</Text>
            </Box>
            <Group className="aw-plan-detail-badges" gap="xs" wrap="wrap" justify="flex-end">
              <StatusBadge plan={plan} />
              <ApprovalBadge plan={plan} />
              <Badge
                color={workLoop.status === "done" ? "green" : workLoop.status === "blocked" ? "red" : "blue"}
                variant="light"
                title={`WorkLoop status: ${workLoop.status.replace("_", " ")}`}
                aria-label={`WorkLoop status: ${workLoop.status.replace("_", " ")}`}
              >
                WorkLoop: {workLoop.status.replace("_", " ")}
              </Badge>
            </Group>
          </Group>

          <Divider />

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            <DetailFact label="Workloop" value={workLoop.id} />
            <DetailFact label="Project" value={workLoop.projectId} />
            <DetailFact label="Source" value={workLoop.source} />
            <DetailFact label="Issue" value={workLoop.linearIssueId ?? "none"} />
          </SimpleGrid>
        </Stack>
      </Paper>

      <WorkLoopVisualization workLoop={workLoop} initialTab={initialTab} />

      <Group justify="space-between" align="center">
        <Title order={4}>Audit trail</Title>
        <Text size="xs" c="dimmed">{detail.audit.length === 1 ? "1 event" : `${detail.audit.length} events`}</Text>
      </Group>

      <ScrollArea h={280} type="auto" offsetScrollbars>
        <Stack gap="sm" pr="xs">
          {detail.audit.length === 0 ? <Text size="sm" c="dimmed">No audit events recorded.</Text> : null}
          {detail.audit.map((event) => (
            <Paper key={event.id} withBorder p="sm" className="aw-audit-event">
              <Stack gap="xs">
                <Group justify="space-between" gap="sm">
                  <Group gap="xs" wrap="wrap">
                    <Badge>{event.type.replace("_", " ")}</Badge>
                    <Text size="xs" c="dimmed" ff="monospace" className="aw-break-anywhere">{event.id}</Text>
                  </Group>
                  <Text size="xs" c="dimmed">{formatDetailTimestamp(event.createdAt)}</Text>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                  <DetailFact label="Plan" value={event.planId ?? "none"} compact />
                  <DetailFact label="User" value={event.actorUserId ?? "none"} compact />
                  <DetailFact label="Token" value={event.actorTokenId ?? "none"} compact />
                </SimpleGrid>
                {JSON.stringify(event.metadata) !== "{}" ? (
                  <Code block className="aw-code-block">{JSON.stringify(event.metadata, null, 2)}</Code>
                ) : null}
              </Stack>
            </Paper>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

function DetailFact(props: { label: string; value: string; compact?: boolean }) {
  return (
    <Box className="aw-fact">
      <Text size="xs" tt="uppercase" fw={800} c="dimmed">{props.label}</Text>
      <Text size={props.compact ? "xs" : "sm"} fw={650} className="aw-break-anywhere">{props.value}</Text>
    </Box>
  );
}

function formatDetailTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
