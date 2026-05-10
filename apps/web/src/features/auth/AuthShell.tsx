import type React from "react";
import { Box, Center, Container, Group, Paper, Stack, useComputedColorScheme } from "@mantine/core";
import { ColorSchemeControl } from "../../components/ColorSchemeControl.js";

export function AuthShell(props: { children: React.ReactNode; size?: "xs" | "sm" }) {
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  return (
    <Box bg={computedColorScheme === "dark" ? "dark.8" : "gray.0"} mih="100vh">
      <Center mih="100vh" p="lg">
        <Container size={props.size ?? "xs"} w="100%">
          <Paper withBorder radius="md" p="xl" shadow="sm">
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
