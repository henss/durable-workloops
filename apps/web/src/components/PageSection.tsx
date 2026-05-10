import type React from "react";
import { Paper, useComputedColorScheme } from "@mantine/core";
import { elevatedPanelBackground, subtleBorder } from "./themeSurfaces.js";

export function PageSection(props: { children: React.ReactNode }) {
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  return (
    <Paper p={0} shadow="sm" bg={elevatedPanelBackground(computedColorScheme)} style={{ border: subtleBorder(computedColorScheme), overflow: "hidden" }}>
      {props.children}
    </Paper>
  );
}
