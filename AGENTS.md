# AGENTS.md

## Role

This repository contains a public TypeScript package and hosted dashboard for
durable agent-workflow state machines. The core package models generic
WorkLoops; the hosted app coordinates plan submission, human approval, executor
leasing, completion, and audit visibility.

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
- Treat this repo as the owned public core for durable agent work loops. When
  downstream use exposes generic friction, missing contracts, confusing docs,
  weak receipts, or poor recovery behavior, improve the generic core here
  instead of adding downstream prompt caveats.
- Prefer named exports, explicit schemas, and focused tests.
- Run `pnpm check` before finishing code changes.
- Do not create external remotes, publish packages, or perform public writes
  without explicit maintainer approval.

## Boundaries

The package may model generic work loops, slices, outcomes, reviews, decisions,
plan approval, executor leasing, and state transitions. It must not include
private project names, credentials, customer data, local machine paths,
Linear/Jira implementation logic, or repository-specific policy.

## Product Model

- Agent Workloops coordinates execution plans for agent work.
- A plan is one submitted WorkLoop unit: objective, success criteria, slices,
  policies, source, and project metadata.
- An executor is a client or worker authenticated by a client token. Executors
  claim plans, hold leases, heartbeat or release progress, and complete plans.
- Approval is a human review gate. Plans with `approvalStatus: "pending"` are
  not claimable until a reviewer or admin approves them.
- A lease protects a claimed plan from duplicate execution. A locked plan can
  be claimed again only after the lease expires.

## Plan Lifecycle

1. Submit: `/api/v1/plans` creates a `PlanRecord` with `status: "queued"`.
   Approval is `pending` when approval is required, otherwise `not_required`.
2. Review: reviewers/admins can approve, reject, or request review.
3. Claim: `/api/v1/plans/claim` selects an approved or approval-free queued
   plan with an active WorkLoop, then sets `status: "locked"` and writes a
   lease.
4. Execute: an executor heartbeats, reports progress, releases, or completes
   with a token that has `plans:complete`.
5. Release: released plans may become queued again, pending review, blocked, or
   canceled depending on the submitted WorkLoop status and release reason.
6. Complete: completion requires the submitted WorkLoop status to be `done`,
   sets `status: "completed"`, clears the lock, and places the plan in archive.

## Queues And Statuses

- Pending Approval: `approvalStatus: "pending"`. These plans wait for human
  review before execution.
- Ready to Claim / Claimable: `status: "queued"` plus `approvalStatus:
  "approved"` or `"not_required"`. These plans are available to executors.
- Locked / Running: `status: "locked"`. These plans have an executor lease.
- Completed Archive: `/api/v1/plans/archive` returns completed plans only.
- Other API statuses exist: `blocked`, `canceled`, and `rejected` approval are
  valid records but are not separate top-level dashboard queues today.
- UI labels intentionally translate raw values: the internal `claimable` bucket
  is shown as "Ready to Claim"; `queued` plus approved/not-required approval is
  also badged as "Ready to Claim"; `locked` is shown as "Locked / Running".

## Frontend Map

- `apps/web/src/App.tsx`: live app orchestration, refresh, auth, tab state, and
  API mutations.
- `apps/web/src/features/dashboard/DashboardShell.tsx`: dashboard shell,
  sidebar navigation, queue metrics, and tab content.
- `apps/web/src/features/dashboard/productCopy.ts`: canonical UI copy for
  concepts, queues, lifecycle steps, approval badges, execution-status badges,
  and plan action labels.
- `apps/web/src/features/dashboard/PlanLifecycleHelp.tsx`: compact lifecycle
  strip plus collapsed "How this works" disclosure for queue pages.
- `apps/web/src/features/plans/PlanTable.tsx`: queue tables and plan actions.
- `apps/web/src/components/PlanBadges.tsx`: approval and execution badges.
- `apps/web/src/features/plans/NewPlanPanel.tsx`: manual WorkLoop plan
  submission.
- `apps/web/src/features/plans/PlanDetail.tsx`: plan detail modal and audit
  trail.
- `apps/web/src/features/users/UsersPanel.tsx`: local user administration.
- `apps/web/src/features/tokens/TokensPanel.tsx`: client token minting and
  scope display.
- `apps/web/src/features/demo/*`: deterministic demo data and routes for UI
  inspection.

## Backend And API Map

- `packages/api/src/index.ts`: Zod schemas, public types, and typed API client.
- `packages/server/src/app.ts`: Fastify routes for auth, plans, review,
  claiming, heartbeat, progress, release, completion, users, and tokens.
- `packages/server/src/store.ts`: persistence interface for plans, audit, users,
  sessions, and client tokens.
- `packages/server/src/filesystem-store.ts`: filesystem persistence and the
  reference lifecycle behavior.
- `packages/server/src/sql-store.ts` and `packages/server/src/mongodb-store.ts`:
  SQL and MongoDB persistence implementations.
- `packages/cli/src/index.ts`: CLI for submitting, claiming, polling, running
  Codex, releasing, and completing plans.

## Local Commands

- Install dependencies: `pnpm install`
- Run hosted stack: `pnpm dev:hosted`
- Run server only: `pnpm dev:server`
- Run web only: `pnpm dev:web`
- Typecheck all packages: `pnpm typecheck`
- Run all tests: `pnpm test`
- Build all packages: `pnpm build:all`
- Full verification: `pnpm check`
- Web-only verification: `pnpm --dir apps/web typecheck`, `pnpm --dir apps/web test`,
  `pnpm --dir apps/web build`

## UI Copy Conventions

- Prefer plain operational labels over jargon. Use "Ready to Claim" in UI copy
  when explaining the `claimable` bucket.
- Keep the queue pages operational. The compact lifecycle strip may stay
  visible, but the full product explanation should stay in progressive
  disclosure by default.
- Keep raw schema values in code and persistence; translate them at the UI edge.
- Badges must have visible labels plus `title` or `aria-label` with the full
  meaning.
- Icon-only actions must have explicit labels such as "View plan details" or
  "Approve plan for executor work."
- Empty states should say what the absence means and, when useful, offer the
  next action.
- Do not claim archive includes canceled or blocked plans unless backend
  behavior changes; today it is completed plans only.
- When adding or changing statuses, update schemas, server store transitions,
  UI copy, badges, tests, and this guide together.
