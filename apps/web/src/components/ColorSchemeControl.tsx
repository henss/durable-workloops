import { Group, SegmentedControl, Text, Tooltip, useMantineColorScheme } from "@mantine/core";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ColorSchemePreference } from "../types.js";

export function ColorSchemeControl({ fullWidth = false, compact = false }: { fullWidth?: boolean; compact?: boolean }) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const options = [
    { value: "light", label: "Light", icon: <Sun size={14} /> },
    { value: "dark", label: "Dark", icon: <Moon size={14} /> },
    { value: "auto", label: "System", icon: <Monitor size={14} /> },
  ];
  return (
    <SegmentedControl
      value={colorScheme}
      onChange={(value) => setColorScheme(value as ColorSchemePreference)}
      fullWidth={fullWidth}
      data={options.map((option) => ({
        value: option.value,
        label: compact ? (
          <Tooltip label={option.label}>
            <Group gap={0} wrap="nowrap">{option.icon}</Group>
          </Tooltip>
        ) : (
          <Group gap={6} wrap="nowrap">
            {option.icon}
            <Text size="xs">{option.label}</Text>
          </Group>
        ),
      }))}
    />
  );
}
