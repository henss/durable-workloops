import type React from "react";
import { Box, rem } from "@mantine/core";

export type PageContentMode = "wide" | "standard" | "narrow";

export const pageContentMaxWidth: Record<PageContentMode, string> = {
  wide: rem(1600),
  standard: rem(1180),
  narrow: rem(900),
};

export function PageContent(props: {
  mode?: PageContentMode;
  children: React.ReactNode;
  dataTestId?: string;
}) {
  const mode = props.mode ?? "standard";
  return (
    <Box
      w="100%"
      maw={pageContentMaxWidth[mode]}
      mx="auto"
      px={{ base: "md", sm: "lg", xl: "xl" }}
      py="md"
      data-layout-mode={mode}
      data-testid={props.dataTestId ?? `page-content-${mode}`}
    >
      {props.children}
    </Box>
  );
}
