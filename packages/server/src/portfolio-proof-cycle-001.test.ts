import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ClientTokenScope,
  JsonValue,
  PlanReviewEvidence,
  WorkLoop,
  WorkLoopDecision,
} from "@agent-workloops/api";
import { buildServer } from "./app.js";
import type { ServerConfig } from "./config.js";

interface ProofFixture {
  proof_id: string;
  synthetic_plan_request: {
    approvalRequired: boolean;
    workLoop: WorkLoop;
  };
  synthetic_outcome: {
    artifact_path: string;
    summary: string;
    disposition: string;
  };
}

describe("Portfolio Proof Cycle 001 hosted active-spine conformance", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "awl-ppc001-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("submits, approves, claims, completes, and archives a synthetic reviewed plan", async () => {
    const fixture = await readJson<ProofFixture>(
      new URL("../../../examples/portfolio-proof-cycle-001/workloops-active-spine-conformance.json", import.meta.url),
    );
    const reviewEvidence = await readJson<PlanReviewEvidence>(
      new URL("../../../examples/portfolio-proof-cycle-001/workloops-independent-aiql-review.json", import.meta.url),
    );
    const app = await buildServer({ config: config() });
    const sessionCookie = await loginAsAdmin(app);
    const token = await createPlanToken(app, sessionCookie);

    const submitted = await app.inject({
      method: "POST",
      url: "/api/v1/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: fixture.synthetic_plan_request,
    });
    expect(submitted.statusCode).toBe(201);
    expect(submitted.json<{ plan: { approvalStatus: string; status: string } }>().plan).toMatchObject({
      approvalStatus: "pending",
      status: "queued",
    });
    const planId = submitted.json<{ plan: { id: string } }>().plan.id;

    const claimBeforeApproval = await app.inject({
      method: "POST",
      url: "/api/v1/plans/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: { planId },
    });
    expect(claimBeforeApproval.statusCode).toBe(200);
    expect(claimBeforeApproval.json()).toEqual({});

    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${planId}/approve`,
      cookies: { awl_session: sessionCookie },
      payload: { reason: "Synthetic proof approval." },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json<{ approvalStatus: string }>().approvalStatus).toBe("approved");

    const claim = await app.inject({
      method: "POST",
      url: "/api/v1/plans/claim",
      headers: { authorization: `Bearer ${token}` },
      payload: { planId },
    });
    expect(claim.statusCode).toBe(200);
    const leaseId = claim.json<{ leaseId: string }>().leaseId;
    expect(leaseId).toBeTruthy();
    expect(claim.json<{ plan: { status: string; lock: { leaseId: string } } }>().plan).toMatchObject({
      status: "locked",
      lock: { leaseId },
    });

    const heartbeat = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${planId}/heartbeat`,
      headers: { authorization: `Bearer ${token}` },
      payload: { leaseId },
    });
    expect(heartbeat.statusCode).toBe(200);

    const completedWorkLoop = completeWorkLoop(fixture.synthetic_plan_request.workLoop, {
      outcomePath: fixture.synthetic_outcome.artifact_path,
      reviewPath: reviewArtifactPath(reviewEvidence),
    });
    const decision: WorkLoopDecision = {
      action: "done",
      reason: reviewEvidence.summary,
      evidencePaths: [fixture.synthetic_outcome.artifact_path, reviewArtifactPath(reviewEvidence)],
      nextOwner: "agent",
      workLoopId: completedWorkLoop.id,
      sliceId: completedWorkLoop.slices[0]?.id,
    };

    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${planId}/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        leaseId,
        workLoop: completedWorkLoop,
        decision,
        metadata: {
          proofId: fixture.proof_id,
          outcome: {
            artifact_path: fixture.synthetic_outcome.artifact_path,
            summary: fixture.synthetic_outcome.summary,
            disposition: fixture.synthetic_outcome.disposition,
          },
        } satisfies Record<string, JsonValue>,
      },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json<{ status: string; completion: { metadata: { proofId: string } } }>()).toMatchObject({
      status: "completed",
      completion: {
        metadata: {
          proofId: "portfolio-proof-cycle-001-workloops-active-spine",
        },
      },
    });

    const attachedReview = await app.inject({
      method: "POST",
      url: `/api/v1/plans/${planId}/review-evidence`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reviewEvidence: { ...reviewEvidence, planId } },
    });
    expect(attachedReview.statusCode).toBe(200);
    expect(
      attachedReview.json<{ reviewEvidence: PlanReviewEvidence[] }>().reviewEvidence,
    ).toEqual([
      expect.objectContaining({
        reviewEvidenceId: "portfolio-proof-cycle-001-workloops-independent-aiql-review",
        planId,
        source: "aiql",
        reviewedTargetType: "workloop_outcome",
        executionMode: "manual_structured_review",
        status: "pass",
        tool: expect.objectContaining({ name: "ai-quality-loops" }),
        evidenceLabels: expect.arrayContaining([
          expect.objectContaining({ label: "Independent artifact" }),
        ]),
        recommendation: expect.objectContaining({ action: "accept_with_follow_up" }),
        gateResult: expect.objectContaining({ status: "not_run" }),
      }),
    ]);

    const listedReview = await app.inject({
      method: "GET",
      url: `/api/v1/plans/${planId}/review-evidence`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listedReview.statusCode).toBe(200);
    expect(listedReview.json<{ reviewEvidence: PlanReviewEvidence[] }>().reviewEvidence).toEqual(
      attachedReview.json<{ reviewEvidence: PlanReviewEvidence[] }>().reviewEvidence,
    );

    const archive = await app.inject({
      method: "GET",
      url: "/api/v1/plans/archive",
      cookies: { awl_session: sessionCookie },
    });
    expect(archive.statusCode).toBe(200);
    expect(archive.json<Array<{ id: string }>>()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: planId,
          status: "completed",
          reviewEvidence: [
            expect.objectContaining({
              reviewEvidenceId: "portfolio-proof-cycle-001-workloops-independent-aiql-review",
              reviewedTargetType: "workloop_outcome",
              executionMode: "manual_structured_review",
              status: "pass",
            }),
          ],
        }),
      ]),
    );

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/plans/${planId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const detailJson = detail.json<{
      audit: Array<{ type: string; metadata?: { artifactRefs?: Array<{ uri?: string; path?: string }> } }>;
    }>();
    expect(detailJson.audit.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "submit",
        "approve",
        "claim",
        "heartbeat",
        "complete",
        "attach_review_evidence",
      ]),
    );
    const attachAudit = detailJson.audit.find((event) => event.type === "attach_review_evidence");
    expect(attachAudit?.metadata?.artifactRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uri: "repo://agent-workloops/examples/portfolio-proof-cycle-001/README.md",
        }),
      ]),
    );
    expect(JSON.stringify(attachAudit?.metadata)).not.toContain("/Users/");
  });

  function config(): ServerConfig {
    return {
      host: "127.0.0.1",
      port: 3210,
      publicBaseUrl: "http://127.0.0.1:3210",
      trustProxy: false,
      dataDir,
      approval: { forceRequired: true },
      locks: { timeoutMs: 1000 },
      cookies: { secure: false, sameSite: "lax" },
      session: {},
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

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await fs.readFile(url, "utf8")) as T;
}

function reviewArtifactPath(evidence: PlanReviewEvidence): string {
  const ref = evidence.evidenceLabels
    .flatMap((label) => label.artifactRefs ?? [])
    .find((artifact) => artifact.kind === "review-evidence");
  return ref?.path ?? "examples/portfolio-proof-cycle-001/workloops-independent-aiql-review.json";
}

async function loginAsAdmin(app: Awaited<ReturnType<typeof buildServer>>): Promise<string> {
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "admin@example.com", password: "password123" },
  });
  expect(login.statusCode).toBe(200);
  const cookie = login.cookies[0]?.value;
  expect(cookie).toBeTruthy();
  return cookie ?? "";
}

async function createPlanToken(
  app: Awaited<ReturnType<typeof buildServer>>,
  sessionCookie: string,
): Promise<string> {
  const tokenResponse = await app.inject({
    method: "POST",
    url: "/api/v1/tokens",
    cookies: { awl_session: sessionCookie },
    payload: {
      name: "portfolio-proof-cycle-001-executor",
      scopes: ["plans:submit", "plans:claim", "plans:complete"] satisfies ClientTokenScope[],
    },
  });
  expect(tokenResponse.statusCode).toBe(200);
  return tokenResponse.json<{ token: string }>().token;
}

function completeWorkLoop(
  workLoop: WorkLoop,
  evidence: { outcomePath: string; reviewPath: string },
): WorkLoop {
  return {
    ...workLoop,
    status: "done",
    slices: workLoop.slices.map((slice) => ({
      ...slice,
      status: "done",
      attemptCount: slice.attemptCount + 1,
      lastOutcomePath: evidence.outcomePath,
      lastPeerReviewPath: evidence.reviewPath,
    })),
  };
}
