import { Box, Button, Center, Group, Stack, Text, ThemeIcon, Title, useComputedColorScheme } from "@mantine/core";
import { RadioTower } from "lucide-react";
import { subtleBorder, themeTokens } from "./themeSurfaces.js";

export function EmptyState(props: {
  dataTestId?: string;
  title: string;
  description: string;
  checkedAt?: Date | null;
  actionLabel?: string;
  onAction?: () => void;
  links?: Array<{ label: string; onClick: () => void }>;
}) {
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const tokens = themeTokens(computedColorScheme);
  return (
    <Center p="lg">
      <Box
        className="aw-empty-panel"
        p="xl"
        w="100%"
        maw={620}
        style={{ border: subtleBorder(computedColorScheme), borderRadius: "var(--mantine-radius-lg)", boxShadow: tokens.shadowSoft }}
        data-testid={props.dataTestId}
      >
        <Stack gap="xs" align="center" pos="relative">
          <ThemeIcon className="aw-idle-orb" variant="gradient" gradient={{ from: "brand.6", to: "aqua.5", deg: 135 }} radius="xl" size={42}>
            <RadioTower size={19} />
          </ThemeIcon>
          <Title order={3} size="h4" ta="center">{props.title}</Title>
          <Text size="sm" c={tokens.textMuted} ta="center">{props.description}</Text>
          {props.checkedAt ? (
            <Text size="xs" c={tokens.textMuted} ff="Geist Mono, IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace">
              Last checked {props.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          ) : null}
          {props.onAction ? (
            <Button mt="xs" size="xs" variant="gradient" onClick={props.onAction}>{props.actionLabel ?? "Refresh queue"}</Button>
          ) : null}
          {props.links && props.links.length > 0 ? (
            <Group gap="xs" mt={4}>
              {props.links.map((link) => (
                <Button key={link.label} size="compact-xs" variant="subtle" onClick={link.onClick}>{link.label}</Button>
              ))}
            </Group>
          ) : null}
        </Stack>
      </Box>
    </Center>
  );
}
