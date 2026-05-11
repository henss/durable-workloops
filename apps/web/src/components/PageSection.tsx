import type React from "react";
import { Paper, useComputedColorScheme } from "@mantine/core";
import { elevatedPanelBackground, subtleBorder, themeTokens } from "./themeSurfaces.js";

export function PageSection(props: { children: React.ReactNode }) {
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const tokens = themeTokens(computedColorScheme);
  return (
    <Paper
      p={0}
      bg={elevatedPanelBackground(computedColorScheme)}
      style={{
        border: subtleBorder(computedColorScheme),
        boxShadow: tokens.shadowSoft,
        overflow: "hidden",
      }}
    >
      {props.children}
    </Paper>
  );
}
