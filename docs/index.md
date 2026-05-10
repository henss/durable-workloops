# Agent Workloops

Agent Workloops provide a reusable core for long-running agent work. The root package keeps the portable pieces small: contracts, deterministic slice selection, deterministic adjudication from outcome plus review evidence, and a generic Codex launch envelope. This repository also includes optional hosted packages around that core for plan submission, approval, leasing, execution, and review.

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

Host systems can either embed the root package directly or run the optional server. The hosted server accepts authenticated submissions, enforces optional or forced manual approval, lets client tokens atomically claim approved and unlocked plans, expires leases after a configurable timeout, and records completion metadata for the archive.

The filesystem store is the default single-server persistence path. SQL/Supabase and MongoDB are represented as provider seams so downstream deployments can add concrete adapters without changing the API, UI, or CLI contracts.

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

## Non-Goals

- No tracker-specific API client.
- No public hosted service or package publishing workflow in this repository.
- No repository-specific automation policy.
- No assumption that a peer-review engine is bundled with the core.
