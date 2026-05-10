import {
  Accordion,
  Badge,
  Box,
  Code,
  Divider,
  Grid,
  Group,
  List,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Timeline,
  Title,
} from "@mantine/core";
import { CheckCircle2, CircleDot, FileText, GitBranch, Link2, ListChecks, RotateCcw, ShieldCheck } from "lucide-react";
import type { WorkLoop } from "@agent-workloops/api";
import type React from "react";
import { countSlicesByStatus, getBlockedByLabels, getSliceProgress } from "./workLoopView.js";

const sliceStatusColors: Record<string, string> = {
  ready: "blue",
  running: "cyan",
  reviewing: "violet",
  repair_queued: "orange",
  blocked: "red",
  needs_stefan: "yellow",
  done: "green",
  canceled: "gray",
};

export function WorkLoopVisualization({ workLoop }: { workLoop: WorkLoop }) {
  const progress = getSliceProgress(workLoop);
  const statusCounts = countSlicesByStatus(workLoop);

  return (
    <Tabs defaultValue="overview" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="overview">Overview</Tabs.Tab>
        <Tabs.Tab value="slices">Slices</Tabs.Tab>
        <Tabs.Tab value="policies">Policies</Tabs.Tab>
        <Tabs.Tab value="raw">Raw</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="overview" pt="md">
        <Stack gap="md">
          <Paper withBorder radius="md" p="md">
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Text size="xs" tt="uppercase" fw={700} c="dimmed">Objective</Text>
                  <Title order={3}>{workLoop.objective}</Title>
                </Box>
                <Badge color={workLoop.status === "done" ? "green" : workLoop.status === "blocked" ? "red" : "blue"} variant="light">
                  {workLoop.status}
                </Badge>
              </Group>
              <Grid>
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <Fact label="Workloop" value={workLoop.id} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <Fact label="Project" value={workLoop.projectId} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <Fact label="Source" value={workLoop.source} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <Fact label="Issue" value={workLoop.linearIssueId ?? "none"} />
                </Grid.Col>
              </Grid>
            </Stack>
          </Paper>

          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            <Paper withBorder radius="md" p="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" fw={700}>Slice progress</Text>
                  <Text size="sm" c="dimmed">{progress.completed}/{progress.total}</Text>
                </Group>
                <Progress value={progress.value} color="green" radius="xl" />
                <Text size="xs" c="dimmed">{progress.value}% of slices are marked done.</Text>
              </Stack>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Stack gap="xs">
                <Text size="sm" fw={700}>Review</Text>
                <Group gap="xs">
                  <Badge color={workLoop.reviewPolicy.required ? "violet" : "gray"} variant="light">
                    {workLoop.reviewPolicy.required ? "required" : "optional"}
                  </Badge>
                  <Badge color={workLoop.reviewPolicy.repairOnReviewFailure ? "orange" : "gray"} variant="light">
                    {workLoop.reviewPolicy.repairOnReviewFailure ? "repair on failure" : "no auto repair"}
                  </Badge>
                </Group>
              </Stack>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Stack gap="xs">
                <Text size="sm" fw={700}>Runaway guard</Text>
                <Text size="xl" fw={700}>{workLoop.runawayGuard.maxConsecutiveAgentRuns}</Text>
                <Text size="xs" c="dimmed">max consecutive agent runs</Text>
              </Stack>
            </Paper>
          </SimpleGrid>

          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group gap="xs">
                <ThemeIcon variant="light" size="sm"><ShieldCheck size={14} /></ThemeIcon>
                <Text fw={700}>Success criteria</Text>
              </Group>
              <List spacing="xs" size="sm" icon={<CheckCircle2 size={14} />}>
                {workLoop.successCriteria.map((criterion) => (
                  <List.Item key={criterion}>{criterion}</List.Item>
                ))}
              </List>
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Text fw={700}>Slice status mix</Text>
              <Group gap="xs">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <Badge key={status} color={sliceStatusColors[status] ?? "gray"} variant="light">
                    {status.replace("_", " ")}: {count}
                  </Badge>
                ))}
              </Group>
            </Stack>
          </Paper>
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="slices" pt="md">
        <Timeline active={getLastDoneSliceIndex(workLoop)} bulletSize={28} lineWidth={2}>
          {workLoop.slices.map((slice, index) => (
            <Timeline.Item
              key={slice.id}
              bullet={slice.status === "done" ? <CheckCircle2 size={14} /> : <CircleDot size={14} />}
              title={
                <Group gap="xs" wrap="wrap">
                  <Text fw={700}>{slice.title}</Text>
                  <Badge size="sm" color={sliceStatusColors[slice.status] ?? "gray"} variant="light">{slice.status.replace("_", " ")}</Badge>
                  <Badge size="sm" variant="outline">#{index + 1}</Badge>
                </Group>
              }
            >
              <SliceCard slice={slice} workLoop={workLoop} />
            </Timeline.Item>
          ))}
        </Timeline>
      </Tabs.Panel>

      <Tabs.Panel value="policies" pt="md">
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <PolicyCard icon={<ListChecks size={16} />} title="Completion">
            <Fact label="Default action" value={workLoop.completionPolicy.defaultAction} />
            <Divider my="sm" />
            <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={4}>Stop only for</Text>
            <Group gap="xs">
              {workLoop.completionPolicy.stopOnlyFor.map((reason) => (
                <Badge key={reason} variant="light">{reason}</Badge>
              ))}
            </Group>
          </PolicyCard>
          <PolicyCard icon={<ShieldCheck size={16} />} title="Review">
            <Fact label="Required" value={workLoop.reviewPolicy.required ? "yes" : "no"} />
            <Divider my="sm" />
            <Fact label="Repair on failure" value={workLoop.reviewPolicy.repairOnReviewFailure ? "yes" : "no"} />
          </PolicyCard>
          <PolicyCard icon={<RotateCcw size={16} />} title="Runaway guard">
            <Fact label="Max consecutive runs" value={String(workLoop.runawayGuard.maxConsecutiveAgentRuns)} />
            <Divider my="sm" />
            <Fact label="Escalate after" value={workLoop.runawayGuard.requireStefanAfter ?? "not configured"} />
          </PolicyCard>
        </SimpleGrid>
      </Tabs.Panel>

      <Tabs.Panel value="raw" pt="md">
        <Code block>{JSON.stringify(workLoop, null, 2)}</Code>
      </Tabs.Panel>
    </Tabs>
  );
}

function SliceCard({ slice, workLoop }: { slice: WorkLoop["slices"][number]; workLoop: WorkLoop }) {
  const dependencies = getBlockedByLabels(slice, workLoop);
  return (
    <Paper withBorder radius="md" p="md" mt="xs" mb="md">
      <Stack gap="sm">
        <Group gap="xs" wrap="wrap">
          <Fact label="Slice id" value={slice.id} inline />
          <Fact label="Attempts" value={String(slice.attemptCount)} inline />
          {slice.linearIssueId ? <Fact label="Issue" value={slice.linearIssueId} inline /> : null}
        </Group>
        {dependencies.length > 0 ? (
          <Group gap="xs" align="flex-start">
            <ThemeIcon variant="light" size="sm"><GitBranch size={14} /></ThemeIcon>
            <Box>
              <Text size="xs" tt="uppercase" fw={700} c="dimmed">Depends on</Text>
              <Group gap="xs" mt={4}>
                {dependencies.map((dependency) => (
                  <Badge key={dependency} variant="light">{dependency}</Badge>
                ))}
              </Group>
            </Box>
          </Group>
        ) : null}
        <ArtifactLinks slice={slice} />
      </Stack>
    </Paper>
  );
}

function ArtifactLinks({ slice }: { slice: WorkLoop["slices"][number] }) {
  const artifacts = [
    { label: "Task packet", path: slice.taskPacketPath, icon: <FileText size={14} /> },
    { label: "Last outcome", path: slice.lastOutcomePath, icon: <Link2 size={14} /> },
    { label: "Last peer review", path: slice.lastPeerReviewPath, icon: <ShieldCheck size={14} /> },
  ].flatMap((artifact) => (artifact.path ? [{ ...artifact, path: artifact.path }] : []));

  if (artifacts.length === 0) {
    return <Text size="sm" c="dimmed">No artifact paths recorded for this slice.</Text>;
  }

  return (
    <Accordion variant="contained">
      <Accordion.Item value="artifacts">
        <Accordion.Control>Artifacts</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="xs">
            {artifacts.map((artifact) => (
              <Group key={artifact.label} gap="xs">
                <ThemeIcon variant="light" size="sm">{artifact.icon}</ThemeIcon>
                <Text size="sm" fw={600}>{artifact.label}</Text>
                <Code>{artifact.path}</Code>
              </Group>
            ))}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

function PolicyCard(props: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <ThemeIcon variant="light" size="sm">{props.icon}</ThemeIcon>
          <Text fw={700}>{props.title}</Text>
        </Group>
        {props.children}
      </Stack>
    </Paper>
  );
}

function Fact(props: { label: string; value: string; inline?: boolean }) {
  return (
    <Box>
      <Text size="xs" tt="uppercase" fw={700} c="dimmed">{props.label}</Text>
      {props.inline ? <Code>{props.value}</Code> : <Text size="sm" fw={600}>{props.value}</Text>}
    </Box>
  );
}

function getLastDoneSliceIndex(workLoop: WorkLoop): number {
  for (let index = workLoop.slices.length - 1; index >= 0; index -= 1) {
    if (workLoop.slices[index]?.status === "done") {
      return index;
    }
  }
  return -1;
}
