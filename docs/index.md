# Durable WorkLoops

Durable WorkLoops provide a reusable core for long-running agent work. The package keeps the portable pieces small: contracts, deterministic slice selection, deterministic adjudication from outcome plus review evidence, and a generic Codex launch envelope.

## Package Map

- `durable-workloops/schema`: Zod schemas and TypeScript types for loops, slices, policies, and controller decisions.
- `durable-workloops/selection`: helpers for selecting ready slices, resuming running slices, and marking a slice as running.
- `durable-workloops/adjudication`: pure adjudication and state-application helpers.
- `durable-workloops`: aggregate export for the public core.

## Integration Shape

Host systems should keep their own tracker adapters, reviewer integrations, persistence layout, and notification routing. They can use this package for the shared state contract, deterministic transitions, and Codex prompt or launch-record generation, then wrap it with local authority rules.

## Codex Launcher

The package includes `durable-workloops/launcher` for the common case where a WorkLoop slice should be handed to Codex:

- `prepareWorkLoopCodexLaunch(...)` writes a bounded slice prompt and launch record.
- `renderWorkLoopCodexPrompt(...)` exposes the prompt without writing files.
- `runPreparedWorkLoopCodexLaunch(...)` executes the recorded `codex exec` command and pipes the prompt through stdin.

The launcher intentionally does not know about Linear, Jira, Confluence, Slack, or host-specific review engines. It only creates an execution envelope with a required outcome artifact path so host controllers can ingest and adjudicate the result.

## Non-Goals

- No hosted runner.
- No tracker-specific API client.
- No repository-specific automation policy.
- No assumption that a peer-review engine is bundled with the core.
