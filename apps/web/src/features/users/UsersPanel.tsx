import { Alert, Badge, Button, Group, Paper, PasswordInput, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { Info, UserPlus } from "lucide-react";
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
      <Alert icon={<Info size={16} />} title="What users can do">
        <Text size="sm">
          Users are local accounts for the hosted dashboard. Admins manage users and tokens, reviewers approve or reject plans, and regular users can author or inspect plan work according to server permissions.
        </Text>
      </Alert>
      {props.isAdmin ? (
        <Paper withBorder radius="md" p="md" data-testid="create-user-form">
          <Group align="end" grow>
            <TextInput label="Email" placeholder="agent-user@example.com" value={props.form.email} onChange={(event) => props.setForm({ ...props.form, email: event.target.value })} />
            <TextInput label="Name" placeholder="Display name" value={props.form.name} onChange={(event) => props.setForm({ ...props.form, name: event.target.value })} />
            <PasswordInput label="Temporary password" value={props.form.password} onChange={(event) => props.setForm({ ...props.form, password: event.target.value })} />
            <Select
              label="Role"
              description="Admin manages the system. Reviewer gates execution. User authors and views work."
              data={["admin", "user", "reviewer"]}
              value={props.form.role}
              onChange={(value) => props.setForm({ ...props.form, role: value ?? "user" })}
            />
            <Button variant="gradient" leftSection={<UserPlus size={16} />} aria-label="Create user account" onClick={props.onCreate}>Create user</Button>
          </Group>
        </Paper>
      ) : null}
      <PageSection>
        {props.users.length === 0 ? (
          <EmptyState title="No users visible" description="Accounts available to your role will appear here." />
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>User account</Table.Th>
                  <Table.Th>Roles and permissions</Table.Th>
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
                        {user.roles.map((role) => <Badge key={role} size="sm" variant="light" title={roleDescription(role)}>{role}</Badge>)}
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

function roleDescription(role: string): string {
  if (role === "admin") {
    return "Admin: can manage users and administer the hosted dashboard.";
  }
  if (role === "reviewer") {
    return "Reviewer: can approve, reject, or request review for plans.";
  }
  return "User: can author and inspect plan work allowed by server permissions.";
}
