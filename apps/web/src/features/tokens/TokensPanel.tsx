import { Alert, Badge, Button, Code, Group, MultiSelect, Paper, Stack, Table, Text, TextInput, ThemeIcon } from "@mantine/core";
import { Info, KeyRound, ShieldCheck } from "lucide-react";
import type { CreatedClientToken, PublicClientToken } from "@agent-workloops/api";
import { EmptyState } from "../../components/EmptyState.js";
import { PageSection } from "../../components/PageSection.js";

export function TokensPanel(props: {
  tokens: PublicClientToken[];
  form: { name: string; scopes: string[] };
  setForm: (form: { name: string; scopes: string[] }) => void;
  onCreate: () => void;
  createdToken: CreatedClientToken | null;
}) {
  const serverUrl = import.meta.env.VITE_AWL_SERVER_URL ?? window.location.origin;

  return (
    <Stack>
      <Alert icon={<Info size={16} />} title="Using tokens with the CLI" variant="light">
        <Stack gap="xs">
          <Text size="sm">
            Mint a token, save the shown-once value, then put it in a local .env file or pass it with --token.
          </Text>
          <Code block>
            # .env{"\n"}
            AWL_SERVER={serverUrl}{"\n"}
            AWL_TOKEN=awl_client_...{"\n\n"}
            agent-workloops submit --file examples/workloop.json{"\n"}
            agent-workloops run-codex --workspace /path/to/repo{"\n\n"}
            agent-workloops submit --server {serverUrl} --token awl_client_... --file examples/workloop.json
          </Code>
          <Text size="sm" c="dimmed">
            Use plans:submit for submitting plans. Use plans:claim and plans:complete for executor clients that claim, heartbeat, and complete plans.
          </Text>
        </Stack>
      </Alert>
      <Paper withBorder radius="md" p="md">
        <Group align="end" grow>
          <TextInput label="Name" value={props.form.name} onChange={(event) => props.setForm({ ...props.form, name: event.target.value })} />
          <MultiSelect label="Scopes" data={["plans:submit", "plans:claim", "plans:complete"]} value={props.form.scopes} onChange={(scopes) => props.setForm({ ...props.form, scopes })} />
          <Button variant="gradient" leftSection={<KeyRound size={16} />} onClick={props.onCreate}>Mint token</Button>
        </Group>
      </Paper>
      {props.createdToken ? (
        <Alert color="green" title="Token created">
          <Text size="sm" mb="xs">Save this value now. It will not be shown again.</Text>
          <Code block>{props.createdToken.token}</Code>
        </Alert>
      ) : null}
      <PageSection>
        {props.tokens.length === 0 ? (
          <EmptyState title="No client tokens" description="Mint a token when a CLI or executor client needs API access." />
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Token</Table.Th>
                  <Table.Th>Scopes</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {props.tokens.map((token) => (
                  <Table.Tr key={token.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <ThemeIcon variant="light" size="sm"><ShieldCheck size={14} /></ThemeIcon>
                        <Text fw={600}>{token.name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {token.scopes.map((scope) => <Badge key={scope} size="sm" variant="light">{scope}</Badge>)}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={token.revokedAt ? "red" : "green"} variant="light">
                        {token.revokedAt ? "revoked" : "active"}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </PageSection>
    </Stack>
  );
}
