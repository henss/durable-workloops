# durable-workloops

Portable durable work-loop schemas and state transitions for agent workflows.

## What It Provides

Durable WorkLoops are small state machines for agent-run work that should not be treated as done just because a single session stopped.

- Schema contracts for a durable loop, slices, policies, and decisions.
- Slice selection helpers for choosing the next safe unit of work.
- Outcome and peer-review adjudication helpers.
- Pure TypeScript utilities that can be embedded behind local CLIs or trackers.

See [docs/index.md](docs/index.md) for the operating model and package map.

## Status

This repository is a local OSS draft. Publication, package naming, and release ownership should be approved before any external push or npm publish.
