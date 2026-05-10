import { Center, Stack, Text, ThemeIcon } from "@mantine/core";
import { Info } from "lucide-react";

export function EmptyState({ label }: { label: string }) {
  return (
    <Center p="xl">
      <Stack gap={4} align="center">
        <ThemeIcon variant="light" color="gray" radius="xl" size="lg">
          <Info size={18} />
        </ThemeIcon>
        <Text size="sm" c="dimmed">{label}</Text>
      </Stack>
    </Center>
  );
}
