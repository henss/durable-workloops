import { Badge, Button, Group, Paper, PasswordInput, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { UserPlus } from "lucide-react";
import type { User } from "@agent-workloops/api";
import { EmptyState } from "../../components/EmptyState.js";
import { PageSection } from "../../components/PageSection.js";

export function UsersPanel(props: {
  isAdmin: boolean;
  users: User[];
  form: { email: string; password: string; name: string; role: string };
  setForm: (form: { email: string; password: string; name: string; role: string }) => void;
  onCreate: () => void;
}) {
  return (
    <Stack>
      {props.isAdmin ? (
        <Paper withBorder radius="md" p="md">
          <Group align="end" grow>
            <TextInput label="Email" value={props.form.email} onChange={(event) => props.setForm({ ...props.form, email: event.target.value })} />
            <TextInput label="Name" value={props.form.name} onChange={(event) => props.setForm({ ...props.form, name: event.target.value })} />
            <PasswordInput label="Password" value={props.form.password} onChange={(event) => props.setForm({ ...props.form, password: event.target.value })} />
            <Select label="Role" data={["admin", "user", "reviewer"]} value={props.form.role} onChange={(value) => props.setForm({ ...props.form, role: value ?? "user" })} />
            <Button leftSection={<UserPlus size={16} />} onClick={props.onCreate}>Create</Button>
          </Group>
        </Paper>
      ) : null}
      <PageSection>
        {props.users.length === 0 ? (
          <EmptyState label="No users are visible for this account." />
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Roles</Table.Th>
                  <Table.Th>Created</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {props.users.map((user) => (
                  <Table.Tr key={user.id}>
                    <Table.Td>
                      <Text fw={600}>{user.email}</Text>
                      {user.name ? <Text size="xs" c="dimmed">{user.name}</Text> : null}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {user.roles.map((role) => <Badge key={role} size="sm" variant="light">{role}</Badge>)}
                      </Group>
                    </Table.Td>
                    <Table.Td>{new Date(user.createdAt).toLocaleString()}</Table.Td>
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
