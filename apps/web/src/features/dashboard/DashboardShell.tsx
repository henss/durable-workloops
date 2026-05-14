import type React from "react";
import {
  AppShell,
  Avatar,
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
import { CheckCircle2, ChevronDown, Clock3, ListChecks, Lock, LogOut, RefreshCw } from "lucide-react";
import type { CreatedClientToken, PlanRecord, PublicClientToken, User } from "@agent-workloops/api";
import { ColorSchemeControl } from "../../components/ColorSchemeControl.js";
import { MetricCard } from "../../components/MetricCard.js";
import { PageSection } from "../../components/PageSection.js";
import { appBackground, appCssVariables, shellPanelBackground, subtleBorder, themeTokens } from "../../components/themeSurfaces.js";
import { PlanLifecycleHelp } from "./PlanLifecycleHelp.js";
import { PlanTable } from "../plans/PlanTable.js";
import { NewPlanPanel } from "../plans/NewPlanPanel.js";
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
  isRefreshing: boolean;
  isAdmin: boolean;
  isReviewer: boolean;
  userForm: { email: string; password: string; name: string; role: string };
  setUserForm: (form: { email: string; password: string; name: string; role: string }) => void;
  tokenForm: { name: string; scopes: string[] };
  setTokenForm: (form: { name: string; scopes: string[] }) => void;
  newPlanDraft: string;
  setNewPlanDraft: (draft: string) => void;
  newPlanApprovalRequired: boolean;
  setNewPlanApprovalRequired: (value: boolean) => void;
  planSubmitError: string | null;
  isSubmittingPlan: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
  onDetail: (planId: string) => void;
  onApprove: (planId: string) => void;
  onReject: (planId: string) => void;
  onRequestReview: (planId: string) => void;
  onCreateUser: () => void;
  onCreateToken: () => void;
  onSubmitPlan: () => void;
}) {
  const computedColorScheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const tokens = themeTokens(computedColorScheme);
  const tabs = getDashboardTabs({
    pending: props.buckets.pending.length,
    claimable: props.buckets.claimable.length,
    locked: props.buckets.locked.length,
    archive: props.archive.length,
    "new-plan": 0,
    users: props.users.length,
    tokens: props.tokens.length,
  });
  const activeTabInfo = tabs.find((tab) => tab.value === props.activeTab);

  return (
    <AppShell
      header={{ height: 68 }}
      navbar={{ width: 280, breakpoint: "sm" }}
      padding={0}
      bg={appBackground(computedColorScheme)}
      style={appCssVariables(computedColorScheme)}
    >
      <AppShell.Header
        className="aw-header"
        px="lg"
        bg={shellPanelBackground(computedColorScheme)}
        style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}
      >
        <Group h="100%" justify="space-between">
          <Group gap="sm">
            <ThemeIcon className="aw-app-icon" size={42} radius="lg" variant="gradient" gradient={{ from: "brand.6", to: "aqua.5", deg: 135 }}>
              <ListChecks size={20} />
            </ThemeIcon>
            <Box>
                <Title order={1} size="h3" fw={780}>Agent Workloops</Title>
              <Text size="xs" c={tokens.textMuted} opacity={0.78}>Manage agent plans from approval through execution and archive.</Text>
            </Box>
          </Group>
          <Group gap="xs">
            <ColorSchemeControl compact />
            <Text size="xs" c={tokens.textMuted}>Last refreshed: {formatLastRefreshed(props.lastRefreshedAt)}</Text>
            <Button
              variant="light"
              color="brand"
              leftSection={<RefreshCw className="aw-refresh-icon" data-refreshing={props.isRefreshing} size={16} />}
              disabled={props.isRefreshing}
              onClick={props.onRefresh}
              aria-label="Refresh plans, users, and tokens"
            >
              Refresh
            </Button>
            <Menu position="bottom-end" width={240}>
              <Menu.Target>
                <Button
                  variant="default"
                  rightSection={<ChevronDown size={14} />}
                  leftSection={<Avatar size={22} radius="xl" color="brand">{props.session.user.email.slice(0, 1).toUpperCase()}</Avatar>}
                  styles={{ root: { background: tokens.surfaceElevated, borderColor: tokens.border } }}
                >
                  <Text size="xs" fw={700} maw={120} truncate>{props.session.user.email}</Text>
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

      <AppShell.Navbar className="aw-sidebar" p="md" bg={shellPanelBackground(computedColorScheme)} style={{ borderRight: `1px solid ${tokens.borderSubtle}` }}>
        <Stack gap="md" h="100%">
          <Box p="sm" style={{ border: subtleBorder(computedColorScheme), borderRadius: "var(--mantine-radius-lg)", background: tokens.surfaceElevated, boxShadow: tokens.shadowSoft }}>
            <Group gap="sm" wrap="nowrap">
              <Avatar size={34} radius="xl" color="brand">{props.session.user.email.slice(0, 1).toUpperCase()}</Avatar>
              <Box miw={0}>
                <Text size="xs" tt="uppercase" fw={800} c={tokens.textMuted} style={{ letterSpacing: "0.06em" }}>Signed in</Text>
                <Text size="sm" fw={700} truncate>{props.session.user.email}</Text>
                <Text size="xs" c={tokens.textMuted} truncate>{props.session.user.roles.join(", ")}</Text>
              </Box>
            </Group>
          </Box>
          <Divider color={tokens.borderSubtle} />
          <Stack gap="xs">
            <SidebarGroup label="Queues">
              {tabs.filter((tab) => isQueueTab(tab.value)).map((tab) => (
                <DashboardNavLink key={tab.value} tab={tab} activeTab={props.activeTab} onSelect={props.setActiveTab} />
              ))}
            </SidebarGroup>
            <SidebarGroup label="Authoring">
              {tabs.filter((tab) => tab.value === "new-plan").map((tab) => (
                <DashboardNavLink key={tab.value} tab={tab} activeTab={props.activeTab} onSelect={props.setActiveTab} />
              ))}
            </SidebarGroup>
            <SidebarGroup label="Administration">
              {tabs.filter((tab) => !isQueueTab(tab.value) && tab.value !== "new-plan").map((tab) => (
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

      <AppShell.Main className="aw-main">
        <Container size={1680} px={{ base: "md", sm: "xl" }} py="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-end">
              <Box>
                <Title order={2} size="30px" fw={760} lh={1.12}>{activeTabInfo?.heading}</Title>
                <Text size="sm" c={tokens.textMuted}>{activeTabInfo?.description}</Text>
              </Box>
            </Group>

            {isQueueTab(props.activeTab) ? (
              <>
                <PlanLifecycleHelp activeTab={props.activeTab} />
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                  <MetricCard
                    label="Pending approval"
                    value={props.buckets.pending.length}
                    microcopy={props.buckets.pending.length === 0 ? "No plans waiting for review" : "Needs human review"}
                    icon={<Clock3 size={18} />}
                    color="yellow"
                    active={props.activeTab === "pending"}
                    ariaLabel="Show pending approval queue: plans waiting for human review"
                    dataTestId="queue-metric-pending"
                    onClick={() => props.setActiveTab("pending")}
                  />
                  <MetricCard
                    label="Ready to Claim"
                    value={props.buckets.claimable.length}
                    microcopy={props.buckets.claimable.length === 0 ? "No executor work ready" : "Available to executors"}
                    icon={<CheckCircle2 size={18} />}
                    color="aqua"
                    active={props.activeTab === "claimable"}
                    ariaLabel="Show ready to claim queue: approved or approval-free plans available to executors"
                    dataTestId="queue-metric-claimable"
                    onClick={() => props.setActiveTab("claimable")}
                  />
                  <MetricCard
                    label="Locked / running"
                    value={props.buckets.locked.length}
                    microcopy={props.buckets.locked.length === 0 ? "No executor leases" : "Executor lease held"}
                    icon={<Lock size={18} />}
                    color="brand"
                    active={props.activeTab === "locked"}
                    ariaLabel="Show locked and running queue: plans claimed by executors"
                    dataTestId="queue-metric-locked"
                    onClick={() => props.setActiveTab("locked")}
                  />
                </SimpleGrid>
              </>
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
    <Stack gap={6}>
      <Text size="xs" tt="uppercase" fw={800} c="dimmed" style={{ letterSpacing: "0.06em" }}>{props.label}</Text>
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
      className="aw-nav-link"
      data-active={props.activeTab === props.tab.value}
      data-testid={`nav-${props.tab.value}`}
      active={props.activeTab === props.tab.value}
      disabled={props.disabled}
      label={
        <Box>
          <Text size="sm" fw={720}>{props.tab.label}</Text>
          <Text size="xs" c="dimmed">{props.tab.sidebarHelp}</Text>
        </Box>
      }
      leftSection={props.tab.icon}
      rightSection={props.tab.showCount ? <Badge className="aw-count-badge" size="xs" variant="light">{props.tab.count}</Badge> : undefined}
      aria-label={props.tab.ariaLabel}
      title={props.tab.ariaLabel}
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
          queueLabel="Pending approval plans"
          dataTestId="queue-pending-plans"
          plans={props.buckets.pending}
          onDetail={props.onDetail}
          onApprove={props.isReviewer ? props.onApprove : undefined}
          onReject={props.isReviewer ? props.onReject : undefined}
          emptyTitle="No plans are waiting for approval"
          emptyDescription="Plans that require human review appear here before executors can claim them."
          emptyCheckedAt={props.lastRefreshedAt}
          emptyLinks={[{ label: "Create a new plan", onClick: () => props.setActiveTab("new-plan") }]}
          onRefresh={props.onRefresh}
        />
      </PageSection>
    );
  }
  if (props.activeTab === "claimable") {
    return (
      <PageSection>
        <PlanTable
          queueLabel="Ready to Claim plans"
          dataTestId="queue-claimable-plans"
          plans={props.buckets.claimable}
          onDetail={props.onDetail}
          onReject={props.isReviewer ? props.onReject : undefined}
          onRequestReview={props.isReviewer ? props.onRequestReview : undefined}
          emptyTitle="No Ready to Claim plans"
          emptyDescription="Approved or approval-free plans appear here when executors can claim them."
          emptyCheckedAt={props.lastRefreshedAt}
          emptyLinks={[{ label: "Create a new plan", onClick: () => props.setActiveTab("new-plan") }]}
          onRefresh={props.onRefresh}
        />
      </PageSection>
    );
  }
  if (props.activeTab === "locked") {
    return (
      <PageSection>
        <PlanTable
          queueLabel="Locked and running plans"
          dataTestId="queue-locked-plans"
          plans={props.buckets.locked}
          onDetail={props.onDetail}
          emptyTitle="No executors are currently running plans"
          emptyDescription="When a client executor claims a plan, its lease appears here until release or completion."
          emptyCheckedAt={props.lastRefreshedAt}
          onRefresh={props.onRefresh}
        />
      </PageSection>
    );
  }
  if (props.activeTab === "archive") {
    return (
      <PageSection>
        <PlanTable
          queueLabel="Completed archived plans"
          dataTestId="queue-archive-plans"
          plans={props.archive}
          onDetail={props.onDetail}
          emptyTitle="No completed plans yet"
          emptyDescription="Plans move here after an executor completes a WorkLoop whose status is done."
          emptyCheckedAt={props.lastRefreshedAt}
          onRefresh={props.onRefresh}
        />
      </PageSection>
    );
  }
  if (props.activeTab === "new-plan") {
    return (
      <NewPlanPanel
        draft={props.newPlanDraft}
        approvalRequired={props.newPlanApprovalRequired}
        errorMessage={props.planSubmitError}
        isSubmitting={props.isSubmittingPlan}
        onDraftChange={props.setNewPlanDraft}
        onApprovalRequiredChange={props.setNewPlanApprovalRequired}
        onSubmit={props.onSubmitPlan}
      />
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
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(value)
    : "not yet";
}
