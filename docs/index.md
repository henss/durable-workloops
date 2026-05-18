# Agent Workloops

Agent Workloops provide a reusable core for long-running agent work. The root package keeps the portable pieces small: contracts, deterministic slice selection, deterministic adjudication from outcome plus review evidence, and a generic Codex launch envelope. This repository also includes optional hosted packages around that core for plan submission, approval, leasing, execution, and review.

## Current Strategy

`agent-workloops` is an active build project in the portfolio spine. Its durable value is LLM-agent work slices, approval, leases, recovery, outcome archives, and AIQL-shaped review evidence. It is not a generic durable workflow runtime, tracker adapter, or private orchestration policy layer.

Near-term planning is tracked in [Active Spine Roadmap](strategy/active-spine-roadmap.md).

## Package Map

- `agent-workloops/schema`: Zod schemas and TypeScript types for loops, slices, policies, and controller decisions.
- `agent-workloops/selection`: helpers for selecting ready slices, resuming running slices, and marking a slice as running.
- `agent-workloops/adjudication`: pure adjudication and state-application helpers.
- `agent-workloops`: aggregate export for the public core.
- `@agent-workloops/api`: shared Zod wire contracts and a small typed HTTP client for hosted Agent Workloops.
- `@agent-workloops/server`: Fastify server with local users, client tokens, approval queue, filesystem persistence, leases, completion archive, and SQL/Mongo adapter seams.
- `@agent-workloops/cli`: executor CLI for submitting, claiming, polling, completing, and running approved plans through Codex.
- `@agent-workloops/web`: Vite React and Mantine UI for login, manual approval, queue review, archive browsing, users, and client tokens.

## Integration Shape

Host systems can either embed the root package directly or run the optional server. The hosted server accepts authenticated submissions, enforces optional or forced manual approval, lets client tokens atomically claim approved and unlocked plans, expires leases after a configurable timeout, records completion metadata for the archive, and lets callers attach first-class review evidence to completed plans.

The filesystem store is the default single-server persistence path. SQL/Supabase and MongoDB are represented as provider seams so downstream deployments can add concrete adapters without changing the API, UI, or CLI contracts.

## Hosted Production Container

The repository includes a generic production `Dockerfile` for self-hosting the optional server and web UI. The image builds the workspace, serves `apps/web/dist` through the Fastify server, and listens on `AWL_PORT`.

Production deployments should set:

- `AWL_HOST=0.0.0.0`
- `AWL_PORT=3210`
- `AWL_PUBLIC_BASE_URL=https://your-internal-host.example.com`
- `AWL_WEB_DIST_DIR=/app/apps/web/dist`
- `AWL_PERSISTENCE_KIND=mongodb`
- `AWL_MONGODB_CONNECTION_STRING=<secret>`
- `AWL_MONGODB_DATABASE=agent_workloops`
- `AWL_FORCE_APPROVAL_REQUIRED=true`
- `AWL_COOKIE_SECURE=true`
- `AWL_TRUST_PROXY=true`
- `AWL_SESSION_TTL_MS=<milliseconds>` when browser sessions should expire automatically

Keep deployment-specific domains, cloud resource names, subscriptions, and secret references in the downstream infrastructure repository, not in this public package.

## Portfolio Adoption

Portfolio repos should use this package as the shared public core for long-running, multi-step, or commit-per-increment agent work when their local guidance or capability routing adopts it. Adoption friction is product evidence for this package: if a generic contract, receipt, recovery path, prompt envelope, or documentation surface is missing or confusing, fix it here when the improvement is public-safe. Keep repo-specific policy, tracker integration, private launch orchestration, and project state in downstream adapters.

## Codex Launcher

The package includes `agent-workloops/launcher` for the common case where a WorkLoop slice should be handed to Codex:

- `prepareWorkLoopCodexLaunch(...)` writes a bounded slice prompt and launch record.
- `renderWorkLoopCodexPrompt(...)` exposes the prompt without writing files.
- `runPreparedWorkLoopCodexLaunch(...)` executes the recorded `codex exec` command and pipes the prompt through stdin.

Launches support two modes:

- `fresh_session`: runs `codex exec --cd <workspace> -`.
- `same_session`: runs `codex exec resume <session-id> -` or `codex exec resume --last -` for healthy adjacent slices that should preserve conversational context.

The launcher intentionally does not know about Linear, Jira, Confluence, Slack, or host-specific review engines. It only creates an execution envelope with a required outcome artifact path so host controllers can ingest and adjudicate the result. Host controllers should fall back to `fresh_session` after failed reviews, blockers, stale state, or context drift.

## Review Adapter

The package includes `agent-workloops/ai-quality-loops` as an optional adapter shape for review execution. It does not import or depend on `ai-quality-loops`; callers pass an AIQL-compatible `runQualityReview` function. The adapter maps WorkLoop objective, success criteria, prompt path, outcome path, and changed paths into a generic review request, then returns `WorkLoopPeerReviewLike` evidence for adjudication.

## Hosted Server

- Manual plan approval is performed in the server UI.
- Users sign in with local accounts; admins manage users and reviewers.
- Users mint named, scoped, revocable client tokens for software executors.
- Client token scopes are `plans:submit`, `plans:claim`, and `plans:complete`.
- Executors claim plans with an auto-lock lease and must heartbeat or complete before expiry.
- Completed plans remain available from the archive with metadata payloads.
- Completed plans can carry first-class `reviewEvidence` records attached through `POST /api/v1/plans/:planId/review-evidence` and read through `GET /api/v1/plans/:planId/review-evidence`, plan detail, and archive responses.

## Review Evidence Contract

Hosted WorkLoops stores review evidence as caller-supplied records. It does not run AIQL or import `ai-quality-loops`; callers execute review elsewhere and attach the resulting evidence.

Each review evidence record includes:

- `reviewEvidenceId`
- `planId` or `completionId`
- `source`: `aiql`, `manual`, `synthetic`, or `other`
- `status`: `pass`, `soft_fail`, `fail`, or `blocked`
- `severityRollup`
- `summary`
- `findings`
- `artifactRefs`
- `createdAt`

Only completed plans accept review evidence. Executor tokens with `plans:complete` can attach evidence, and authenticated callers can read it back. The audit stream records an `attach_review_evidence` event with only summary fields and artifact references, not raw private logs.

## Web UI Screenshots

The web UI includes a public-safe synthetic dashboard route for screenshots and UI review. Start the web app, then open:

- `/?demo=1&theme=light&tab=pending`
- `/?demo=1&theme=dark&tab=pending`
- `/?demo=1&theme=light&tab=locked`

Supported `tab` values are `pending`, `claimable`, `locked`, `archive`, `users`, and `tokens`. Supported forced `theme` values are `light` and `dark`. The route bypasses live auth and API calls, uses synthetic data only, and is intended for local screenshot tests, README assets, and external UI review prompts.

## Non-Goals

- No tracker-specific API client.
- No public hosted service or package publishing workflow in this repository.
- No repository-specific automation policy.
- No generic durable workflow runtime, scheduler, graph engine, or private orchestration layer.
- No assumption that a peer-review engine is bundled with the core.
