import { Alert, Box, Button, Group, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { ListChecks, LogIn } from "lucide-react";

export function LoginForm(props: {
  login: { email: string; password: string };
  setLogin: (login: { email: string; password: string }) => void;
  errorMessage: string | null;
  onLogin: () => void;
}) {
  return (
    <Stack gap="md">
      <Group gap="sm">
        <ThemeIcon size="lg" radius="md" variant="gradient">
          <ListChecks size={20} />
        </ThemeIcon>
        <Box>
          <Title order={1} size="h2">Agent Workloops</Title>
          <Text size="sm" c="dimmed">Sign in to review and manage plans.</Text>
        </Box>
      </Group>
      {props.errorMessage ? <Alert color="red">{props.errorMessage}</Alert> : null}
      <TextInput label="Email" value={props.login.email} onChange={(event) => props.setLogin({ ...props.login, email: event.target.value })} />
      <PasswordInput label="Password" value={props.login.password} onChange={(event) => props.setLogin({ ...props.login, password: event.target.value })} />
      <Button variant="gradient" leftSection={<LogIn size={16} />} onClick={props.onLogin}>Sign in</Button>
    </Stack>
  );
}
