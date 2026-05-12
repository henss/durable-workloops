import { useState } from "react";
import { useDisclosure } from "@mantine/hooks";
import type { DashboardTab } from "../../types.js";
import type { PlanDetailRecord } from "../../types.js";
import { bucketPlans } from "../../plans.js";
import { DashboardShell } from "../dashboard/DashboardShell.js";
import { PlanDetailModal, type PlanDetailTab } from "../plans/PlanDetail.js";
import { demoArchive, demoAudit, demoPlans, demoSession, demoTokens, demoUsers } from "./demoData.js";

export function DemoDashboard({
  initialTab,
  initialDetailPlanId,
  initialDetailTab,
}: {
  initialTab: DashboardTab;
  initialDetailPlanId?: string;
  initialDetailTab?: PlanDetailTab;
}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [detail, setDetail] = useState<PlanDetailRecord | null>(() => createDemoDetail(initialDetailPlanId));
  const [opened, modal] = useDisclosure(Boolean(initialDetailPlanId && createDemoDetail(initialDetailPlanId)));
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
  const [newPlanDraft, setNewPlanDraft] = useState("");
  const [newPlanApprovalRequired, setNewPlanApprovalRequired] = useState(true);

  function showDetail(planId: string) {
    const nextDetail = createDemoDetail(planId);
    if (!nextDetail) {
      return;
    }
    setDetail(nextDetail);
    modal.open();
  }

  return (
    <>
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
        newPlanDraft={newPlanDraft}
        setNewPlanDraft={setNewPlanDraft}
        newPlanApprovalRequired={newPlanApprovalRequired}
        setNewPlanApprovalRequired={setNewPlanApprovalRequired}
        planSubmitError={null}
        isSubmittingPlan={false}
        onRefresh={() => undefined}
        onSignOut={() => undefined}
        onDetail={showDetail}
        onApprove={() => undefined}
        onReject={() => undefined}
        onRequestReview={() => undefined}
        onCreateUser={() => undefined}
        onCreateToken={() => undefined}
        onSubmitPlan={() => undefined}
      />
      <PlanDetailModal opened={opened} onClose={modal.close} detail={detail} initialTab={initialDetailTab} />
    </>
  );
}

function createDemoDetail(planId?: string): PlanDetailRecord | null {
  if (!planId) {
    return null;
  }
  const plan = [...demoPlans, ...demoArchive].find((candidate) => candidate.id === planId);
  return plan ? { plan, audit: demoAudit.filter((event) => event.planId === planId) } : null;
}
