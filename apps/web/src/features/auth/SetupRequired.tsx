import { Alert, Box, Button, Code, Group, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { Info, UserPlus } from "lucide-react";

export function SetupRequired(props: {
  form: { email: string; password: string; name: string };
  setForm: (form: { email: string; password: string; name: string }) => void;
  onCreate: () => void;
  bootstrapConfigured: boolean;
  errorMessage: string | null;
}) {
  return (
    <Stack gap="md">
      <Group gap="sm">
        <ThemeIcon size="lg" radius="md" variant="gradient" gradient={{ from: "yellow.6", to: "brand.6", deg: 135 }}>
          <UserPlus size={20} />
        </ThemeIcon>
        <Box>
          <Title order={1} size="h2">Agent Workloops setup</Title>
          <Text size="sm" c="dimmed">Create the first local administrator.</Text>
        </Box>
      </Group>
      <Alert icon={<Info size={16} />} color="yellow" title="No admin user exists">
        Create the first admin account below, or restart the server with bootstrap credentials.
      </Alert>
      {props.bootstrapConfigured ? (
        <Text size="sm" c="dimmed">
          Bootstrap admin environment variables are configured, but no user exists yet. Restart the server to let it create the admin account automatically.
        </Text>
      ) : (
        <Stack gap="xs">
          <Text size="sm">To configure the server through environment variables, restart it with:</Text>
          <Code block>
            AWL_BOOTSTRAP_ADMIN_EMAIL=admin@example.com{"\n"}
            AWL_BOOTSTRAP_ADMIN_PASSWORD=change-this-password
          </Code>
        </Stack>
      )}
      {props.errorMessage ? <Alert color="red">{props.errorMessage}</Alert> : null}
      <TextInput label="Admin email" value={props.form.email} onChange={(event) => props.setForm({ ...props.form, email: event.target.value })} />
      <TextInput label="Name" value={props.form.name} onChange={(event) => props.setForm({ ...props.form, name: event.target.value })} />
      <PasswordInput label="Password" value={props.form.password} onChange={(event) => props.setForm({ ...props.form, password: event.target.value })} />
      <Button variant="gradient" leftSection={<UserPlus size={16} />} onClick={props.onCreate}>Create first admin</Button>
    </Stack>
  );
}
