import type React from "react";
import { Box, Group, Paper, Text, ThemeIcon } from "@mantine/core";

export function MetricCard(props: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between">
        <Box>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">{props.label}</Text>
          <Text size="xl" fw={700}>{props.value}</Text>
        </Box>
        <ThemeIcon variant="light" color={props.color} radius="md" size="lg">
          {props.icon}
        </ThemeIcon>
      </Group>
    </Paper>
  );
}
