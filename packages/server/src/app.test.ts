import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";
import type { ServerConfig } from "./config.js";

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
      payload: { leaseId, metadata: { exitCode: 0 } },
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

  function config(input: { forceApprovalRequired?: boolean; lockTimeoutMs?: number } = {}): ServerConfig {
    return {
      host: "127.0.0.1",
      port: 3210,
      publicBaseUrl: "http://127.0.0.1:3210",
      dataDir,
      approval: { forceRequired: input.forceApprovalRequired ?? false },
      locks: { timeoutMs: input.lockTimeoutMs ?? 1000 },
      persistence: { kind: "filesystem" },
      bootstrapAdmin: {
        email: "admin@example.com",
        password: "password123",
      },
    };
  }
});

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
