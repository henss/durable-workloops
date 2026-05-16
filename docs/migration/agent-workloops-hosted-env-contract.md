# Agent-Workloops Hosted Environment Contract

## Purpose

Define public-safe hosted-runtime configuration expectations for cloud-private coordination deployments. This document lists only generic configuration keys and safety behavior. Private deployment notes and secret names belong outside this public repository.

## Existing Public-Safe Configuration Keys

- `AWL_HOST`
- `AWL_PORT`
- `AWL_PUBLIC_BASE_URL`
- `AWL_TRUST_PROXY`
- `AWL_DATA_DIR`
- `AWL_FORCE_APPROVAL_REQUIRED`
- `AWL_LOCK_TIMEOUT_MS`
- `AWL_COOKIE_SECURE`
- `AWL_COOKIE_SAME_SITE`
- `AWL_SESSION_TTL_MS`
- `AWL_PERSISTENCE_KIND`
- `AWL_WEB_DIST_DIR`
- `AWL_WORK_ITEM_STORE`
- `AWL_WORK_ITEM_STORE_FILE`
- `AWL_WORK_ITEM_STORE_DATABASE_URL`
- `AWL_ALLOW_EPHEMERAL_WORK_ITEM_STORE`

## Hosted Safety Keys

- `AWL_HOSTED_MODE`
- `AWL_ENABLE_LOCAL_COMMAND_EXECUTION`
- `AWL_ENABLE_WORKSPACE_PATH_EXECUTION`
- `AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD`
- `AWL_ALLOW_BROAD_PERSONAL_TOKENS`
- `AWL_MAX_JOB_CLASS`
- `AWL_LOG_REDACTION_MODE`
- `AWL_REQUIRE_INSTANCE_REGISTRATION`

The startup guard currently enforces:

- `AWL_HOSTED_MODE`
- `AWL_ENABLE_LOCAL_COMMAND_EXECUTION`
- `AWL_ENABLE_WORKSPACE_PATH_EXECUTION`
- `AWL_ALLOW_RAW_PRIVATE_LOG_UPLOAD`
- `AWL_ALLOW_BROAD_PERSONAL_TOKENS`
- `AWL_MAX_JOB_CLASS`
- `AWL_WORK_ITEM_STORE`
- `AWL_WORK_ITEM_STORE_FILE`
- `AWL_WORK_ITEM_STORE_DATABASE_URL`
- `AWL_ALLOW_EPHEMERAL_WORK_ITEM_STORE`

Private deployments may need additional secret-backed configuration. Those names and values should be documented outside this public repository.

## Server-Only Config

Server-only config includes persistence credentials, bootstrap credentials, signing keys, session secrets, and machine-token material. These must never be exposed to client-side bundles or logs.

## Client-Safe Config

Client-safe config is limited to reviewed public routing and UI behavior such as the public base URL. No credentials, session material, database connection details, or runner identifiers are client-safe.

## Persistence Config

Hosted deployments should use a reviewed database-backed persistence mode. Filesystem persistence is acceptable only for local development or explicitly approved single-node private trials.

## Work Item Store Config

Supported work item store selectors:

- `AWL_WORK_ITEM_STORE=memory`: local tests and development only by default.
- `AWL_WORK_ITEM_STORE=file`: JSON file-backed storage. Requires `AWL_WORK_ITEM_STORE_FILE`.
- `AWL_WORK_ITEM_STORE=database`: reserved for a future database adapter. Requires `AWL_WORK_ITEM_STORE_DATABASE_URL` once implemented.

Hosted mode must fail closed when:

- `AWL_WORK_ITEM_STORE` is missing.
- `AWL_WORK_ITEM_STORE` is unknown.
- memory storage is selected without `AWL_ALLOW_EPHEMERAL_WORK_ITEM_STORE=true`.
- file storage is selected without `AWL_WORK_ITEM_STORE_FILE`.
- database storage is selected without `AWL_WORK_ITEM_STORE_DATABASE_URL`.

Configuration values must not be logged. Error messages may name missing or invalid config keys, but must not include values.

## Auth And Session Config

- Secure cookies must be enabled behind HTTPS.
- Same-site cookie behavior must be explicit.
- Session lifetime must be bounded.
- Bootstrap credentials must be temporary and rotated or removed after setup.
- Hosted API mutation must require authenticated user or scoped machine token.

## Client-Token Config

- Client tokens must be scoped by operation.
- Tokens must be revocable.
- Tokens must be associated with a user, instance, purpose, and allowed max job class.
- Hosted runtime must not accept broad personal tokens.

Work item route scopes:

- `work_items:read`
- `work_items:create`
- `work_items:transition`
- `work_items:claim`
- `work_items:heartbeat`
- `work_items:complete`
- `work_items:cancel`

Plan scopes are not sufficient for work item routes. Any compatibility bridge must be explicit, temporary, and disabled for hosted mode by default.

## Public Base URL

- The public base URL must be explicit in hosted mode.
- Localhost defaults are development-only.
- Redirects, cookies, and generated links must use the configured public base URL.

## Logging And Redaction Config

- Hosted logging must run with redaction enabled.
- Logs must redact authorization headers, cookies, token-like fields, passwords, credentials, connection URLs, webhook URLs, and raw sensitive payloads.
- Raw sensitive execution traces must not be uploaded.

## Hosted Execution Feature Flags

Hosted runtime must use fail-closed feature flags:

- local command execution disabled
- workspace-path execution disabled
- raw sensitive trace upload disabled
- broad personal tokens disabled
- maximum job class limited to `planning_only` or `read_only_sanitized` unless a policy layer is explicitly wired

## Fail-Closed Startup Rules

Hosted runtime must refuse to start if local command execution is enabled.

Hosted runtime must refuse to start if workspace-path execution is enabled.

Hosted runtime must refuse to start if raw sensitive trace upload is enabled.

Hosted runtime must not accept broad personal tokens.

Hosted runtime treats missing safety flags as unsafe when `AWL_HOSTED_MODE=true`.

Hosted runtime refuses max job classes above `planning_only` or `read_only_sanitized` until a policy layer is explicitly wired.

Hosted runtime refuses unsafe work item storage settings before server startup.

Hosted runtime should also refuse to start when:

- hosted mode lacks explicit safety flags
- persistence is filesystem-backed without an explicit development override
- public base URL is missing or development-like
- secure cookies are disabled in non-local hosted mode
- maximum job class exceeds hosted policy limits without a policy layer
