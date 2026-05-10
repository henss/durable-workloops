import "@mantine/core/styles.css";
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AppShell,
  Badge,
  Button,
  Code,
  Container,
  Divider,
  Group,
  JsonInput,
  MantineProvider,
  Modal,
  MultiSelect,
  NavLink,
  PasswordInput,
  ScrollArea,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Check, KeyRound, LogIn, RefreshCw, ShieldCheck, UserPlus, X } from "lucide-react";
import type { AuditEvent, CreatedClientToken, PlanRecord, PublicClientToken, User } from "@agent-workloops/api";
import { bucketPlans } from "./plans.js";
import "./styles.css";

type Session = { user: User };
type Detail = { plan: PlanRecord; audit: AuditEvent[] };

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [archive, setArchive] = useState<PlanRecord[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [tokens, setTokens] = useState<PublicClientToken[]>([]);
  const [createdToken, setCreatedToken] = useState<CreatedClientToken | null>(null);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [userForm, setUserForm] = useState({ email: "", password: "", name: "", role: "user" });
  const [tokenForm, setTokenForm] = useState({ name: "", scopes: ["plans:claim", "plans:complete"] });
  const [opened, modal] = useDisclosure(false);
  const buckets = useMemo(() => bucketPlans(plans), [plans]);
  const isAdmin = session?.user.roles.includes("admin") ?? false;
  const isReviewer = isAdmin || (session?.user.roles.includes("reviewer") ?? false);

  async function refresh() {
    const me = await api<Session>("/api/v1/auth/me").catch(() => null);
    setSession(me);
    if (!me) {
      return;
    }
    setPlans(await api<PlanRecord[]>("/api/v1/plans"));
    if (me.user.roles.includes("admin") || me.user.roles.includes("reviewer")) {
      setArchive(await api<PlanRecord[]>("/api/v1/plans/archive"));
    }
    setTokens(await api<PublicClientToken[]>("/api/v1/tokens"));
    if (me.user.roles.includes("admin")) {
      setUsers(await api<User[]>("/api/v1/users"));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function doLogin() {
    await api("/api/v1/auth/login", { method: "POST", body: login });
    await refresh();
  }

  async function showDetail(planId: string) {
    setDetail(await api<Detail>(`/api/v1/plans/${planId}`));
    modal.open();
  }

  async function approve(planId: string) {
    await api(`/api/v1/plans/${planId}/approve`, { method: "POST", body: {} });
    await refresh();
  }

  async function reject(planId: string) {
    await api(`/api/v1/plans/${planId}/reject`, { method: "POST", body: {} });
    await refresh();
  }

  async function createUser() {
    await api("/api/v1/users", {
      method: "POST",
      body: {
        email: userForm.email,
        password: userForm.password,
        name: userForm.name || undefined,
        roles: [userForm.role],
      },
    });
    setUserForm({ email: "", password: "", name: "", role: "user" });
    await refresh();
  }

  async function createToken() {
    const token = await api<CreatedClientToken>("/api/v1/tokens", {
      method: "POST",
      body: { name: tokenForm.name, scopes: tokenForm.scopes },
    });
    setCreatedToken(token);
    setTokenForm({ name: "", scopes: ["plans:claim", "plans:complete"] });
    await refresh();
  }

  if (!session) {
    return (
      <MantineProvider defaultColorScheme="light">
        <Container size="xs" className="login">
          <Stack gap="md">
            <Title order={1}>Agent Workloops</Title>
            <TextInput label="Email" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} />
            <PasswordInput label="Password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} />
            <Button leftSection={<LogIn size={16} />} onClick={doLogin}>Sign in</Button>
          </Stack>
        </Container>
      </MantineProvider>
    );
  }

  return (
    <MantineProvider defaultColorScheme="light">
      <AppShell navbar={{ width: 240, breakpoint: "sm" }} padding="md">
        <AppShell.Navbar p="sm">
          <Title order={3}>Agent Workloops</Title>
          <Text size="sm" c="dimmed">{session.user.email}</Text>
          <Divider my="md" />
          <NavLink label="Queue" active />
          <NavLink label="Archive" />
          <NavLink label="Users" disabled={!isAdmin} />
          <NavLink label="Client tokens" />
        </AppShell.Navbar>
        <AppShell.Main>
          <Stack gap="lg">
            <Group justify="space-between">
              <Title order={2}>Workloop queue</Title>
              <Button variant="light" leftSection={<RefreshCw size={16} />} onClick={refresh}>Refresh</Button>
            </Group>
            <Tabs defaultValue="pending">
              <Tabs.List>
                <Tabs.Tab value="pending">Pending approval</Tabs.Tab>
                <Tabs.Tab value="claimable">Claimable</Tabs.Tab>
                <Tabs.Tab value="locked">Locked</Tabs.Tab>
                <Tabs.Tab value="archive">Archive</Tabs.Tab>
                <Tabs.Tab value="users">Users</Tabs.Tab>
                <Tabs.Tab value="tokens">Tokens</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="pending" pt="md">
                <PlanTable plans={buckets.pending} onDetail={showDetail} onApprove={isReviewer ? approve : undefined} onReject={isReviewer ? reject : undefined} />
              </Tabs.Panel>
              <Tabs.Panel value="claimable" pt="md">
                <PlanTable plans={buckets.claimable} onDetail={showDetail} />
              </Tabs.Panel>
              <Tabs.Panel value="locked" pt="md">
                <PlanTable plans={buckets.locked} onDetail={showDetail} />
              </Tabs.Panel>
              <Tabs.Panel value="archive" pt="md">
                <PlanTable plans={archive} onDetail={showDetail} />
              </Tabs.Panel>
              <Tabs.Panel value="users" pt="md">
                <UsersPanel isAdmin={isAdmin} users={users} form={userForm} setForm={setUserForm} onCreate={createUser} />
              </Tabs.Panel>
              <Tabs.Panel value="tokens" pt="md">
                <TokensPanel tokens={tokens} form={tokenForm} setForm={setTokenForm} onCreate={createToken} createdToken={createdToken} />
              </Tabs.Panel>
            </Tabs>
          </Stack>
        </AppShell.Main>
      </AppShell>
      <Modal opened={opened} onClose={modal.close} size="xl" title={detail?.plan.workLoop.objective ?? "Plan detail"}>
        {detail ? <PlanDetail detail={detail} /> : null}
      </Modal>
    </MantineProvider>
  );
}

function PlanTable(props: {
  plans: PlanRecord[];
  onDetail: (planId: string) => void;
  onApprove?: (planId: string) => void;
  onReject?: (planId: string) => void;
}) {
  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Plan</Table.Th>
          <Table.Th>Project</Table.Th>
          <Table.Th>Approval</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>Updated</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {props.plans.map((plan) => (
          <Table.Tr key={plan.id}>
            <Table.Td>
              <Text fw={600}>{plan.workLoop.objective}</Text>
              <Text size="xs" c="dimmed">{plan.id}</Text>
            </Table.Td>
            <Table.Td>{plan.workLoop.projectId}</Table.Td>
            <Table.Td><Badge variant="light">{plan.approvalStatus}</Badge></Table.Td>
            <Table.Td><Badge>{plan.status}</Badge></Table.Td>
            <Table.Td>{new Date(plan.updatedAt).toLocaleString()}</Table.Td>
            <Table.Td>
              <Group gap="xs" justify="flex-end">
                {props.onApprove ? <Button size="xs" leftSection={<Check size={14} />} onClick={() => props.onApprove?.(plan.id)}>Approve</Button> : null}
                {props.onReject ? <Button size="xs" variant="outline" color="red" leftSection={<X size={14} />} onClick={() => props.onReject?.(plan.id)}>Reject</Button> : null}
                <Button size="xs" variant="light" onClick={() => props.onDetail(plan.id)}>Open</Button>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function PlanDetail({ detail }: { detail: Detail }) {
  return (
    <Stack>
      <Group>
        <Badge>{detail.plan.status}</Badge>
        <Badge variant="light">{detail.plan.approvalStatus}</Badge>
      </Group>
      <JsonInput autosize minRows={12} value={JSON.stringify(detail.plan.workLoop, null, 2)} readOnly />
      <Title order={4}>Audit</Title>
      <ScrollArea h={180}>
        <Stack gap="xs">
          {detail.audit.map((event) => (
            <Code key={event.id} block>{JSON.stringify(event, null, 2)}</Code>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

function UsersPanel(props: {
  isAdmin: boolean;
  users: User[];
  form: { email: string; password: string; name: string; role: string };
  setForm: (form: { email: string; password: string; name: string; role: string }) => void;
  onCreate: () => void;
}) {
  return (
    <Stack>
      {props.isAdmin ? (
        <Group align="end">
          <TextInput label="Email" value={props.form.email} onChange={(event) => props.setForm({ ...props.form, email: event.target.value })} />
          <TextInput label="Name" value={props.form.name} onChange={(event) => props.setForm({ ...props.form, name: event.target.value })} />
          <PasswordInput label="Password" value={props.form.password} onChange={(event) => props.setForm({ ...props.form, password: event.target.value })} />
          <Select label="Role" data={["admin", "user", "reviewer"]} value={props.form.role} onChange={(value) => props.setForm({ ...props.form, role: value ?? "user" })} />
          <Button leftSection={<UserPlus size={16} />} onClick={props.onCreate}>Create</Button>
        </Group>
      ) : null}
      <Table>
        <Table.Tbody>
          {props.users.map((user) => (
            <Table.Tr key={user.id}>
              <Table.Td>{user.email}</Table.Td>
              <Table.Td>{user.roles.join(", ")}</Table.Td>
              <Table.Td>{new Date(user.createdAt).toLocaleString()}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function TokensPanel(props: {
  tokens: PublicClientToken[];
  form: { name: string; scopes: string[] };
  setForm: (form: { name: string; scopes: string[] }) => void;
  onCreate: () => void;
  createdToken: CreatedClientToken | null;
}) {
  return (
    <Stack>
      <Group align="end">
        <TextInput label="Name" value={props.form.name} onChange={(event) => props.setForm({ ...props.form, name: event.target.value })} />
        <MultiSelect label="Scopes" data={["plans:submit", "plans:claim", "plans:complete"]} value={props.form.scopes} onChange={(scopes) => props.setForm({ ...props.form, scopes })} />
        <Button leftSection={<KeyRound size={16} />} onClick={props.onCreate}>Mint token</Button>
      </Group>
      {props.createdToken ? <Code block>{props.createdToken.token}</Code> : null}
      <Table>
        <Table.Tbody>
          {props.tokens.map((token) => (
            <Table.Tr key={token.id}>
              <Table.Td><ShieldCheck size={16} /> {token.name}</Table.Td>
              <Table.Td>{token.scopes.join(", ")}</Table.Td>
              <Table.Td>{token.revokedAt ? "revoked" : "active"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? "GET",
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
