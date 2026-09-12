---
name: bullmq-patterns
description: Retired queue implementation; directs legacy references to Clarify.pm alarms.
---
Catalog: `stateful-shapes` covers durable workflows; this is a legacy repo redirect.

BullMQ and Redis were retired in the September 2026 Cloudflare migration. Do not add
their packages, queue accessors, worker processes or Render services back.
Current processing owners are packages/api/src/jobs/state.ts, runner.ts and the
Workspace alarm handler. Read AGENTS.md and docs/clarify-hosting.md before queue work.
Retain the note generation, durable retry and atomic next-step invariants.
