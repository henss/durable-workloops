# Durable WorkLoops

Durable WorkLoops provide a reusable core for long-running agent work. The package keeps the portable pieces small: contracts, deterministic slice selection, and deterministic adjudication from outcome plus review evidence.

## Package Map

- `durable-workloops/schema`: Zod schemas and TypeScript types for loops, slices, policies, and controller decisions.
- `durable-workloops/selection`: helpers for selecting ready slices, resuming running slices, and marking a slice as running.
- `durable-workloops/adjudication`: pure adjudication and state-application helpers.
- `durable-workloops`: aggregate export for the public core.

## Integration Shape

Host systems should keep their own tracker adapters, launchers, reviewer integrations, persistence layout, and notification routing. They can use this package for the shared state contract and deterministic transitions, then wrap it with local authority rules.

## Non-Goals

- No hosted runner.
- No tracker-specific API client.
- No repository-specific automation policy.
- No assumption that a peer-review engine is bundled with the core.
