import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import type { ServerConfig } from "./config.js";
import { InMemoryWorkItemAuditStore } from "./work-item-audit-store.js";
import type { ClientTokenScope } from "@agent-workloops/api";

const workLoop = {
  id: "loop-1",
  projectId: "project-1",
  source: "test",
  objective: "Run a hosted plan",
  successCriteria: ["Plan completes"],
  slices: [{ id: "slice-1", title: "Execute" }],
  completionPolicy: { defaultAction: "continue", stopOnlyFor: ["done"] },
};

describe("Agent Workloops server", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwl-server-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("reports whether first-run auth setup is complete", async () => {
    const app = await buildServer({
      config: { ...config(), bootstrapAdmin: undefined },
    });

    const before = await app.inject({
      method: "GET",
      url: "/api/v1/auth/setup",
    });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({ usersExist: false, bootstrapConfigured: false });

    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap",
      payload: { email: "admin@example.com", password: "password123", roles: ["admin"] },
    });
    expect(bootstrap.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: "/api/v1/auth/setup",
    });
    expect(after.json()).toEqual({ usersExist: true, bootstrapConfigured: false });
  });

  it("forces approval, supports manual approval, claim, heartbeat, and completion", async () => {
    const app = await buildServer({ config: config({ forceApprovalRequired: true }) });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@example.com", password: "password123" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies[0]?.value;
    expect(cookie).toBeTruthy();

    const tokenResponse = await app.inject({
      method: "POST",
      url: "/api/v1/tokens",
      cookies: { awl_session: cookie ?? "" },
      payload: {
        name: "executor",
        scopes: ["plans:submit", "plans:claim", "plans:complete"],
      },
    });
    expect(tokenResponse.statusCode).toBe(200);
    const token = tokenResponse.json<{ token: string }>().token;

    const submitted = await app.inject({
      method: "POST",
      url: "/api/v1/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: { workLoop, approvalRequired: false },
    });
    expect(submitted.statusCode).toBe(201);
    const planId = submitted.json<{ plan: { id: string; approvalStatus: string } }>().plan.id;
    expect(submitted.json<{ plan: { approvalStatus: string } }>().plan.approvalStatus).toBe("pending");

    const emptyClaim = await app.inject({
      method: "POST",
      url: "/api/v1/plans/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(emptyClaim.statusCode).toBe(200);
    expect(emptyClaim.json()).toEqual({});

    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${planId}/approve`,
      cookies: { awl_session: cookie ?? "" },
      payload: { reason: "Looks good" },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json<{ approvalStatus: string }>().approvalStatus).toBe("approved");

    const reviewRequested = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${planId}/request-review`,
      cookies: { awl_session: cookie ?? "" },
      payload: { reason: "Needs manual review" },
    });
    expect(reviewRequested.statusCode).toBe(200);
    expect(reviewRequested.json<{ approvalRequired: boolean; approvalStatus: string }>()).toMatchObject({
      approvalRequired: true,
      approvalStatus: "pending",
    });

    const claimAfterReviewRequest = await app.inject({
      method: "POST",
      url: "/api/v1/plans/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(claimAfterReviewRequest.statusCode).toBe(200);
    expect(claimAfterReviewRequest.json()).toEqual({});

    const approvedAgain = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${planId}/approve`,
      cookies: { awl_session: cookie ?? "" },
      payload: { reason: "Reviewed" },
    });
    expect(approvedAgain.statusCode).toBe(200);

    const claim = await app.inject({
      method: "POST",
      url: "/api/v1/plans/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(claim.statusCode).toBe(200);
    const leaseId = claim.json<{ leaseId: string }>().leaseId;
    expect(leaseId).toBeTruthy();

    const heartbeat = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${planId}/heartbeat`,
      headers: { authorization: `Bearer ${token}` },
      payload: { leaseId },
    });
    expect(heartbeat.statusCode).toBe(200);

    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${planId}/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        leaseId,
        workLoop: completeWorkLoop(workLoop),
        metadata: { exitCode: 0 },
      },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json<{ status: string }>().status).toBe("completed");

    const archive = await app.inject({
      method: "GET",
      url: "/api/v1/plans/archive",
      cookies: { awl_session: cookie ?? "" },
    });
    expect(archive.json<Array<{ id: string }>>()).toHaveLength(1);
  });

  it("reclaims expired locks", async () => {
    const app = await buildServer({ config: config({ lockTimeoutMs: 1 }) });
    const token = await createToken(app);
    const submitted = await app.inject({
      method: "POST",
      url: "/api/v1/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: { workLoop, approvalRequired: false },
    });
    expect(submitted.statusCode).toBe(201);
    const firstClaim = await app.inject({
      method: "POST",
      url: "/api/v1/plans/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const secondClaim = await app.inject({
      method: "POST",
      url: "/api/v1/plans/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(secondClaim.statusCode).toBe(200);
    expect(secondClaim.json<{ leaseId: string }>().leaseId).not.toBe(
      firstClaim.json<{ leaseId: string }>().leaseId,
    );
  });

  it("claims exact plans, records progress, releases non-terminal state, and guards completion", async () => {
    const app = await buildServer({ config: config() });
    const token = await createToken(app);
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: { workLoop: { ...workLoop, id: "loop-first" }, approvalRequired: false },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: { workLoop: { ...workLoop, id: "loop-second" }, approvalRequired: false },
    });
    const firstPlanId = first.json<{ plan: { id: string } }>().plan.id;
    const secondPlanId = second.json<{ plan: { id: string } }>().plan.id;

    const claim = await app.inject({
      method: "POST",
      url: "/api/v1/plans/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: { planId: secondPlanId },
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json<{ plan: { id: string } }>().plan.id).toBe(secondPlanId);
    const leaseId = claim.json<{ leaseId: string }>().leaseId;

    const activeWorkLoop = {
      ...workLoop,
      id: "loop-second",
      slices: [{ id: "slice-1", title: "Execute", status: "running" }],
    };
    const prematureComplete = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${secondPlanId}/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: { leaseId, workLoop: activeWorkLoop, metadata: { phase: "premature" } },
    });
    expect(prematureComplete.statusCode).toBe(400);

    const progress = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${secondPlanId}/progress`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        leaseId,
        workLoop: activeWorkLoop,
        decision: {
          action: "continue",
          reason: "Slice is running.",
          workLoopId: "loop-second",
          sliceId: "slice-1",
        },
        metadata: { phase: "slice-started" },
      },
    });
    expect(progress.statusCode).toBe(200);
    expect(progress.json<{ workLoop: { slices: Array<{ status: string }> } }>().workLoop.slices[0]?.status).toBe(
      "running",
    );

    const release = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${secondPlanId}/release`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        leaseId,
        workLoop: { ...activeWorkLoop, status: "blocked", slices: [{ id: "slice-1", title: "Execute", status: "blocked" }] },
        reason: "blocked",
        metadata: { phase: "blocked" },
      },
    });
    expect(release.statusCode).toBe(200);
    expect(release.json<{ status: string; lock?: unknown }>().status).toBe("blocked");
    expect(release.json<{ lock?: unknown }>().lock).toBeUndefined();

    const exactFirstClaim = await app.inject({
      method: "POST",
      url: "/api/v1/plans/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: { planId: firstPlanId },
    });
    expect(exactFirstClaim.statusCode).toBe(200);
    expect(exactFirstClaim.json<{ plan: { id: string } }>().plan.id).toBe(firstPlanId);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/plans/${secondPlanId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.json<{ audit: Array<{ type: string }> }>().audit.map((event) => event.type)).toEqual(
      expect.arrayContaining(["claim", "progress", "release"]),
    );
  });

  it("sets production session cookie attributes when configured", async () => {
    const app = await buildServer({
      config: config({ cookieSecure: true, sessionTtlMs: 60_000, trustProxy: true }),
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@example.com", password: "password123" },
    });

    expect(login.statusCode).toBe(200);
    const setCookie = login.headers["set-cookie"];
    expect(String(setCookie)).toContain("HttpOnly");
    expect(String(setCookie)).toContain("Secure");
    expect(String(setCookie)).toContain("SameSite=Lax");
    expect(String(setCookie)).toContain("Max-Age=60");
  });

  it("expires sessions after the configured TTL", async () => {
    const app = await buildServer({ config: config({ sessionTtlMs: 1 }) });
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "admin@example.com", password: "password123" },
    });
    const cookie = login.cookies[0]?.value;

    await new Promise((resolve) => setTimeout(resolve, 5));

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      cookies: { awl_session: cookie ?? "" },
    });
    expect(me.statusCode).toBe(401);
  });

  it("requires auth for work item mutation routes", async () => {
    const app = await buildServer({ config: config() });

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/work-items",
      payload: workItemInput(),
    });

    expect(created.statusCode).toBe(401);
  });

  it("records a redacted auth_rejected audit event when work item auth fails", async () => {
    const auditStore = new InMemoryWorkItemAuditStore();
    const app = await buildServer({ config: config(), workItemAuditStore: auditStore });

    const noAuth = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-no-auth/claim",
      payload: { claimant: "runner-x", lease_id: "lease-x" },
    });
    expect(noAuth.statusCode).toBe(401);

    const events = await auditStore.list({ eventTypes: ["auth_rejected"] });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const event = events[0]!;
    expect(event.event_type).toBe("auth_rejected");
    expect(event.work_item_id).toBe("wi-no-auth");
    expect(event.sanitized_reason).toBe("authentication required");

    // The audit event MUST NOT echo the request body or any caller-supplied
    // identifiers other than the URL-derived work_item_id.
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("runner-x");
    expect(serialized).not.toContain("lease-x");
  });

  it("records a redacted auth_rejected event when a client token is missing the required scope", async () => {
    const auditStore = new InMemoryWorkItemAuditStore();
    const app = await buildServer({ config: config(), workItemAuditStore: auditStore });
    const readOnlyToken = await createWorkItemToken(app, ["work_items:read"]);
    await createReadyWorkItem(app, await createWorkItemToken(app), "wi-scope-audit");

    const rejected = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-scope-audit/claim",
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: { claimant: "runner-z", lease_id: "lease-z" },
    });
    expect(rejected.statusCode).toBe(403);

    const events = await auditStore.list({ eventTypes: ["auth_rejected"] });
    const lastEvent = events[events.length - 1]!;
    expect(lastEvent.event_type).toBe("auth_rejected");
    expect(lastEvent.work_item_id).toBe("wi-scope-audit");
    expect(lastEvent.sanitized_reason).toBe("missing scope work_items:claim");
    expect(JSON.stringify(lastEvent)).not.toContain(readOnlyToken);
  });

  it("creates, lists, gets, claims, heartbeats, and completes a planning work item", async () => {
    const app = await buildServer({ config: config() });
    const token = await createWorkItemToken(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/work-items",
      headers: { authorization: `Bearer ${token}` },
      payload: workItemInput(),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<{ work_item: { status: string } }>().work_item.status).toBe("proposed");

    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/work-items",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listed.json<{ work_items: unknown[] }>().work_items).toHaveLength(1);

    const detail = await app.inject({
      method: "GET",
      url: "/api/v1/work-items/wi-example-1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);

    const ready = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-example-1/ready",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ready.json<{ work_item: { status: string } }>().work_item.status).toBe("ready");

    const claimed = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-example-1/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: { claimant: "runner-example", lease_id: "lease-example-1" },
    });
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json<{ work_item: { status: string } }>().work_item.status).toBe("claimed");

    const secondClaim = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-example-1/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: { claimant: "runner-other", lease_id: "lease-example-2" },
    });
    expect(secondClaim.statusCode).toBe(409);

    const heartbeat = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-example-1/heartbeat",
      headers: { authorization: `Bearer ${token}` },
      payload: { lease_id: "lease-example-1" },
    });
    expect(heartbeat.statusCode).toBe(200);

    const completed = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-example-1/complete",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        lease_id: "lease-example-1",
        outcome: {
          summary: "Synthetic planning completed.",
          completed_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
          artifact_refs: [],
          metadata: {},
        },
      },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json<{ work_item: { status: string } }>().work_item.status).toBe("completed");
  });

  it("releases stale work item leases", async () => {
    const app = await buildServer({ config: config({ lockTimeoutMs: 1 }) });
    const token = await createWorkItemToken(app);
    await createReadyWorkItem(app, token, "wi-stale");
    const claimed = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-stale/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: { claimant: "runner-example", lease_id: "lease-stale" },
    });
    expect(claimed.statusCode).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 5));

    const released = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-stale/release-stale",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(released.statusCode).toBe(200);
    expect(released.json<{ work_item: { status: string; lease: unknown } }>().work_item).toMatchObject({
      status: "ready",
      lease: null,
    });
  });

  it("requires completion output for work items", async () => {
    const app = await buildServer({ config: config() });
    const token = await createWorkItemToken(app);
    await createReadyWorkItem(app, token, "wi-output");
    await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-output/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: { claimant: "runner-example", lease_id: "lease-output" },
    });

    const completed = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-output/complete",
      headers: { authorization: `Bearer ${token}` },
      payload: { lease_id: "lease-output" },
    });

    expect(completed.statusCode).toBe(400);
  });

  it("rejects forbidden and approval-required work item classes", async () => {
    const app = await buildServer({ config: config() });
    const token = await createWorkItemToken(app);

    for (const jobClass of ["forbidden", "approval_required_write_action"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/work-items",
        headers: { authorization: `Bearer ${token}` },
        payload: workItemInput(`wi-${jobClass}`, jobClass),
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it("does not echo sensitive-looking request values in work item errors", async () => {
    const app = await buildServer({ config: config() });
    const token = await createWorkItemToken(app);
    const sensitiveLookingValue = `${"sk"}-${"a".repeat(24)}`;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/work-items",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...workItemInput("wi-sensitive-looking"), payload_ref: sensitiveLookingValue },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(sensitiveLookingValue);
  });

  it("requires work item read scope for client token list and detail reads", async () => {
    const app = await buildServer({ config: config() });
    const writer = await createWorkItemToken(app);
    const legacyToken = await createToken(app);
    await createReadyWorkItem(app, writer, "wi-read-scope");

    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/work-items",
      headers: { authorization: `Bearer ${legacyToken}` },
    });
    expect(listed.statusCode).toBe(403);

    const detail = await app.inject({
      method: "GET",
      url: "/api/v1/work-items/wi-read-scope",
      headers: { authorization: `Bearer ${legacyToken}` },
    });
    expect(detail.statusCode).toBe(403);
  });

  it("requires work item create scope for client token creation", async () => {
    const app = await buildServer({ config: config() });
    const readOnlyToken = await createWorkItemToken(app, ["work_items:read"]);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/work-items",
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: workItemInput("wi-create-scope"),
    });

    expect(created.statusCode).toBe(403);
  });

  it("requires work item claim, heartbeat, and complete scopes for lease lifecycle", async () => {
    const app = await buildServer({ config: config() });
    const writer = await createWorkItemToken(app);
    const readCreateOnly = await createWorkItemToken(app, ["work_items:read", "work_items:create", "work_items:transition"]);
    await createReadyWorkItem(app, writer, "wi-scope-lifecycle");

    const rejectedClaim = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-scope-lifecycle/claim",
      headers: { authorization: `Bearer ${readCreateOnly}` },
      payload: { claimant: "runner-example", lease_id: "lease-scope" },
    });
    expect(rejectedClaim.statusCode).toBe(403);

    const claimToken = await createWorkItemToken(app, ["work_items:claim"]);
    const claim = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-scope-lifecycle/claim",
      headers: { authorization: `Bearer ${claimToken}` },
      payload: { claimant: "runner-example", lease_id: "lease-scope" },
    });
    expect(claim.statusCode).toBe(200);

    const rejectedHeartbeat = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-scope-lifecycle/heartbeat",
      headers: { authorization: `Bearer ${claimToken}` },
      payload: { lease_id: "lease-scope" },
    });
    expect(rejectedHeartbeat.statusCode).toBe(403);

    const heartbeatToken = await createWorkItemToken(app, ["work_items:heartbeat"]);
    const heartbeat = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-scope-lifecycle/heartbeat",
      headers: { authorization: `Bearer ${heartbeatToken}` },
      payload: { lease_id: "lease-scope" },
    });
    expect(heartbeat.statusCode).toBe(200);

    const rejectedComplete = await app.inject({
      method: "POST",
      url: "/api/v1/work-items/wi-scope-lifecycle/complete",
      headers: { authorization: `Bearer ${heartbeatToken}` },
      payload: { lease_id: "lease-scope", no_output_reason: "Synthetic test ended without output." },
    });
    expect(rejectedComplete.statusCode).toBe(403);
  });

  function config(
    input: {
      forceApprovalRequired?: boolean;
      lockTimeoutMs?: number;
      cookieSecure?: boolean;
      sessionTtlMs?: number;
      trustProxy?: boolean;
    } = {},
  ): ServerConfig {
    return {
      host: "127.0.0.1",
      port: 3210,
      publicBaseUrl: "http://127.0.0.1:3210",
      trustProxy: input.trustProxy ?? false,
      dataDir,
      approval: { forceRequired: input.forceApprovalRequired ?? false },
      locks: { timeoutMs: input.lockTimeoutMs ?? 1000 },
      cookies: { secure: input.cookieSecure ?? false, sameSite: "lax" },
      session: { ttlMs: input.sessionTtlMs },
      persistence: { kind: "filesystem" },
      workItems: {
        store: { kind: "memory" },
        allowEphemeral: true,
        allowSingleNodeFile: false,
        requireCloudGrade: false,
      },
      bootstrapAdmin: {
        email: "admin@example.com",
        password: "password123",
      },
    };
  }
});

async function createReadyWorkItem(
  app: Awaited<ReturnType<typeof buildServer>>,
  token: string,
  id: string,
): Promise<void> {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/work-items",
    headers: { authorization: `Bearer ${token}` },
    payload: workItemInput(id),
  });
  expect(created.statusCode).toBe(201);
  const ready = await app.inject({
    method: "POST",
    url: `/api/v1/work-items/${id}/ready`,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(ready.statusCode).toBe(200);
}

async function createToken(app: Awaited<ReturnType<typeof buildServer>>): Promise<string> {
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "admin@example.com", password: "password123" },
  });
  const cookie = login.cookies[0]?.value;
  const tokenResponse = await app.inject({
    method: "POST",
    url: "/api/v1/tokens",
    cookies: { awl_session: cookie ?? "" },
    payload: {
      name: "executor",
      scopes: ["plans:submit", "plans:claim", "plans:complete"],
    },
  });
  return tokenResponse.json<{ token: string }>().token;
}

async function createWorkItemToken(
  app: Awaited<ReturnType<typeof buildServer>>,
  scopes: ClientTokenScope[] = [
    "work_items:read",
    "work_items:create",
    "work_items:transition",
    "work_items:claim",
    "work_items:heartbeat",
    "work_items:complete",
    "work_items:cancel",
  ],
): Promise<string> {
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "admin@example.com", password: "password123" },
  });
  const cookie = login.cookies[0]?.value;
  const tokenResponse = await app.inject({
    method: "POST",
    url: "/api/v1/tokens",
    cookies: { awl_session: cookie ?? "" },
    payload: {
      name: "work-item-client",
      scopes,
    },
  });
  return tokenResponse.json<{ token: string }>().token;
}

function completeWorkLoop(input: typeof workLoop): typeof workLoop & { status: "done" } {
  return {
    ...input,
    status: "done",
    slices: input.slices.map((slice) => ({ ...slice, status: "done" })),
  };
}

function workItemInput(id = "wi-example-1", jobClass = "planning_only"): Record<string, unknown> {
  return {
    id,
    created_by: "human-operator-example",
    target_repo: "example-service",
    title: "Draft a coordination plan",
    objective: "Create a public-safe synthetic planning artifact.",
    priority: "normal",
    trust_zone: "B_cloud_private",
    job_class: jobClass,
    authority_class: "planning_only",
    required_capabilities: ["planning_packet"],
    payload_ref: "artifact://example/input",
    redaction_policy: "public_safe_no_sensitive_payloads",
    idempotency_key: `${id}-key`,
  };
}
