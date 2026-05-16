# Cloud-Private Coordination Contract

## Purpose

Define public-safe coordination primitives for deployments that need shared planning state across multiple orchestrator instances while keeping sensitive execution outside the hosted service.

This repository contains generic coordination primitives. Deployment-specific and private migration notes belong outside this public repository.

## Why This Coordination Layer Comes First

Durable coordination is the safest first cloud-private migration surface because it can centralize planning state without centralizing execution authority.

This package already owns generic work-loop concepts:

- durable work plans
- review and approval states
- claims, leases, heartbeats, release, and completion
- token-scoped clients
- hosted API and optional UI surfaces
- separation between coordination state and downstream execution

The first hosted target should therefore be shared planning state, not product deployment or local action execution.

## Non-Goals

- No hosted local command execution.
- No direct local shell access.
- No device or local environment control.
- No sensitive local-adapter execution.
- No private account writes.
- No raw sensitive execution traces.
- No credential movement.
- No public product launch contract.
- No deployment-specific policy embedded in this public repository.

## Intended Actors

- desktop orchestrator instance
- laptop orchestrator instance
- cloud orchestrator instance
- local runner
- cloud worker
- human operator

## Core Capabilities

- shared work items
- planning packets
- job queues
- leases and claims
- run status
- sanitized outcome summaries
- artifact references
- approval references
- audit metadata
- instance and capability registration
- stale lease detection
- duplicate-work prevention through idempotency keys

## What Must Stay Outside The Hosted Service

- local command execution
- local workspace access
- private account sessions
- device or private-network adapters
- sensitive local integrations
- raw local runner output
- credential files, tokens, cookies, private keys, connection URLs, and webhook URLs
- private deployment topology and host details
- private filesystem paths

## Cloud-Safe Data Classes

The hosted service may store:

- work item IDs, titles, objectives, priorities, status, target aliases, and trust-zone labels
- planning-only packets with no sensitive raw payload
- task envelope metadata
- capability names and trust-boundary descriptors
- lease IDs, claimant instance IDs, heartbeat timestamps, and stale markers
- sanitized outcome summaries
- artifact references to redacted or public-safe artifacts
- approval references and approval decision metadata
- audit metadata, hashes, and opaque local receipt references
- redaction policies and idempotency keys

## Forbidden Data Classes

The hosted service must not store:

- secret values or bearer credentials
- raw sensitive execution traces
- private account contents
- private local adapter payloads
- device identifiers or private-network identifiers
- unredacted customer, employer, or tenant-confidential data
- private filesystem paths or host-specific setup details

## Minimum Authentication And Authorization

- Every hosted mutation requires authenticated actor identity.
- Human users use session auth with secure cookies in hosted mode.
- Machine clients use token-scoped access.
- Tokens must be scoped to explicit operations such as submit, claim, heartbeat, complete, approve, or read.
- Broad personal tokens are forbidden.
- Client tokens must have owner, purpose, scope, expiration or rotation guidance, and revocation support.
- Instance registration must bind an instance ID to an identity reference and allowed maximum job class.
- Authorization must prevent hosted workers from claiming local-only execution jobs.

## Audit Requirements

Audit records must capture:

- work item creation and updates
- status transitions
- claim, heartbeat, release, stale-lease, completion, failure, and cancellation events
- approval request and decision metadata
- actor or instance identity
- authority class and job class
- redaction policy applied
- artifact references and local receipt hashes
- denied or forbidden transition attempts

Audit records must avoid credentials, raw sensitive traces, private adapter output, and private account contents.

## Local-Runner Boundary

The hosted service coordinates. It does not execute local work.

Local runners must:

- poll or claim work outbound from the local environment
- advertise capabilities without exposing private identifiers
- reject work above their maximum job class
- enforce local authority policy before using sensitive adapters
- require explicit approval for protected writes or actions
- return only sanitized outcomes to the hosted service
- keep raw local receipts outside the hosted service
- support synthetic planning-only dry-runs before live adapters are enabled

Hosted deployments must disable local execution capabilities by default and fail closed when unsafe execution flags are enabled.
