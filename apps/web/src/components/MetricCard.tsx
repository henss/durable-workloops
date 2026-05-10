import type React from "react";
import { Box, Group, Paper, Text, ThemeIcon, useComputedColorScheme } from "@mantine/core";
import { elevatedPanelBackground, subtleBorder } from "./themeSurfaces.js";

export function MetricCard(props: { label: string; value: number; icon: React.ReactNode; color: string }) {
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  return (
    <Paper p="md" shadow="sm" bg={elevatedPanelBackground(computedColorScheme)} style={{ border: subtleBorder(computedColorScheme) }}>
      <Group justify="space-between">
        <Box>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">{props.label}</Text>
          <Text size="xl" fw={800}>{props.value}</Text>
        </Box>
        <ThemeIcon variant="light" color={props.color} size="lg">
          {props.icon}
        </ThemeIcon>
      </Group>
    </Paper>
  );
}
