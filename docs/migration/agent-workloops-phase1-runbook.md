# Agent-Workloops Phase 1 Runbook

## Goal

Prepare `agent-workloops` to run as a cloud-private coordination service for shared planning state.

The target is coordination, not execution.

## Non-Goals

- No hosted local execution.
- No public product launch.
- No sensitive local-adapter access.
- No local shell access.
- No credential movement.
- No raw sensitive execution traces in hosted storage.
- No deployment-specific private architecture in this public repository.

## Proposed Runtime Shape

- Private web/API service.
- Database-backed coordination state.
- Authenticated access for orchestrator instances.
- Token-scoped machine clients.
- Optional admin UI for review, claims, approvals, stale leases, and audit metadata.
- Outbound-only local runners that claim work and return sanitized outcomes.
- Hosted runtime feature flags that disable local command execution and workspace-path execution.

## Phase 1B Synthetic API/Store Status

Phase 1B adds a synthetic-only hosted coordination path:

- hosted startup validates fail-closed safety flags before the server listens
- an authenticated work-item API exists under the hosted API surface
- a non-durable in-memory work item store backs the first synthetic path
- planning-only work items can be created, listed, fetched, marked ready, claimed, heartbeated, completed, failed, and cancelled
- stale leases can be released
- approval-required write/action work is rejected in this phase
- forbidden work is rejected
- no route executes local commands, reads workspace paths, invokes local runners, uploads raw traces, or calls external services

Persistence for the work item model remains future work. The in-memory store is intentionally suitable only for synthetic tests, local development, and API shape validation.

## Phase 1C Store/Auth Status

Phase 1C makes the synthetic coordination path safer for multi-instance trials:

- the work item API uses a `WorkItemStore` abstraction
- the existing memory store remains available for local tests and development
- a JSON file-backed store exists for reviewed single-node coordination trials
- file-backed storage validates loaded records and fails closed on corrupt data
- hosted startup validates the selected work item store before serving traffic
- hosted mode refuses non-durable memory storage unless an explicit ephemeral-store override is set
- work item routes now use work-item-specific token scopes instead of plan scopes
- protected local actions remain out of scope and are not executable through these routes

The file-backed store is a first non-memory adapter, not the final cloud persistence design. A future database adapter should be added before relying on hosted coordination for resilient multi-node use.

## Required Data Model Concepts

- `instance`: desktop, laptop, cloud orchestrator, local runner, cloud worker, or human operator identity.
- `capability`: a named ability with trust boundary, max job class, and authority classes.
- `work item`: durable planning/coordination record shared across instances.
- `task envelope`: execution request derived from a work item for a specific capability.
- `claim/lease`: bounded ownership of a work item by an instance.
- `approval`: human or policy approval reference for protected work.
- `artifact reference`: pointer to sanitized artifacts, not raw sensitive payloads.
- `sanitized outcome`: redacted completion summary.
- `audit event`: append-oriented event metadata for coordination and approval history.

## Required API Concepts

- Register instance.
- Publish capability.
- Create work item.
- Claim work item.
- Heartbeat lease.
- Release work item.
- Complete work item.
- Attach sanitized outcome.
- Request approval.
- Record approval decision.
- List planning surface.
- List audit trail.

## Safety Checks Before Hosted Deployment

- Confirm hosted config refuses local command execution.
- Confirm hosted config refuses workspace-path execution.
- Confirm hosted config refuses raw sensitive trace upload.
- Confirm broad personal tokens are not accepted.
- Confirm machine tokens are scoped and revocable.
- Confirm database persistence is configured for hosted state.
- Confirm the work item store is not `memory` unless running an explicit test-only hosted trial.
- Confirm file-backed work item storage, if used, has an explicit path and operational backup plan.
- Confirm database-backed work item storage, when implemented, is configured without logging connection details.
- Confirm cookie/session settings are secure behind TLS.
- Confirm public base URL is explicit.
- Confirm logs redact authorization headers, cookies, token-like fields, credentials, connection URLs, and webhook URLs.
- Confirm sensitive local adapters are not bundled into hosted runtime.

## Validation Checks

Safe static validation for this phase:

- `git status`
- `git diff --stat`
- JSON Schema syntax validation with an already-available local tool, if present
- targeted unit tests that do not start services
- public-safety scan over changed public files

Implementation validation before a later hosted rollout:

- server unit tests
- API contract tests for work items, claims, leases, approvals, and audit events
- auth/token scope tests
- work-item store selection tests
- durable store corruption tests
- redaction tests
- stale lease recovery tests
- hosted startup fail-closed tests
- container build and local smoke with local execution disabled

## Rollback Strategy

- Keep existing local-only workflows authoritative until hosted coordination proves safe.
- If hosted coordination fails, stop new work item creation and return to local planning records.
- Mark active hosted leases stale or cancelled; do not auto-run them elsewhere.
- Preserve audit history for diagnosis.
- Revoke machine tokens for affected instances.
- Disable hosted endpoint or remove routing without touching local runners.

## Definition Of Done

- Contract docs and schemas exist.
- Hosted environment contract names required public-safe config without values.
- Work item and instance capability schemas validate.
- Synthetic planning-only work items can be created, claimed, heartbeated, and completed without local execution.
- Fail-closed hosted startup rules are implemented and tested.
- Synthetic work item API/store path exists and is documented as non-durable until a reviewed persistence adapter is added.
- Work-item-specific token scopes are enforced on work item routes.
- Hosted startup rejects unsafe or non-durable work item store settings.
- Deployment-specific/private migration notes remain outside this public repository.
