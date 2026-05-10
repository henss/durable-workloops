import { Button, Center, Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { Info } from "lucide-react";

export function EmptyState(props: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  links?: Array<{ label: string; onClick: () => void }>;
}) {
  return (
    <Center p="lg">
      <Stack gap="xs" align="center" maw={420}>
        <ThemeIcon variant="light" color="brand" radius="xl" size="md">
          <Info size={16} />
        </ThemeIcon>
        <Title order={3} size="h4" ta="center">{props.title}</Title>
        <Text size="sm" c="dimmed" ta="center">{props.description}</Text>
        {props.onAction ? (
          <Button mt="xs" size="xs" variant="default" onClick={props.onAction}>{props.actionLabel ?? "Refresh"}</Button>
        ) : null}
        {props.links && props.links.length > 0 ? (
          <Group gap="xs" mt={4}>
            {props.links.map((link) => (
              <Button key={link.label} size="compact-xs" variant="subtle" onClick={link.onClick}>{link.label}</Button>
            ))}
          </Group>
        ) : null}
      </Stack>
    </Center>
  );
}
