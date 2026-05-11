import { useState } from "react";
import type { DashboardTab } from "../../types.js";
import { bucketPlans } from "../../plans.js";
import { DashboardShell } from "../dashboard/DashboardShell.js";
import { demoArchive, demoPlans, demoSession, demoTokens, demoUsers } from "./demoData.js";

export function DemoDashboard({ initialTab }: { initialTab: DashboardTab }) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [userForm, setUserForm] = useState({
    email: "new-user@example.com",
    password: "",
    name: "New User",
    role: "user",
  });
  const [tokenForm, setTokenForm] = useState({
    name: "Temporary executor",
    scopes: ["plans:claim", "plans:complete"],
  });

  return (
    <DashboardShell
      session={demoSession}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      buckets={bucketPlans(demoPlans)}
      archive={demoArchive}
      users={demoUsers}
      tokens={demoTokens}
      createdToken={null}
      lastRefreshedAt={new Date("2026-05-11T16:30:00.000Z")}
      isRefreshing={false}
      isAdmin
      isReviewer
      userForm={userForm}
      setUserForm={setUserForm}
      tokenForm={tokenForm}
      setTokenForm={setTokenForm}
      onRefresh={() => undefined}
      onSignOut={() => undefined}
      onDetail={() => undefined}
      onApprove={() => undefined}
      onReject={() => undefined}
      onRequestReview={() => undefined}
      onCreateUser={() => undefined}
      onCreateToken={() => undefined}
    />
  );
}
