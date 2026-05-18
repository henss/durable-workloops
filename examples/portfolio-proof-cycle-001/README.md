# Portfolio Proof Cycle 001 Active-Spine Proof

This directory contains a public-safe synthetic conformance proof for the hosted WorkLoop path. It uses no production deployment, cloud write, tracker adapter, customer data, credentials, or private repository names.

The proof fixture is `workloops-active-spine-conformance.json`. The focused server test `packages/server/src/portfolio-proof-cycle-001.test.ts` executes the fixture through submit, approval, claim, heartbeat, completion, and archive readback. AIQL-style review evidence is represented by `aiql-review-evidence.json` and attached to completion metadata plus WorkLoop decision evidence paths.

Known gap: the hosted API does not yet have a first-class review-evidence attachment or archive endpoint. For this proof, review evidence is routed through existing WorkLoop decision evidence paths and completion metadata.
