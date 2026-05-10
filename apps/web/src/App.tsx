import { useEffect, useMemo, useState } from "react";
import { Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { AuthSetupStatus, CreatedClientToken, PlanRecord, PublicClientToken, User } from "@agent-workloops/api";
import { api } from "./api/client.js";
import { AuthShell } from "./features/auth/AuthShell.js";
import { LoginForm } from "./features/auth/LoginForm.js";
import { SetupRequired } from "./features/auth/SetupRequired.js";
import { DashboardShell } from "./features/dashboard/DashboardShell.js";
import { PlanDetail } from "./features/plans/PlanDetail.js";
import { bucketPlans } from "./plans.js";
import type { DashboardTab, PlanDetailRecord, Session } from "./types.js";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [archive, setArchive] = useState<PlanRecord[]>([]);
  const [detail, setDetail] = useState<PlanDetailRecord | null>(null);
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

  async function signOut() {
    await api("/api/v1/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    setSession(null);
    setPlans([]);
    setArchive([]);
    setDetail(null);
    setUsers([]);
    setTokens([]);
    setCreatedToken(null);
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
    setDetail(await api<PlanDetailRecord>(`/api/v1/plans/${planId}`));
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
      <AuthShell>
        <Text c="dimmed">Checking server setup...</Text>
      </AuthShell>
    );
  }

  if (!setupStatus.usersExist) {
    return (
      <AuthShell size="sm">
        <SetupRequired
          form={bootstrapForm}
          setForm={setBootstrapForm}
          onCreate={bootstrapAdmin}
          bootstrapConfigured={setupStatus.bootstrapConfigured}
          errorMessage={errorMessage}
        />
      </AuthShell>
    );
  }

  if (!session) {
    return (
      <AuthShell>
        <LoginForm login={login} setLogin={setLogin} errorMessage={errorMessage} onLogin={doLogin} />
      </AuthShell>
    );
  }

  return (
    <>
      <DashboardShell
        session={session}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        buckets={buckets}
        archive={archive}
        users={users}
        tokens={tokens}
        createdToken={createdToken}
        isAdmin={isAdmin}
        isReviewer={isReviewer}
        userForm={userForm}
        setUserForm={setUserForm}
        tokenForm={tokenForm}
        setTokenForm={setTokenForm}
        onRefresh={refresh}
        onSignOut={signOut}
        onDetail={showDetail}
        onApprove={approve}
        onReject={reject}
        onCreateUser={createUser}
        onCreateToken={createToken}
      />
      <Modal opened={opened} onClose={modal.close} size="xl" title={detail?.plan.workLoop.objective ?? "Plan detail"}>
        {detail ? <PlanDetail detail={detail} /> : null}
      </Modal>
    </>
  );
}
