# Agent Workloops Active Spine Roadmap

## Status

- Current repo-local strategy note.
- `agent-workloops` is an active build project in the portfolio spine.
- This note is planning and conformance guidance, not a deployment approval.
- Do not add dependencies, hosted infrastructure, release automation, or cloud resources from this note alone.

## Current Role

`agent-workloops` owns public, reusable contracts for durable LLM-agent work slices. The repo should help host systems split work into bounded slices, require approval where needed, lease work safely, recover from interruption, archive outcomes, and attach review evidence.

This repo is not a generic durable workflow runtime. It should not recreate Temporal, Durable Functions, LangGraph-style graph orchestration, tracker-specific policy, private orchestration, or cloud execution platforms. Host systems own their tracker adapters, private policy, notifications, deployment topology, and live execution authority.

## Active Build Priorities

1. Hosted sandbox seed
   - Prove a public-safe, synthetic hosted coordination path.
   - Keep local command execution disabled.
   - Use synthetic work items, approval states, leases, heartbeats, stale lease release, sanitized outcomes, and archive metadata.
   - Treat this as conformance evidence, not production rollout.

2. Cross-package conformance harness
   - Exercise the root package, API contracts, server lifecycle, CLI behavior, and web review surfaces against the same durable work-slice scenario.
   - Cover approval, claim, lease heartbeat, stale recovery, completion, failure/repair routing, and archived outcome metadata.
   - Prefer synthetic fixtures and public-safe assertions over private orchestration examples.

3. Public-core boundary guard
   - Keep `agent-workloops` focused on LLM-agent work contracts, leases, approvals, prompt/outcome envelopes, and review evidence.
   - Reject tracker-specific adapters, private launch policy, provider-specific workflow assumptions, and deployment-specific secrets or topology.
   - Move private orchestration and tracker behavior into downstream adapters.

4. Cloud deployment blueprint
   - Document the minimum public-safe blueprint for hosted dogfood.
   - Keep cloud resource names, secret names, account details, and deployment-specific policies outside this public repo.
   - Require hosted safety flags, cloud-grade persistence, audit backing, scoped tokens, and redacted outcome references before real hosted coordination.

5. AIQL review evidence attachment
   - Keep AIQL integration optional and dependency-free.
   - Attach review evidence to WorkLoop adjudication without bundling a review engine.
   - Prove that review evidence changes routing decisions, such as repair, blocked, needs-human, or done.

## Build-Vs-Buy Note

Before `agent-workloops` grows runtime-like behavior, evaluate durable execution and workflow runtimes where relevant. WorkLoops should not recreate generic durable execution, scheduler, worker, retry, graph, or hosted orchestration infrastructure when a strong existing system fits.

The repo's unique value is LLM-agent-specific:

- work-slice contracts
- leases and approval gates
- prompt and outcome envelopes
- review evidence attachments
- deterministic adjudication from outcome plus review evidence
- public-safe conformance fixtures for agent work

If a third-party runtime owns execution state, `agent-workloops` can still own the agent-facing contract and evidence envelope around that runtime. Adoption or rejection evidence should be recorded before expanding the local runtime surface.

## Conformance Scenario

The near-term conformance scenario should stay small:

1. Submit a synthetic work item with two dependent slices.
2. Require manual approval before claim.
3. Claim a slice with a lease.
4. Heartbeat or let the lease expire.
5. Recover stale work without duplicating ownership.
6. Complete with sanitized outcome metadata and artifact references.
7. Attach AIQL-shaped review evidence.
8. Adjudicate to continue, repair, blocked, needs-human, or done.
9. Archive the final outcome.

Passing this scenario across packages is stronger evidence than adding another hosted feature.

## Blocked Work

- Generic workflow engine behavior.
- Tracker-specific policy or adapters.
- Private orchestration rules.
- Hosted local command execution.
- Raw private logs or sensitive artifact uploads.
- Cloud provider resources, secret names, account details, or deployment-specific topology in public docs.
- New dependencies or services without a scoped build-vs-buy record.

## Principle Check

- Benefit path: keeps active WorkLoops buildout focused on the durable agent-slice spine the portfolio needs first.
- Likely objection: hosted docs could imply production readiness; this note explicitly limits hosted work to sandbox, conformance, and blueprint evidence.
- Boundary: docs/roadmap/conformance planning only; no feature implementation, dependency addition, service buildout, or cloud deployment is authorized.
