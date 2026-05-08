# AGENTS.md

## Role

This repository contains a small public TypeScript package for durable
agent-workflow state machines.

## Rules

- Keep examples synthetic and public-safe.
- Keep the package independent from any private tracker, company, workspace,
  launcher, or review service.
- Put integration-specific behavior in downstream adapters, not in this core.
- Prefer named exports, explicit schemas, and focused tests.
- Run `pnpm check` before finishing code changes.
- Do not create external remotes, publish packages, or perform public writes
  without explicit maintainer approval.

## Boundaries

The package may model generic work loops, slices, outcomes, reviews, decisions,
and state transitions. It must not include private project names, credentials,
customer data, local machine paths, Linear/Jira implementation logic, or
repository-specific policy.
