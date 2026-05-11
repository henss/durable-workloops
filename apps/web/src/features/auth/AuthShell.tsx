import type React from "react";
import { Box, Center, Container, Group, Paper, Stack, useComputedColorScheme } from "@mantine/core";
import { ColorSchemeControl } from "../../components/ColorSchemeControl.js";
import { appBackground, appCssVariables, elevatedPanelBackground, subtleBorder, themeTokens } from "../../components/themeSurfaces.js";

export function AuthShell(props: { children: React.ReactNode; size?: "xs" | "sm" }) {
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const tokens = themeTokens(computedColorScheme);
  return (
    <Box bg={appBackground(computedColorScheme)} mih="100vh" style={appCssVariables(computedColorScheme)}>
      <Center mih="100vh" p="lg">
        <Container size={props.size ?? "xs"} w="100%">
          <Paper p="xl" bg={elevatedPanelBackground(computedColorScheme)} style={{ border: subtleBorder(computedColorScheme), boxShadow: tokens.shadowSoft }}>
            <Stack gap="md">
              <Group justify="flex-end">
                <ColorSchemeControl />
              </Group>
              {props.children}
            </Stack>
          </Paper>
        </Container>
      </Center>
    </Box>
  );
}
