import type { AuditEvent, PlanRecord, PublicClientToken, User, WorkLoop } from "@agent-workloops/api";

const now = "2026-05-11T16:30:00.000Z";
type WorkLoopSlice = WorkLoop["slices"][number];

export const demoSession = {
  user: {
    id: "user-reviewer",
    email: "reviewer@example.com",
    name: "Demo Reviewer",
    roles: ["admin", "reviewer"],
    createdAt: "2026-05-01T09:00:00.000Z",
    updatedAt: now,
  },
} satisfies { user: User };

export const demoUsers: User[] = [
  demoSession.user,
  {
    id: "user-executor",
    email: "executor@example.com",
    name: "Executor Client Owner",
    roles: ["user"],
    createdAt: "2026-05-02T09:00:00.000Z",
    updatedAt: now,
  },
  {
    id: "user-observer",
    email: "observer@example.com",
    name: "Read Only Reviewer",
    roles: ["reviewer"],
    createdAt: "2026-05-03T09:00:00.000Z",
    updatedAt: now,
  },
];

export const demoTokens: PublicClientToken[] = [
  {
    id: "token-cli",
    name: "Local CLI executor",
    scopes: ["plans:claim", "plans:complete"],
    createdAt: "2026-05-04T09:00:00.000Z",
    lastUsedAt: "2026-05-11T16:20:00.000Z",
  },
  {
    id: "token-submit",
    name: "Plan submitter",
    scopes: ["plans:submit"],
    createdAt: "2026-05-04T10:00:00.000Z",
    expiresAt: "2026-06-04T10:00:00.000Z",
  },
];

export const demoPlans: PlanRecord[] = [
  createPlan({
    id: "plan-ui-review",
    objective: "Refresh the hosted workloops dashboard for screenshot-backed UI review.",
    projectId: "demo-web",
    approvalStatus: "pending",
    status: "queued",
    updatedAt: "2026-05-11T16:25:00.000Z",
    slices: [
      createSlice({ id: "slice-capture", title: "Capture light and dark screenshots", status: "done", attemptCount: 1 }),
      createSlice({
        id: "slice-review",
        title: "Review visual hierarchy and empty states",
        status: "reviewing",
        attemptCount: 1,
      }),
      createSlice({
        id: "slice-apply",
        title: "Apply focused Mantine theme improvements",
        status: "ready",
        dependsOn: ["slice-review"],
      }),
    ],
  }),
  createPlan({
    id: "plan-release-docs",
    objective: "Prepare public README assets for the hosted approval queue workflow.",
    projectId: "demo-docs",
    approvalStatus: "approved",
    status: "queued",
    updatedAt: "2026-05-11T15:10:00.000Z",
    slices: [
      createSlice({ id: "slice-fixtures", title: "Create synthetic screenshot fixtures", status: "done", attemptCount: 1 }),
      createSlice({ id: "slice-readme", title: "Embed selected screenshots in README", status: "ready" }),
    ],
  }),
  createPlan({
    id: "plan-boundary-check",
    objective: "Review a proposed public boundary change before executors continue.",
    projectId: "demo-policy",
    approvalStatus: "pending",
    status: "queued",
    updatedAt: "2026-05-11T14:40:00.000Z",
    slices: [
      createSlice({ id: "slice-scan", title: "Scan generated evidence for private data", status: "done", attemptCount: 1 }),
      createSlice({ id: "slice-decision", title: "Approve or reject publication boundary", status: "ready" }),
    ],
  }),
  createPlan({
    id: "plan-runner",
    objective: "Execute the next workloop slice with lease heartbeat protection.",
    projectId: "demo-runner",
    approvalStatus: "not_required",
    status: "locked",
    updatedAt: "2026-05-11T16:12:00.000Z",
    lock: {
      leaseId: "lease-demo",
      clientTokenId: "token-cli",
      lockedAt: "2026-05-11T16:00:00.000Z",
      expiresAt: "2026-05-11T16:45:00.000Z",
    },
    slices: [
      createSlice({ id: "slice-resume", title: "Resume active execution context", status: "running", attemptCount: 2 }),
      createSlice({ id: "slice-record", title: "Record completion outcome", status: "ready", dependsOn: ["slice-resume"] }),
    ],
  }),
];

export const demoArchive: PlanRecord[] = [
  createPlan({
    id: "plan-complete",
    objective: "Ship the initial hosted queue with plan approval and token management.",
    projectId: "demo-platform",
    approvalStatus: "approved",
    status: "completed",
    updatedAt: "2026-05-10T18:00:00.000Z",
    completion: {
      completedAt: "2026-05-10T18:00:00.000Z",
      completedByTokenId: "token-cli",
      metadata: { outcome: "completed", tests: "passed" },
    },
    slices: [
      createSlice({ id: "slice-api", title: "Expose plan approval API", status: "done", attemptCount: 1 }),
      createSlice({ id: "slice-ui", title: "Render hosted dashboard", status: "done", attemptCount: 1 }),
      createSlice({ id: "slice-tests", title: "Cover core queue states", status: "done", attemptCount: 1 }),
    ],
  }),
];

export const demoAudit: AuditEvent[] = [
  {
    id: "audit-submit-ui-review",
    planId: "plan-ui-review",
    actorUserId: "user-reviewer",
    type: "submit",
    createdAt: "2026-05-11T16:21:00.000Z",
    metadata: { source: "demo", slices: 3 },
  },
  {
    id: "audit-review-request-ui-review",
    planId: "plan-ui-review",
    actorUserId: "user-reviewer",
    type: "request_review",
    createdAt: "2026-05-11T16:24:00.000Z",
    metadata: { reason: "Screenshots ready for approval" },
  },
  {
    id: "audit-submit-release-docs",
    planId: "plan-release-docs",
    actorUserId: "user-reviewer",
    type: "submit",
    createdAt: "2026-05-11T15:04:00.000Z",
    metadata: { source: "demo" },
  },
  {
    id: "audit-approve-release-docs",
    planId: "plan-release-docs",
    actorUserId: "user-reviewer",
    type: "approve",
    createdAt: "2026-05-11T15:09:00.000Z",
    metadata: { reason: "Public-safe synthetic assets" },
  },
  {
    id: "audit-complete-plan-complete",
    planId: "plan-complete",
    actorTokenId: "token-cli",
    type: "complete",
    createdAt: "2026-05-10T18:00:00.000Z",
    metadata: { outcome: "completed", tests: "passed" },
  },
];

type PlanInput = Pick<PlanRecord, "id" | "approvalStatus" | "status" | "updatedAt" | "lock" | "completion"> & {
  objective: string;
  projectId: string;
  slices: WorkLoop["slices"];
};

function createPlan(input: PlanInput): PlanRecord {
  return {
    id: input.id,
    workLoop: {
      id: `wl-${input.id}`,
      projectId: input.projectId,
      source: "demo-fixture",
      status: input.status === "completed" ? "done" : "active",
      objective: input.objective,
      successCriteria: [
        "Screenshots show realistic queue density.",
        "Reviewer actions and executor state are visible without private data.",
        "Light and dark themes render from the same deterministic route.",
      ],
      slices: input.slices,
      completionPolicy: {
        defaultAction: "continue until the next slice is complete",
        stopOnlyFor: ["blocked", "needs maintainer input", "unsafe external effect"],
      },
      reviewPolicy: { required: true, repairOnReviewFailure: true },
      runawayGuard: { maxConsecutiveAgentRuns: 4, requireStefanAfter: "two failed repair attempts" },
    },
    approvalRequired: input.approvalStatus !== "not_required",
    approvalStatus: input.approvalStatus,
    status: input.status,
    lock: input.lock,
    completion: input.completion,
    submitterUserId: "user-reviewer",
    createdAt: "2026-05-11T09:00:00.000Z",
    updatedAt: input.updatedAt,
  };
}

function createSlice(input: Omit<WorkLoopSlice, "attemptCount" | "dependsOn"> & Partial<Pick<WorkLoopSlice, "attemptCount" | "dependsOn">>): WorkLoopSlice {
  return {
    ...input,
    attemptCount: input.attemptCount ?? 0,
    dependsOn: input.dependsOn ?? [],
  };
}
