import type React from "react";
import {
  AppShell,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Group,
  Menu,
  NavLink,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  useComputedColorScheme,
} from "@mantine/core";
import { CheckCircle2, ChevronDown, Clock3, ListChecks, Lock, LogOut, RefreshCw, UserCircle } from "lucide-react";
import type { CreatedClientToken, PlanRecord, PublicClientToken, User } from "@agent-workloops/api";
import { ColorSchemeControl } from "../../components/ColorSchemeControl.js";
import { MetricCard } from "../../components/MetricCard.js";
import { PageSection } from "../../components/PageSection.js";
import { appBackground, shellPanelBackground, subtleBorder } from "../../components/themeSurfaces.js";
import { PlanTable } from "../plans/PlanTable.js";
import { TokensPanel } from "../tokens/TokensPanel.js";
import { UsersPanel } from "../users/UsersPanel.js";
import { getDashboardTabs } from "./dashboardTabs.js";
import type { DashboardTab, Session } from "../../types.js";

export function DashboardShell(props: {
  session: Session;
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  buckets: { pending: PlanRecord[]; claimable: PlanRecord[]; locked: PlanRecord[] };
  archive: PlanRecord[];
  users: User[];
  tokens: PublicClientToken[];
  createdToken: CreatedClientToken | null;
  lastRefreshedAt: Date | null;
  isAdmin: boolean;
  isReviewer: boolean;
  userForm: { email: string; password: string; name: string; role: string };
  setUserForm: (form: { email: string; password: string; name: string; role: string }) => void;
  tokenForm: { name: string; scopes: string[] };
  setTokenForm: (form: { name: string; scopes: string[] }) => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onDetail: (planId: string) => void;
  onApprove: (planId: string) => void;
  onReject: (planId: string) => void;
  onCreateUser: () => void;
  onCreateToken: () => void;
}) {
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const tabs = getDashboardTabs({
    pending: props.buckets.pending.length,
    claimable: props.buckets.claimable.length,
    locked: props.buckets.locked.length,
    archive: props.archive.length,
    users: props.users.length,
    tokens: props.tokens.length,
  });

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 280, breakpoint: "sm" }}
      padding={0}
      bg={appBackground(computedColorScheme)}
    >
      <AppShell.Header px="lg" bg={shellPanelBackground(computedColorScheme)} style={{ borderBottom: subtleBorder(computedColorScheme), backdropFilter: "blur(14px)" }}>
        <Group h="100%" justify="space-between">
          <Group gap="sm">
            <ThemeIcon size="lg" radius="md" variant="gradient">
              <ListChecks size={20} />
            </ThemeIcon>
            <Box>
              <Title order={1} size="h3">Agent Workloops</Title>
              <Text size="xs" c="dimmed">Hosted approval and execution queue</Text>
            </Box>
          </Group>
          <Group gap="xs">
            <ColorSchemeControl compact />
            <Text size="xs" c="dimmed">Last refreshed: {formatLastRefreshed(props.lastRefreshedAt)}</Text>
            <Button variant="default" leftSection={<RefreshCw size={16} />} onClick={props.onRefresh}>Refresh</Button>
            <Menu position="bottom-end" width={240}>
              <Menu.Target>
                <Button variant="subtle" color="slate" rightSection={<ChevronDown size={14} />} leftSection={<UserCircle size={16} />}>
                  Account
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{props.session.user.email}</Menu.Label>
                <Menu.Item c="red" leftSection={<LogOut size={14} />} onClick={props.onSignOut}>Sign out</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" bg={shellPanelBackground(computedColorScheme)} style={{ borderRight: subtleBorder(computedColorScheme), backdropFilter: "blur(14px)" }}>
        <Stack gap="md" h="100%">
          <Box>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">Signed in</Text>
            <Text size="sm" fw={600} truncate>{props.session.user.email}</Text>
            <Text size="xs" c="dimmed" mt={4}>{props.session.user.roles.join(", ")}</Text>
          </Box>
          <Divider />
          <Stack gap="xs">
            <SidebarGroup label="Queues">
              {tabs.filter((tab) => isQueueTab(tab.value)).map((tab) => (
                <DashboardNavLink key={tab.value} tab={tab} activeTab={props.activeTab} onSelect={props.setActiveTab} />
              ))}
            </SidebarGroup>
            <SidebarGroup label="Administration">
              {tabs.filter((tab) => !isQueueTab(tab.value)).map((tab) => (
                <DashboardNavLink
                  key={tab.value}
                  tab={tab}
                  activeTab={props.activeTab}
                  disabled={tab.value === "users" && !props.isAdmin}
                  onSelect={props.setActiveTab}
                />
              ))}
            </SidebarGroup>
          </Stack>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Container size={1440} px={{ base: "md", sm: "xl" }} py="lg">
          <Stack gap="lg">
            <Group justify="space-between" align="flex-end">
              <Box>
                <Title order={2}>{tabs.find((tab) => tab.value === props.activeTab)?.heading}</Title>
                <Text size="sm" c="dimmed">{tabs.find((tab) => tab.value === props.activeTab)?.description}</Text>
              </Box>
            </Group>

            {isQueueTab(props.activeTab) ? (
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <MetricCard label="Pending approval" value={props.buckets.pending.length} icon={<Clock3 size={18} />} color="yellow" />
                <MetricCard label="Claimable" value={props.buckets.claimable.length} icon={<CheckCircle2 size={18} />} color="aqua" />
                <MetricCard label="Locked" value={props.buckets.locked.length} icon={<Lock size={18} />} color="brand" />
              </SimpleGrid>
            ) : null}

            {renderDashboardContent(props)}
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

type DashboardTabInfo = ReturnType<typeof getDashboardTabs>[number];

function SidebarGroup(props: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap={4}>
      <Text size="xs" tt="uppercase" fw={700} c="dimmed">{props.label}</Text>
      {props.children}
    </Stack>
  );
}

function DashboardNavLink(props: {
  tab: DashboardTabInfo;
  activeTab: DashboardTab;
  disabled?: boolean;
  onSelect: (tab: DashboardTab) => void;
}) {
  return (
    <NavLink
      active={props.activeTab === props.tab.value}
      disabled={props.disabled}
      label={props.tab.label}
      leftSection={props.tab.icon}
      rightSection={<Badge size="xs" variant="light">{props.tab.count}</Badge>}
      onClick={() => props.onSelect(props.tab.value)}
      variant="light"
    />
  );
}

function renderDashboardContent(props: Parameters<typeof DashboardShell>[0]) {
  if (props.activeTab === "pending") {
    return (
      <PageSection>
        <PlanTable
          plans={props.buckets.pending}
          onDetail={props.onDetail}
          onApprove={props.isReviewer ? props.onApprove : undefined}
          onReject={props.isReviewer ? props.onReject : undefined}
          emptyTitle="No pending approvals"
          emptyDescription="Plans that need review will appear here."
          onRefresh={props.onRefresh}
        />
      </PageSection>
    );
  }
  if (props.activeTab === "claimable") {
    return (
      <PageSection>
        <PlanTable
          plans={props.buckets.claimable}
          onDetail={props.onDetail}
          emptyTitle="No claimable plans"
          emptyDescription="Approved or ungated plans ready for executors will appear here."
          onRefresh={props.onRefresh}
        />
      </PageSection>
    );
  }
  if (props.activeTab === "locked") {
    return (
      <PageSection>
        <PlanTable
          plans={props.buckets.locked}
          onDetail={props.onDetail}
          emptyTitle="No locked plans"
          emptyDescription="Plans currently leased by executors will appear here."
          onRefresh={props.onRefresh}
        />
      </PageSection>
    );
  }
  if (props.activeTab === "archive") {
    return (
      <PageSection>
        <PlanTable
          plans={props.archive}
          onDetail={props.onDetail}
          emptyTitle="No completed plans"
          emptyDescription="Executor completions are archived here."
          onRefresh={props.onRefresh}
        />
      </PageSection>
    );
  }
  if (props.activeTab === "users") {
    return <UsersPanel isAdmin={props.isAdmin} users={props.users} form={props.userForm} setForm={props.setUserForm} onCreate={props.onCreateUser} />;
  }
  return <TokensPanel tokens={props.tokens} form={props.tokenForm} setForm={props.setTokenForm} onCreate={props.onCreateToken} createdToken={props.createdToken} />;
}

function isQueueTab(tab: DashboardTab): boolean {
  return tab === "pending" || tab === "claimable" || tab === "locked" || tab === "archive";
}

function formatLastRefreshed(value: Date | null): string {
  return value ? value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "not yet";
}
