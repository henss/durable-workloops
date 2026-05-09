# Durable WorkLoops

Durable WorkLoops provide a reusable core for long-running agent work. The package keeps the portable pieces small: contracts, deterministic slice selection, deterministic adjudication from outcome plus review evidence, and a generic Codex launch envelope.

## Package Map

- `durable-workloops/schema`: Zod schemas and TypeScript types for loops, slices, policies, and controller decisions.
- `durable-workloops/selection`: helpers for selecting ready slices, resuming running slices, and marking a slice as running.
- `durable-workloops/adjudication`: pure adjudication and state-application helpers.
- `durable-workloops`: aggregate export for the public core.

## Integration Shape

Host systems should keep their own tracker adapters, reviewer integrations, persistence layout, and notification routing. They can use this package for the shared state contract, deterministic transitions, and Codex prompt or launch-record generation, then wrap it with local authority rules.

## Portfolio Adoption

Portfolio repos should use this package as the shared public core for long-running, multi-step, or commit-per-increment agent work when their local guidance or capability routing adopts it. Adoption friction is product evidence for this package: if a generic contract, receipt, recovery path, prompt envelope, or documentation surface is missing or confusing, fix it here when the improvement is public-safe. Keep repo-specific policy, tracker integration, private launch orchestration, and project state in downstream adapters.

## Codex Launcher

The package includes `durable-workloops/launcher` for the common case where a WorkLoop slice should be handed to Codex:

- `prepareWorkLoopCodexLaunch(...)` writes a bounded slice prompt and launch record.
- `renderWorkLoopCodexPrompt(...)` exposes the prompt without writing files.
- `runPreparedWorkLoopCodexLaunch(...)` executes the recorded `codex exec` command and pipes the prompt through stdin.

Launches support two modes:

- `fresh_session`: runs `codex exec --cd <workspace> -`.
- `same_session`: runs `codex exec resume <session-id> -` or `codex exec resume --last -` for healthy adjacent slices that should preserve conversational context.

The launcher intentionally does not know about Linear, Jira, Confluence, Slack, or host-specific review engines. It only creates an execution envelope with a required outcome artifact path so host controllers can ingest and adjudicate the result. Host controllers should fall back to `fresh_session` after failed reviews, blockers, stale state, or context drift.

## Review Adapter

The package includes `durable-workloops/ai-quality-loops` as an optional adapter shape for review execution. It does not import or depend on `ai-quality-loops`; callers pass an AIQL-compatible `runQualityReview` function. The adapter maps WorkLoop objective, success criteria, prompt path, outcome path, and changed paths into a generic review request, then returns `WorkLoopPeerReviewLike` evidence for adjudication.

## Non-Goals

- No hosted runner.
- No tracker-specific API client.
- No repository-specific automation policy.
- No assumption that a peer-review engine is bundled with the core.
