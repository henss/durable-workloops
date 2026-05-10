import type { MantineColorScheme } from "@mantine/core";

export function appBackground(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark"
    ? "linear-gradient(135deg, #070b12 0%, #0d1422 46%, #082529 100%)"
    : "linear-gradient(135deg, var(--mantine-color-slate-0) 0%, #fbfcff 45%, var(--mantine-color-brand-0) 100%)";
}

export function shellPanelBackground(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark"
    ? "rgba(13, 20, 34, 0.92)"
    : "rgba(255, 255, 255, 0.86)";
}

export function elevatedPanelBackground(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark"
    ? "linear-gradient(180deg, rgba(18, 27, 44, 0.96), rgba(12, 18, 30, 0.96))"
    : "linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 250, 255, 0.96))";
}

export function subtleBorder(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark"
    ? "1px solid rgba(124, 160, 207, 0.18)"
    : "1px solid rgba(47, 127, 235, 0.14)";
}
