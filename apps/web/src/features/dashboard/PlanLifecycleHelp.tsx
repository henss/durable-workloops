import { Badge, Box, Button, Group, Paper, Popover, ScrollArea, Stack, Text, ThemeIcon, useComputedColorScheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { CheckCircle2, ChevronRight, HelpCircle } from "lucide-react";
import type { DashboardTab } from "../../types.js";
import { subtleBorder, themeTokens } from "../../components/themeSurfaces.js";
import { getLifecycleStepAriaLabel, planLifecycleStages, productConcepts, productSummary } from "./productCopy.js";

export function PlanLifecycleHelp({ activeTab }: { activeTab: DashboardTab }) {
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const tokens = themeTokens(computedColorScheme);
  const [opened, { close, open, toggle }] = useDisclosure(false);

  return (
    <Paper
      component="section"
      aria-labelledby="plan-lifecycle-title"
      className="aw-lifecycle-panel"
      p="xs"
      style={{ border: subtleBorder(computedColorScheme), boxShadow: tokens.shadowSoft }}
      data-testid="plan-lifecycle-panel"
    >
      <Stack gap={6}>
        <Group justify="space-between" gap="xs" wrap="nowrap" className="aw-lifecycle-header">
          <Text id="plan-lifecycle-title" size="xs" fw={800} c={tokens.textMuted}>
            Plan lifecycle
          </Text>
          <Popover opened={opened} onChange={(nextOpened) => (nextOpened ? open() : close())} position="bottom-end" width={560} shadow="lg" withinPortal>
            <Popover.Target>
              <Button
                size="xs"
                variant="light"
                leftSection={<HelpCircle size={14} aria-hidden />}
                onClick={toggle}
                aria-expanded={opened}
                aria-controls="plan-lifecycle-explanation"
                data-testid="plan-lifecycle-disclosure"
              >
                How this works
              </Button>
            </Popover.Target>
            <Popover.Dropdown id="plan-lifecycle-explanation" className="aw-lifecycle-popover">
              <LifecycleExplanation />
            </Popover.Dropdown>
          </Popover>
        </Group>

        <ScrollArea type="auto" offsetScrollbars="x">
          <Group
            className="aw-lifecycle-strip"
            gap={0}
            role="list"
            aria-label="Plan lifecycle"
            data-testid="plan-lifecycle"
            wrap="nowrap"
          >
            {planLifecycleStages.map((stage, index) => (
              <Group key={stage.key} className="aw-lifecycle-step-wrap" gap={0} role="listitem" wrap="nowrap">
                <Box
                  className="aw-lifecycle-step"
                  data-active={activeTab === stage.key}
                  aria-current={activeTab === stage.key ? "step" : undefined}
                  aria-label={getLifecycleStepAriaLabel(stage, activeTab)}
                  title={stage.description}
                  data-testid={`plan-lifecycle-${stage.key}`}
                >
                  <ThemeIcon size={22} variant={activeTab === stage.key ? "gradient" : "light"} aria-hidden>
                    {activeTab === stage.key ? <CheckCircle2 size={13} /> : <Text size="xs" fw={800}>{index + 1}</Text>}
                  </ThemeIcon>
                  <Text size="xs" fw={760} className="aw-lifecycle-step-label">
                    {stage.label}
                  </Text>
                  {activeTab === stage.key ? (
                    <Badge size="xs" variant="light" className="aw-lifecycle-current-badge">
                      Current
                    </Badge>
                  ) : null}
                </Box>
                {index < planLifecycleStages.length - 1 ? <ChevronRight className="aw-lifecycle-arrow" size={14} aria-hidden /> : null}
              </Group>
            ))}
          </Group>
        </ScrollArea>
      </Stack>
    </Paper>
  );
}

function LifecycleExplanation() {
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const tokens = themeTokens(computedColorScheme);
  return (
    <Stack gap="sm">
      <Text size="sm" fw={750}>
        How Agent Workloops works
      </Text>
      <Text size="sm" c={tokens.textMuted}>
        {productSummary}
      </Text>
      <Group gap="sm" wrap="wrap" aria-label="Core Agent Workloops concepts">
        {productConcepts.map((concept) => (
          <Text key={concept.label} size="xs" c={tokens.textMuted} className="aw-concept-item">
            <Text component="span" fw={750} c={tokens.text}>
              {concept.label}:
            </Text>{" "}
            {concept.description}
          </Text>
        ))}
      </Group>
      <Stack gap={4} role="list" aria-label="Lifecycle details">
        {planLifecycleStages.map((stage) => (
          <Text key={stage.key} size="xs" c={tokens.textMuted} role="listitem">
            <Text component="span" fw={750} c={tokens.text}>
              {stage.label}:
            </Text>{" "}
            {stage.description}
          </Text>
        ))}
      </Stack>
    </Stack>
  );
}
