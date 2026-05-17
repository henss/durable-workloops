-- Postgres schema artifact for the cloud-grade work item store and the
-- append-only work item audit stream.
--
-- This file is a public-safe reference artifact. It is NOT auto-applied at
-- runtime. Operators wire it into their own migration tooling. No connection
-- string, secret value, or environment-specific detail is encoded here.
--
-- Conventions:
--   * The work item record itself is stored as a single jsonb column. The
--     record is the source of truth; the dedicated columns are derived
--     fields, kept in sync by the persistence adapter to support indexed
--     queries (status filters, trust zone filters, idempotency lookups,
--     stale-lease scans).
--   * `version` is a monotonic per-row counter used for compare-and-set
--     updates. The adapter only persists a new revision when the stored
--     version matches the expected version it loaded.
--   * `idempotency_key` is unique across the table. The persistence adapter
--     uses it to return the already-persisted work item on retried creates.
--   * The audit table is append-only. The adapter only emits INSERT and
--     SELECT statements against it; there is no UPDATE or DELETE path.

CREATE TABLE IF NOT EXISTS work_items (
  id               TEXT        PRIMARY KEY,
  version          INTEGER     NOT NULL CHECK (version >= 1),
  idempotency_key  TEXT        NOT NULL,
  status           TEXT        NOT NULL,
  trust_zone       TEXT        NOT NULL,
  job_class        TEXT        NOT NULL,
  target_repo      TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  record           JSONB       NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS work_items_idempotency_key_uk
  ON work_items (idempotency_key);

CREATE INDEX IF NOT EXISTS work_items_status_idx
  ON work_items (status);

CREATE INDEX IF NOT EXISTS work_items_trust_zone_idx
  ON work_items (trust_zone);

CREATE INDEX IF NOT EXISTS work_items_job_class_idx
  ON work_items (job_class);

CREATE INDEX IF NOT EXISTS work_items_updated_at_idx
  ON work_items (updated_at);

-- Partial index used by the stale-lease scan path. Only includes rows where
-- a lease deadline is currently set, so the index stays small relative to
-- the whole table.
CREATE INDEX IF NOT EXISTS work_items_lease_expires_at_idx
  ON work_items (lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS work_item_audit_events (
  id            TEXT        PRIMARY KEY,
  work_item_id  TEXT        NULL,
  event_type    TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL,
  record        JSONB       NOT NULL
);

CREATE INDEX IF NOT EXISTS work_item_audit_events_work_item_id_idx
  ON work_item_audit_events (work_item_id);

CREATE INDEX IF NOT EXISTS work_item_audit_events_event_type_idx
  ON work_item_audit_events (event_type);

CREATE INDEX IF NOT EXISTS work_item_audit_events_created_at_idx
  ON work_item_audit_events (created_at);

-- Operators MAY additionally REVOKE UPDATE, DELETE on
-- work_item_audit_events from the role used by the application to enforce
-- the append-only contract at the database level. The application contract
-- already enforces it at the adapter layer.
