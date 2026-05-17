# Database Work Item Store Contract

## Purpose

Define the public-safe contract a cloud-grade database adapter must satisfy to back the hosted `WorkItemStore`. The actual driver wiring, migration scripts, and infrastructure provisioning are outside this contract and outside this repository.

## Status

A real database adapter is not wired in this phase. The runtime exposes the cloud-grade profile (`AWL_WORK_ITEM_STORE=database`) and a `DatabaseWorkItemStore` class behind a small persistence-port interface. Selecting `database` at startup without a wired adapter MUST fail fast with an `adapter-not-implemented` error. The server MUST NOT silently degrade to a non-cloud-grade store.

A reviewed cloud-grade adapter is a hard prerequisite for hosted multi-node rollout.

## Persistence Port

The persistence port is the only surface the work-item store calls into. Driver-specific code lives behind this port.

Operations:

- `insert(record)`
- `findById(id)`
- `findByIdempotencyKey(idempotencyKey)`
- `list()`
- `compareAndSet(id, expectedVersion, next)`

The `compareAndSet` primitive is mandatory. It is the source of claim/lease atomicity. The adapter MUST NOT persist `next` if the stored version is not equal to `expectedVersion`; it MUST instead surface a typed conflict error so the caller can retry against a bounded budget.

## Record Shape

Persisted work-item records carry:

- `id` (primary key)
- `version` (monotonic, used for compare-and-set)
- `idempotency_key`
- `record` (the full validated work-item value)

The work-item value itself is validated by the schema in `@agent-workloops/api`. The adapter MUST treat `record` as opaque except for the fields required by indexes and lookups.

## Required Indexes

A cloud-grade adapter MUST provide:

- a primary unique index on `id`
- a secondary unique index on `idempotency_key`
- a query path for listing in `created_at` order (either an index on a `record.created_at` projection or sufficient query support to return ordered results without scanning the entire collection)

These indexes guarantee that:

- create-by-id detects collisions cheaply
- idempotent retries do not produce duplicate records
- list views remain responsive as the work-item population grows

## Compare-And-Set Requirements

For each lifecycle transition the work-item store performs the following sequence:

1. Load the current record with its `version`.
2. Compute the next record using the pure lifecycle helpers from `@agent-workloops/api`. The helpers throw on invalid transitions.
3. Call `compareAndSet(id, currentVersion, next)`.
4. If the adapter throws `WorkItemPersistenceConflict`, retry up to a bounded budget. After the budget is exhausted, surface the conflict.

This sequence makes two independent claims atomic at the adapter layer: only one of them can win the compare-and-set, regardless of which client arrived first.

## Driver Notes (non-binding)

For a relational engine the adapter would typically:

- model a `work_items` table with `id text primary key`, `version int not null`, `idempotency_key text unique`, and `record jsonb not null`;
- implement `compareAndSet` as `update ... set ... where id = $1 and version = $2`, treating zero rows-affected as a conflict;
- wrap any multi-step transition in a single transaction;
- enforce row-level locking only as a defense-in-depth measure; correctness comes from the version check, not the lock.

For a document engine the adapter would typically:

- model one document per work item, with `_id = id`, `version`, `idempotency_key`, and `record`;
- implement `compareAndSet` as `findOneAndUpdate({ _id, version }, { $set: { ... }, $inc: { version: 1 } })`, treating no-match as a conflict;
- create unique indexes on `_id` and `idempotency_key`.

The adapter MUST NOT log connection strings, credential material, or persisted record bodies. Error messages may name config keys but MUST NOT print their values.

## Migration And Provisioning

Migrations, schema creation, indexes, and credential provisioning are explicitly out of scope for this contract. Deployment automation handles them. The work-item store assumes the schema and indexes already exist; it does not create them at runtime.

## Test Strategy Without A Live Database

Contract tests in this repository use an in-process implementation of the persistence port. That implementation enforces the same compare-and-set semantics a real driver must enforce, so the cloud-grade contract is exercised without a live database.

The in-process implementation is NOT a deployable store. It is exported as a test helper only.

## Production Readiness

This adapter contract is gated by the production readiness checklist in `work-item-auth-and-storage-contract.md`. Phase 1D does not deploy, does not connect to a live database, and does not run migrations.
