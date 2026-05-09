# AGENTS.md

## Role

This repository contains a small public TypeScript package for durable
agent-workflow state machines.

## Rules

- Before broad search, use Agent Atlas:
  - Root view: `docs/agents/atlas.md`
  - Check setup: `pnpm atlas:doctor`
  - Resolve a file: `pnpm atlas:resolve-path -- <path>`
  - Generate task context: `pnpm atlas:context-pack -- "<task>"`
  - Refresh generated Atlas docs and README: `pnpm atlas:refresh`
  - Check Atlas drift: `pnpm atlas:check`
- Keep examples synthetic and public-safe.
- Keep the package independent from any private tracker, company, workspace,
  launcher, or review service.
- Put integration-specific behavior in downstream adapters, not in this core.
- Treat this repo as the owned public core for durable agent work loops used by
  portfolio repos. When downstream use exposes generic friction, missing
  contracts, confusing docs, weak receipts, or poor recovery behavior, improve
  the generic core here instead of adding downstream prompt caveats. Keep
  private policy, tracker adapters, launch orchestration, and project-specific
  state in downstream repos.
- Prefer named exports, explicit schemas, and focused tests.
- Run `pnpm check` before finishing code changes.
- Do not create external remotes, publish packages, or perform public writes
  without explicit maintainer approval.

## Boundaries

The package may model generic work loops, slices, outcomes, reviews, decisions,
and state transitions. It must not include private project names, credentials,
customer data, local machine paths, Linear/Jira implementation logic, or
repository-specific policy.
