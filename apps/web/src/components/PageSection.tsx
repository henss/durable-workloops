import type React from "react";
import { Paper } from "@mantine/core";

export function PageSection(props: { children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p={0} shadow="xs">
      {props.children}
    </Paper>
  );
}
