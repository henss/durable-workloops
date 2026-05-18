# Portfolio Proof Cycle 001 Active-Spine Proof

This directory contains a public-safe synthetic conformance proof for the hosted WorkLoop path. It uses no production deployment, cloud write, tracker adapter, customer data, credentials, or private repository names.

The proof fixture is `workloops-active-spine-conformance.json`. The focused server test `packages/server/src/portfolio-proof-cycle-001.test.ts` executes the fixture through submit, approval, claim, heartbeat, completion, first-class review-evidence attachment, list readback, archive readback, and audit readback. Independent AIQL-compatible review evidence is represented by `workloops-independent-aiql-review.json` and attached through `POST /api/v1/plans/:planId/review-evidence`.

The review evidence is still synthetic and public-safe. WorkLoops owns the attachment/readback contract only; callers own AIQL, manual, or other review execution.
