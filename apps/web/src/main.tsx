import "@mantine/core/styles.css";
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  AppShell,
  Badge,
  Box,
  Button,
  Center,
  Code,
  Container,
  Divider,
  Group,
  JsonInput,
  MantineProvider,
  Modal,
  MultiSelect,
  NavLink,
  Paper,
  PasswordInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  Archive,
  Check,
  CheckCircle2,
  Clock3,
  Info,
  KeyRound,
  ListChecks,
  Lock,
  LogIn,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import type {
  AuditEvent,
  AuthSetupStatus,
  CreatedClientToken,
  PlanRecord,
  PublicClientToken,
  User,
} from "@agent-workloops/api";
import { bucketPlans } from "./plans.js";

type Session = { user: User };
type Detail = { plan: PlanRecord; audit: AuditEvent[] };
type DashboardTab = "pending" | "claimable" | "locked" | "archive" | "users" | "tokens";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [archive, setArchive] = useState<PlanRecord[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [tokens, setTokens] = useState<PublicClientToken[]>([]);
  const [createdToken, setCreatedToken] = useState<CreatedClientToken | null>(null);
  const [setupStatus, setSetupStatus] = useState<AuthSetupStatus | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("pending");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [bootstrapForm, setBootstrapForm] = useState({ email: "", password: "", name: "" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ email: "", password: "", name: "", role: "user" });
  const [tokenForm, setTokenForm] = useState({ name: "", scopes: ["plans:claim", "plans:complete"] });
  const [opened, modal] = useDisclosure(false);
  const buckets = useMemo(() => bucketPlans(plans), [plans]);
  const isAdmin = session?.user.roles.includes("admin") ?? false;
  const isReviewer = isAdmin || (session?.user.roles.includes("reviewer") ?? false);

  async function refresh() {
    const setup = await api<AuthSetupStatus>("/api/v1/auth/setup").catch(() => null);
    setSetupStatus(setup);
    if (setup && !setup.usersExist) {
      setSession(null);
      return;
    }
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
    try {
      setErrorMessage(null);
      await api("/api/v1/auth/login", { method: "POST", body: login });
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function bootstrapAdmin() {
    try {
      setErrorMessage(null);
      await api("/api/v1/auth/bootstrap", {
        method: "POST",
        body: {
          email: bootstrapForm.email,
          password: bootstrapForm.password,
          name: bootstrapForm.name || undefined,
          roles: ["admin"],
        },
      });
      await api("/api/v1/auth/login", {
        method: "POST",
        body: { email: bootstrapForm.email, password: bootstrapForm.password },
      });
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
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

  if (!setupStatus) {
    return (
      <MantineProvider defaultColorScheme="light">
        <AuthShell>
          <Text c="dimmed">Checking server setup...</Text>
        </AuthShell>
      </MantineProvider>
    );
  }

  if (!setupStatus.usersExist) {
    return (
      <MantineProvider defaultColorScheme="light">
        <AuthShell size="sm">
          <SetupRequired
            form={bootstrapForm}
            setForm={setBootstrapForm}
            onCreate={bootstrapAdmin}
            bootstrapConfigured={setupStatus.bootstrapConfigured}
            errorMessage={errorMessage}
          />
        </AuthShell>
      </MantineProvider>
    );
  }

  if (!session) {
    return (
      <MantineProvider defaultColorScheme="light">
        <AuthShell>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" variant="light">
                <ListChecks size={20} />
              </ThemeIcon>
              <Box>
                <Title order={1} size="h2">Agent Workloops</Title>
                <Text size="sm" c="dimmed">Sign in to review and manage plans.</Text>
              </Box>
            </Group>
            {errorMessage ? <Alert color="red">{errorMessage}</Alert> : null}
            <TextInput label="Email" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} />
            <PasswordInput label="Password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} />
            <Button leftSection={<LogIn size={16} />} onClick={doLogin}>Sign in</Button>
          </Stack>
        </AuthShell>
      </MantineProvider>
    );
  }

  const tabs = getDashboardTabs({
    pending: buckets.pending.length,
    claimable: buckets.claimable.length,
    locked: buckets.locked.length,
    archive: archive.length,
    users: users.length,
    tokens: tokens.length,
  });

  return (
    <MantineProvider defaultColorScheme="light">
      <AppShell
        header={{ height: 64 }}
        navbar={{ width: 280, breakpoint: "sm" }}
        padding="lg"
        bg="gray.0"
      >
        <AppShell.Header px="lg">
          <Group h="100%" justify="space-between">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" variant="light">
                <ListChecks size={20} />
              </ThemeIcon>
              <Box>
                <Title order={1} size="h3">Agent Workloops</Title>
                <Text size="xs" c="dimmed">Hosted approval and execution queue</Text>
              </Box>
            </Group>
            <Button variant="light" leftSection={<RefreshCw size={16} />} onClick={refresh}>Refresh</Button>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <Stack gap="md" h="100%">
            <Box>
              <Text size="xs" tt="uppercase" fw={700} c="dimmed">Signed in</Text>
              <Text size="sm" fw={600} truncate>{session.user.email}</Text>
              <Group gap={4} mt={6}>
                {session.user.roles.map((role) => (
                  <Badge key={role} size="xs" variant="light">{role}</Badge>
                ))}
              </Group>
            </Box>
            <Divider />
            <Stack gap={4}>
              {tabs.map((tab) => (
                <NavLink
                  key={tab.value}
                  active={activeTab === tab.value}
                  disabled={tab.value === "users" && !isAdmin}
                  label={tab.label}
                  leftSection={tab.icon}
                  rightSection={<Badge size="xs" variant={activeTab === tab.value ? "filled" : "light"}>{tab.count}</Badge>}
                  onClick={() => setActiveTab(tab.value)}
                  variant="light"
                />
              ))}
            </Stack>
          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          <Stack gap="lg">
            <Group justify="space-between" align="flex-end">
              <Box>
                <Title order={2}>{tabs.find((tab) => tab.value === activeTab)?.heading}</Title>
                <Text size="sm" c="dimmed">{tabs.find((tab) => tab.value === activeTab)?.description}</Text>
              </Box>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <MetricCard label="Pending approval" value={buckets.pending.length} icon={<Clock3 size={18} />} color="yellow" />
              <MetricCard label="Claimable" value={buckets.claimable.length} icon={<CheckCircle2 size={18} />} color="green" />
              <MetricCard label="Locked" value={buckets.locked.length} icon={<Lock size={18} />} color="blue" />
            </SimpleGrid>

            <Tabs value={activeTab} onChange={(value) => setActiveTab((value ?? "pending") as DashboardTab)} keepMounted={false}>
              <Tabs.List>
                {tabs.map((tab) => (
                  <Tabs.Tab key={tab.value} value={tab.value} disabled={tab.value === "users" && !isAdmin}>
                    <Group gap={8}>
                      <Text size="sm">{tab.label}</Text>
                      <Badge size="xs" variant="light">{tab.count}</Badge>
                    </Group>
                  </Tabs.Tab>
                ))}
              </Tabs.List>

              <Tabs.Panel value="pending" pt="md">
                <PageSection>
                  <PlanTable plans={buckets.pending} onDetail={showDetail} onApprove={isReviewer ? approve : undefined} onReject={isReviewer ? reject : undefined} emptyLabel="No plans are waiting for approval." />
                </PageSection>
              </Tabs.Panel>
              <Tabs.Panel value="claimable" pt="md">
                <PageSection>
                  <PlanTable plans={buckets.claimable} onDetail={showDetail} emptyLabel="No approved plans are ready to claim." />
                </PageSection>
              </Tabs.Panel>
              <Tabs.Panel value="locked" pt="md">
                <PageSection>
                  <PlanTable plans={buckets.locked} onDetail={showDetail} emptyLabel="No plans are currently locked by executors." />
                </PageSection>
              </Tabs.Panel>
              <Tabs.Panel value="archive" pt="md">
                <PageSection>
                  <PlanTable plans={archive} onDetail={showDetail} emptyLabel="No completed plans are archived yet." />
                </PageSection>
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

function AuthShell(props: { children: React.ReactNode; size?: "xs" | "sm" }) {
  return (
    <Box bg="gray.0" mih="100vh">
      <Center mih="100vh" p="lg">
        <Container size={props.size ?? "xs"} w="100%">
          <Paper withBorder radius="md" p="xl" shadow="sm">
            {props.children}
          </Paper>
        </Container>
      </Center>
    </Box>
  );
}

function SetupRequired(props: {
  form: { email: string; password: string; name: string };
  setForm: (form: { email: string; password: string; name: string }) => void;
  onCreate: () => void;
  bootstrapConfigured: boolean;
  errorMessage: string | null;
}) {
  return (
    <Stack gap="md">
      <Group gap="sm">
        <ThemeIcon size="lg" radius="md" variant="light" color="yellow">
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
      <Button leftSection={<UserPlus size={16} />} onClick={props.onCreate}>Create first admin</Button>
    </Stack>
  );
}

function MetricCard(props: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between">
        <Box>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">{props.label}</Text>
          <Text size="xl" fw={700}>{props.value}</Text>
        </Box>
        <ThemeIcon variant="light" color={props.color} radius="md" size="lg">
          {props.icon}
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

function PageSection(props: { children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p={0} shadow="xs">
      {props.children}
    </Paper>
  );
}

function PlanTable(props: {
  plans: PlanRecord[];
  onDetail: (planId: string) => void;
  onApprove?: (planId: string) => void;
  onReject?: (planId: string) => void;
  emptyLabel: string;
}) {
  if (props.plans.length === 0) {
    return <EmptyState label={props.emptyLabel} />;
  }

  return (
    <Table.ScrollContainer minWidth={980}>
      <Table highlightOnHover verticalSpacing="sm">
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
              <Table.Td maw={760}>
                <Text fw={650} lineClamp={2}>{plan.workLoop.objective}</Text>
                <Text size="xs" c="dimmed" ff="monospace">{plan.id}</Text>
              </Table.Td>
              <Table.Td>
                <Code>{plan.workLoop.projectId}</Code>
              </Table.Td>
              <Table.Td><ApprovalBadge plan={plan} /></Table.Td>
              <Table.Td><StatusBadge plan={plan} /></Table.Td>
              <Table.Td>
                <Text size="sm">{new Date(plan.updatedAt).toLocaleString()}</Text>
              </Table.Td>
              <Table.Td>
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  {props.onApprove ? <Button size="xs" leftSection={<Check size={14} />} onClick={() => props.onApprove?.(plan.id)}>Approve</Button> : null}
                  {props.onReject ? <Button size="xs" variant="light" color="red" leftSection={<X size={14} />} onClick={() => props.onReject?.(plan.id)}>Reject</Button> : null}
                  <Button size="xs" variant="default" onClick={() => props.onDetail(plan.id)}>Open</Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function PlanDetail({ detail }: { detail: Detail }) {
  return (
    <Stack>
      <Group>
        <StatusBadge plan={detail.plan} />
        <ApprovalBadge plan={detail.plan} />
        <Code>{detail.plan.workLoop.projectId}</Code>
      </Group>
      <JsonInput autosize minRows={12} value={JSON.stringify(detail.plan.workLoop, null, 2)} readOnly />
      <Title order={4}>Audit trail</Title>
      <ScrollArea h={220}>
        <Stack gap="xs">
          {detail.audit.length === 0 ? <Text size="sm" c="dimmed">No audit events recorded.</Text> : null}
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

function TokensPanel(props: {
  tokens: PublicClientToken[];
  form: { name: string; scopes: string[] };
  setForm: (form: { name: string; scopes: string[] }) => void;
  onCreate: () => void;
  createdToken: CreatedClientToken | null;
}) {
  return (
    <Stack>
      <Alert icon={<Info size={16} />} title="Using tokens with the CLI" variant="light">
        <Stack gap="xs">
          <Text size="sm">
            Mint a token, save the shown-once value, then put it in a local .env file or pass it with --token.
          </Text>
          <Code block>
            # .env{"\n"}
            AWL_SERVER=http://127.0.0.1:3210{"\n"}
            AWL_TOKEN=awl_client_...{"\n\n"}
            agent-workloops submit --file examples/workloop.json{"\n"}
            agent-workloops run-codex --workspace /path/to/repo{"\n\n"}
            agent-workloops submit --server http://127.0.0.1:3210 --token awl_client_... --file examples/workloop.json
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
          <Button leftSection={<KeyRound size={16} />} onClick={props.onCreate}>Mint token</Button>
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
          <EmptyState label="No client tokens have been minted yet." />
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

function EmptyState({ label }: { label: string }) {
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

function StatusBadge({ plan }: { plan: PlanRecord }) {
  const color = plan.status === "completed" ? "green" : plan.status === "locked" ? "blue" : plan.status === "canceled" ? "red" : "gray";
  return <Badge color={color} variant="light">{plan.status}</Badge>;
}

function ApprovalBadge({ plan }: { plan: PlanRecord }) {
  const color =
    plan.approvalStatus === "approved"
      ? "green"
      : plan.approvalStatus === "pending"
        ? "yellow"
        : plan.approvalStatus === "rejected"
          ? "red"
          : "gray";
  return <Badge color={color} variant="light">{plan.approvalStatus.replace("_", " ")}</Badge>;
}

function getDashboardTabs(counts: Record<DashboardTab, number>) {
  return [
    { value: "pending", label: "Pending", heading: "Pending approval", description: "Plans waiting for a reviewer decision.", count: counts.pending, icon: <Clock3 size={16} /> },
    { value: "claimable", label: "Claimable", heading: "Claimable plans", description: "Approved or ungated plans available to executor clients.", count: counts.claimable, icon: <CheckCircle2 size={16} /> },
    { value: "locked", label: "Locked", heading: "Locked plans", description: "Plans currently leased by a client executor.", count: counts.locked, icon: <Lock size={16} /> },
    { value: "archive", label: "Archive", heading: "Completed archive", description: "Plans completed by executor clients.", count: counts.archive, icon: <Archive size={16} /> },
    { value: "users", label: "Users", heading: "Users", description: "Local accounts and roles.", count: counts.users, icon: <UsersRound size={16} /> },
    { value: "tokens", label: "Tokens", heading: "Client tokens", description: "Bearer tokens for CLI and executor clients.", count: counts.tokens, icon: <KeyRound size={16} /> },
  ] as const;
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
