# Database Work Item Store Contract

## Purpose

Define the public-safe contract a cloud-grade database adapter must satisfy to back the hosted `WorkItemStore`. The actual driver wiring, migration scripts, and infrastructure provisioning are outside this contract and outside this repository.

## Status

A Postgres-backed adapter is implemented and is selectable via the cloud-grade profile (`AWL_WORK_ITEM_STORE=database` + `AWL_WORK_ITEM_STORE_DATABASE_KIND=postgres`). The runtime exposes:

- `DatabaseWorkItemStore` — orchestration layer that drives the compare-and-set lifecycle through the persistence port.
- `PostgresWorkItemPersistenceAdapter` — Postgres implementation of the port (Phase 1E). All SQL is parameterized and the database URL is never logged.
- `PostgresWorkItemAuditStore` — Postgres-backed append-only audit stream (Phase 1E).

MongoDB and any other database kind are intentionally not implemented in this phase. Selecting them MUST fail fast with `WorkItemPersistenceAdapterNotImplementedError`. The server MUST NOT silently degrade to a non-cloud-grade store under any configuration.

A reviewed cloud-grade adapter is still a hard prerequisite for hosted multi-node rollout — the Postgres adapter ships with contract tests against an injected SQL executor but has not been validated against a live database in this phase.

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

## Postgres Adapter (Phase 1E)

Row shape used by `PostgresWorkItemPersistenceAdapter`:

| column            | type        | purpose                                                                          |
|-------------------|-------------|----------------------------------------------------------------------------------|
| `id`              | TEXT PK     | primary key, mirrors the work item id                                            |
| `version`         | INTEGER     | monotonic counter used for compare-and-set                                       |
| `idempotency_key` | TEXT UNIQUE | unique per row; powers idempotent create retries                                 |
| `status`          | TEXT        | derived from `record.status`, indexed for status filters                         |
| `trust_zone`      | TEXT        | derived, indexed for zone-scoped queries                                         |
| `job_class`       | TEXT        | derived, indexed for job-class filters                                           |
| `target_repo`     | TEXT        | derived, useful for tenancy filters                                              |
| `created_at`      | TIMESTAMPTZ | derived from `record.created_at`, drives ordered listings                        |
| `updated_at`      | TIMESTAMPTZ | derived, indexed                                                                 |
| `lease_expires_at`| TIMESTAMPTZ | derived from `record.lease.expires_at`, partial-indexed for stale-lease scans    |
| `record`          | JSONB       | the full validated work-item record; source of truth                             |

Compare-and-set is implemented as a single statement:

```
UPDATE work_items
SET version = $1, idempotency_key = $2, status = $3, trust_zone = $4,
    job_class = $5, target_repo = $6, updated_at = $7,
    lease_expires_at = $8, record = $9::jsonb
WHERE id = $10 AND version = $11
RETURNING id;
```

If zero rows are returned, the adapter raises `WorkItemPersistenceConflict`. The orchestrating `DatabaseWorkItemStore` retries against its bounded budget and surfaces the conflict afterwards.

Indexes provided by the schema artifact:

- unique `work_items_idempotency_key_uk` on `idempotency_key`
- secondary indexes on `status`, `trust_zone`, `job_class`, `updated_at`
- partial index `work_items_lease_expires_at_idx` on `lease_expires_at` where it is not NULL

The schema artifact is `docs/migration/postgres-work-item-store-schema.sql`. It is a reference DDL file; the runtime does not auto-apply it.

The adapter:

- MUST NOT log connection strings, query parameters, or persisted record bodies.
- normalizes driver errors to opaque adapter-level messages so that input payloads cannot leak via stack traces.
- re-validates every returned row through the work-item schema and fails closed on malformed rows.

## Other Engines

MongoDB and any other database kind are intentionally unimplemented in this phase. Selecting `AWL_WORK_ITEM_STORE_DATABASE_KIND=mongodb` (or any other value) MUST throw `WorkItemPersistenceAdapterNotImplementedError`. There is no silent fallback.

For future engines the adapter is expected to follow the same shape: a small `WorkItemPersistenceAdapter` implementation, parameterized queries, compare-and-set semantics on the version column, and unique indexes on `id` and `idempotency_key`.

## Migration And Provisioning

Migrations, schema creation, indexes, and credential provisioning are explicitly out of scope for this contract. Deployment automation handles them. The work-item store assumes the schema and indexes already exist; it does not create them at runtime.

## Test Strategy Without A Live Database

Contract tests in this repository use an in-process implementation of the persistence port. That implementation enforces the same compare-and-set semantics a real driver must enforce, so the cloud-grade contract is exercised without a live database.

The Postgres adapter (Phase 1E) is tested through an injected `PostgresExecutor` stub that records the SQL text and parameters and returns canned rows. No test in this repository connects to a live Postgres instance or runs a migration.

The in-process and stub implementations are NOT deployable stores. They are exported as test helpers only.

## Production Readiness

This adapter contract is gated by the production readiness checklist in `work-item-auth-and-storage-contract.md`. Phase 1D defined the contract; Phase 1E added the Postgres adapter and the append-only audit store but did not deploy, did not connect to a live database, and did not run migrations.
