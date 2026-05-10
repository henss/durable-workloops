import { Group, SegmentedControl, Text, useMantineColorScheme } from "@mantine/core";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ColorSchemePreference } from "../types.js";

export function ColorSchemeControl({ fullWidth = false }: { fullWidth?: boolean }) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <SegmentedControl
      value={colorScheme}
      onChange={(value) => setColorScheme(value as ColorSchemePreference)}
      fullWidth={fullWidth}
      data={[
        { value: "light", label: <Group gap={6} wrap="nowrap"><Sun size={14} /><Text size="xs">Light</Text></Group> },
        { value: "dark", label: <Group gap={6} wrap="nowrap"><Moon size={14} /><Text size="xs">Dark</Text></Group> },
        { value: "auto", label: <Group gap={6} wrap="nowrap"><Monitor size={14} /><Text size="xs">System</Text></Group> },
      ]}
    />
  );
}
