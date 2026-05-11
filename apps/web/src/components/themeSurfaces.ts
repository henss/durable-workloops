import type { MantineColorScheme } from "@mantine/core";
import type React from "react";

export type AppThemeTokens = {
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  borderSubtle: string;
  text: string;
  textMuted: string;
  accent: string;
  accent2: string;
  accentMuted: string;
  glowBlue: string;
  glowCyan: string;
  gridLine: string;
  shadowSoft: string;
  shadowHover: string;
};

export const lightTokens: AppThemeTokens = {
  bg: "#f5f8fc",
  surface: "#ffffff",
  surfaceElevated: "#fbfdff",
  border: "#d9e4f2",
  borderSubtle: "#e8eef7",
  text: "#08111f",
  textMuted: "#667085",
  accent: "#2563eb",
  accent2: "#0891b2",
  accentMuted: "#dbeafe",
  glowBlue: "rgba(37, 99, 235, 0.16)",
  glowCyan: "rgba(8, 145, 178, 0.12)",
  gridLine: "rgba(37, 99, 235, 0.024)",
  shadowSoft: "0 12px 34px rgba(15, 23, 42, 0.07)",
  shadowHover: "0 18px 42px rgba(37, 99, 235, 0.13)",
};

export const darkTokens: AppThemeTokens = {
  bg: "#060b14",
  surface: "#0b1320",
  surfaceElevated: "#111c2b",
  border: "#223047",
  borderSubtle: "#182338",
  text: "#eef5ff",
  textMuted: "#95a3b8",
  accent: "#60a5fa",
  accent2: "#22d3ee",
  accentMuted: "#102a4d",
  glowBlue: "rgba(96, 165, 250, 0.22)",
  glowCyan: "rgba(34, 211, 238, 0.14)",
  gridLine: "rgba(96, 165, 250, 0.034)",
  shadowSoft: "0 18px 48px rgba(0, 0, 0, 0.28)",
  shadowHover: "0 22px 58px rgba(34, 211, 238, 0.12)",
};

export function themeTokens(colorScheme: MantineColorScheme): AppThemeTokens {
  return colorScheme === "dark" ? darkTokens : lightTokens;
}

export function appBackground(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark"
    ? "radial-gradient(circle at 20% 0%, rgba(59,130,246,0.18), transparent 32%), radial-gradient(circle at 85% 12%, rgba(20,184,166,0.13), transparent 30%), #070d18"
    : "radial-gradient(circle at 20% 0%, rgba(59,130,246,0.10), transparent 32%), radial-gradient(circle at 85% 15%, rgba(20,184,166,0.08), transparent 28%), #f6f8fb";
}

export function shellPanelBackground(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark" ? "rgba(11, 19, 32, 0.82)" : "rgba(255, 255, 255, 0.82)";
}

export function elevatedPanelBackground(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark"
    ? "linear-gradient(180deg, #111c2b 0%, #0b1320 100%)"
    : "linear-gradient(180deg, #fbfdff 0%, #ffffff 100%)";
}

export function subtleBorder(colorScheme: MantineColorScheme): string {
  return `1px solid ${themeTokens(colorScheme).border}`;
}

export function mutedSurface(colorScheme: MantineColorScheme): string {
  return colorScheme === "dark" ? "#111c2b" : "#f1f5f9";
}

export function appCssVariables(colorScheme: MantineColorScheme): React.CSSProperties {
  const tokens = themeTokens(colorScheme);
  return {
    "--aw-bg": tokens.bg,
    "--aw-surface": tokens.surface,
    "--aw-surface-elevated": tokens.surfaceElevated,
    "--aw-border": tokens.border,
    "--aw-border-subtle": tokens.borderSubtle,
    "--aw-text": tokens.text,
    "--aw-text-muted": tokens.textMuted,
    "--aw-accent": tokens.accent,
    "--aw-accent-2": tokens.accent2,
    "--aw-accent-muted": tokens.accentMuted,
    "--aw-glow-blue": tokens.glowBlue,
    "--aw-glow-cyan": tokens.glowCyan,
    "--aw-grid-line": tokens.gridLine,
    "--aw-shadow-soft": tokens.shadowSoft,
    "--aw-shadow-hover": tokens.shadowHover,
  } as React.CSSProperties;
}
