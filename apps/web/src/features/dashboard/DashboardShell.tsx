import {
  AppShell,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  NavLink,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  useComputedColorScheme,
} from "@mantine/core";
import { CheckCircle2, Clock3, ListChecks, Lock, LogOut, RefreshCw } from "lucide-react";
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
      header={{ height: 72 }}
      navbar={{ width: 280, breakpoint: "sm" }}
      padding="lg"
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
            <ColorSchemeControl />
            <Button variant="light" leftSection={<RefreshCw size={16} />} onClick={props.onRefresh}>Refresh</Button>
            <Button variant="default" leftSection={<LogOut size={16} />} onClick={props.onSignOut}>Sign out</Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" bg={shellPanelBackground(computedColorScheme)} style={{ borderRight: subtleBorder(computedColorScheme), backdropFilter: "blur(14px)" }}>
        <Stack gap="md" h="100%">
          <Box>
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">Signed in</Text>
            <Text size="sm" fw={600} truncate>{props.session.user.email}</Text>
            <Group gap={4} mt={6}>
              {props.session.user.roles.map((role) => (
                <Badge key={role} size="xs" variant="light">{role}</Badge>
              ))}
            </Group>
          </Box>
          <Divider />
          <Stack gap={4}>
            {tabs.map((tab) => (
              <NavLink
                key={tab.value}
                active={props.activeTab === tab.value}
                disabled={tab.value === "users" && !props.isAdmin}
                label={tab.label}
                leftSection={tab.icon}
                rightSection={<Badge size="xs" variant={props.activeTab === tab.value ? "filled" : "light"}>{tab.count}</Badge>}
                onClick={() => props.setActiveTab(tab.value)}
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
              <Title order={2}>{tabs.find((tab) => tab.value === props.activeTab)?.heading}</Title>
              <Text size="sm" c="dimmed">{tabs.find((tab) => tab.value === props.activeTab)?.description}</Text>
            </Box>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <MetricCard label="Pending approval" value={props.buckets.pending.length} icon={<Clock3 size={18} />} color="yellow" />
            <MetricCard label="Claimable" value={props.buckets.claimable.length} icon={<CheckCircle2 size={18} />} color="aqua" />
            <MetricCard label="Locked" value={props.buckets.locked.length} icon={<Lock size={18} />} color="brand" />
          </SimpleGrid>

          <Tabs value={props.activeTab} onChange={(value) => props.setActiveTab((value ?? "pending") as DashboardTab)} keepMounted={false}>
            <Tabs.List>
              {tabs.map((tab) => (
                <Tabs.Tab key={tab.value} value={tab.value} disabled={tab.value === "users" && !props.isAdmin}>
                  <Group gap={8}>
                    <Text size="sm">{tab.label}</Text>
                    <Badge size="xs" variant="light">{tab.count}</Badge>
                  </Group>
                </Tabs.Tab>
              ))}
            </Tabs.List>

            <Tabs.Panel value="pending" pt="md">
              <PageSection>
                <PlanTable plans={props.buckets.pending} onDetail={props.onDetail} onApprove={props.isReviewer ? props.onApprove : undefined} onReject={props.isReviewer ? props.onReject : undefined} emptyLabel="No plans are waiting for approval." />
              </PageSection>
            </Tabs.Panel>
            <Tabs.Panel value="claimable" pt="md">
              <PageSection>
                <PlanTable plans={props.buckets.claimable} onDetail={props.onDetail} emptyLabel="No approved plans are ready to claim." />
              </PageSection>
            </Tabs.Panel>
            <Tabs.Panel value="locked" pt="md">
              <PageSection>
                <PlanTable plans={props.buckets.locked} onDetail={props.onDetail} emptyLabel="No plans are currently locked by executors." />
              </PageSection>
            </Tabs.Panel>
            <Tabs.Panel value="archive" pt="md">
              <PageSection>
                <PlanTable plans={props.archive} onDetail={props.onDetail} emptyLabel="No completed plans are archived yet." />
              </PageSection>
            </Tabs.Panel>
            <Tabs.Panel value="users" pt="md">
              <UsersPanel isAdmin={props.isAdmin} users={props.users} form={props.userForm} setForm={props.setUserForm} onCreate={props.onCreateUser} />
            </Tabs.Panel>
            <Tabs.Panel value="tokens" pt="md">
              <TokensPanel tokens={props.tokens} form={props.tokenForm} setForm={props.setTokenForm} onCreate={props.onCreateToken} createdToken={props.createdToken} />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
