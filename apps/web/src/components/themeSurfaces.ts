import type { MantineColorScheme } from "@mantine/core";

export function appBackground(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark"
    ? "linear-gradient(135deg, #07111f 0%, #091322 58%, #0a1827 100%)"
    : "#f6f9fc";
}

export function shellPanelBackground(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark"
    ? "#0d1726"
    : "#ffffff";
}

export function elevatedPanelBackground(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark"
    ? "#111c2d"
    : "#ffffff";
}

export function subtleBorder(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark"
    ? "1px solid #26364a"
    : "1px solid #dbe5f0";
}

export function mutedSurface(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark" ? "#172337" : "#f1f5f9";
}
