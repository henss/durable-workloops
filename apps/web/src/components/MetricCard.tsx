import type React from "react";
import { Badge, Box, Group, Paper, Text, ThemeIcon, UnstyledButton, useComputedColorScheme } from "@mantine/core";
import { themeTokens } from "./themeSurfaces.js";

const statusColors = {
  yellow: { light: "#d97706", dark: "#fbbf24" },
  aqua: { light: "#0891b2", dark: "#22d3ee" },
  brand: { light: "#2563eb", dark: "#60a5fa" },
};

export function MetricCard(props: {
  label: string;
  value: number;
  microcopy: string;
  icon: React.ReactNode;
  color: keyof typeof statusColors;
  active?: boolean;
  ariaLabel?: string;
  dataTestId?: string;
  onClick?: () => void;
}) {
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const tokens = themeTokens(computedColorScheme);
  const accent = statusColors[props.color][computedColorScheme];
  return (
    <UnstyledButton
      className="aw-status-card-button"
      data-active={props.active}
      data-testid={props.dataTestId}
      aria-label={props.ariaLabel ?? `Show ${props.label.toLowerCase()} queue`}
      aria-current={props.active ? "page" : undefined}
      onClick={props.onClick}
    >
      <Paper
        p="sm"
        className="aw-status-card"
        style={{
          "--status-accent": accent,
        }}
      >
        <Group justify="space-between" align="center" wrap="nowrap">
          <Box>
            <Group gap="xs" wrap="nowrap">
              <Text size="xs" tt="uppercase" fw={800} c={tokens.textMuted} style={{ letterSpacing: "0.06em" }}>{props.label}</Text>
              {props.active ? <Badge size="xs" variant="light">Current</Badge> : null}
            </Group>
            <Text size="28px" fw={850} lh={1.02} ff="Geist Mono, IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace">{props.value}</Text>
            <Text size="xs" c={tokens.textMuted} mt={2}>{props.microcopy}</Text>
          </Box>
          <ThemeIcon
            variant="light"
            size="lg"
            radius="lg"
            style={{
              color: accent,
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${accent} 24%, transparent)`,
            }}
          >
            {props.icon}
          </ThemeIcon>
        </Group>
      </Paper>
    </UnstyledButton>
  );
}
