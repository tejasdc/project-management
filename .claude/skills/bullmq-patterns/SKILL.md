---
name: bullmq-patterns
description: "BullMQ job queue patterns for the PM Agent project. Use when writing new queues, workers, job processors, or modifying the async pipeline. Ensures consistency and avoids known pitfalls."
user_invocable: false
---

# BullMQ Job Queue Patterns

Reference guide for writing BullMQ code in this project. Follow these patterns to maintain consistency and avoid known pitfalls.

## Architecture

```
API Server (packages/api)                Worker Process (packages/api/src/worker.ts)
┌──────────────────────┐                 ┌──────────────────────────┐
│ Route handler         │                 │ Worker("notes-extract")  │
│   → capture service   │                 │ Worker("entities-organize")│
│     → queue.add()  ───┼──── Redis ────→ │ Worker("notes-reprocess") │
└──────────────────────┘                 └──────────────────────────┘
```

- Queues are defined in `packages/api/src/jobs/queue.ts`
- Processors are in `packages/api/src/jobs/*.ts`
- Worker startup is in `packages/api/src/worker.ts`

## Queue Definitions

### All queues are in `packages/api/src/jobs/queue.ts`

```typescript
// Queue names — ALWAYS use hyphens, NEVER colons
const notesExtractQueue = lazyQueue<NotesExtractJob>("notes-extract");
const entitiesOrganizeQueue = lazyQueue<EntitiesOrganizeJob>("entities-organize");
```

### Job data types are defined at the top of queue.ts

```typescript
type NotesExtractJob = { rawNoteId: string };
type EntitiesOrganizeJob = { rawNoteId: string; entityIds: string[] };
type NotesReprocessJob = { rawNoteId: string; requestedByUserId?: string };
```

### Lazy queue pattern for Redis-optional API

The API server works without Redis (queues return `null`):

```typescript
function lazyQueue<T>(name: string) {
  let q: Queue<T> | null = null;
  return () => {
    if (!isRedisConfigured()) return null;
    if (!q) q = new Queue<T>(name, { connection: getRedisConnection()! });
    return q;
  };
}
```

Always check for `null` when adding jobs:

```typescript
const queue = getNotesExtractQueue();
if (!queue) {
  logger.warn({ rawNoteId }, "Redis unavailable — note saved but not queued");
  return; // graceful degradation
}
```

## Connection Configuration

### Redis connection — CRITICAL settings

```typescript
const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,  // Required for BullMQ — default causes errors
  enableReadyCheck: false,
  lazyConnect: true,
});
```

**`maxRetriesPerRequest: null`** is mandatory — BullMQ requires this or it throws `MaxRetriesPerRequestError`.

### Redis/Valkey eviction policy

**MUST be `noeviction`** — if keys are evicted, BullMQ loses job data silently. Set in Redis config or Render dashboard.

## Adding Jobs

### Standard job addition pattern

```typescript
await queue.add(
  "notes-extract",              // job name (matches queue name)
  { rawNoteId: note.id },       // typed job data
  {
    ...DEFAULT_JOB_OPTS,         // removeOnComplete: true, removeOnFail: 500
    jobId: note.id,              // deduplication key
    attempts: 5,                 // retry count
    backoff: {
      type: "exponential",
      delay: 2000 + jitter(),    // base delay + random 0-500ms
    },
  }
);
```

### Default job options

```typescript
const DEFAULT_JOB_OPTS = {
  removeOnComplete: true,   // clean up successful jobs immediately
  removeOnFail: 500,        // keep last 500 failed jobs for debugging
} as const;
```

### Jitter for retry thundering herd prevention

```typescript
function jitter() {
  return Math.floor(Math.random() * 500);
}
```

### Retry configuration guidelines

| Pipeline | Attempts | Backoff | Rationale |
|----------|----------|---------|-----------|
| Extraction (AI call) | 5 | exponential 2s + jitter | AI API may be temporarily unavailable |
| Organization (AI call) | 5 | exponential 2s + jitter | Same as extraction |
| Reprocess (internal) | 3 | exponential 2s | Faster feedback for user-initiated |

## Worker Definitions

### Workers are created in `packages/api/src/worker.ts`

```typescript
const workers = [
  new Worker("notes-extract", notesExtractProcessor, {
    connection,
    concurrency: getConcurrency(5),
  }),
  new Worker("entities-organize", entitiesOrganizeProcessor, {
    connection,
    concurrency: getConcurrency(5),
  }),
];
```

### Concurrency is configurable via env var

```typescript
function getConcurrency(defaultValue: number) {
  const raw = process.env.BULLMQ_CONCURRENCY;
  if (!raw) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultValue;
}
```

### Worker event handlers

```typescript
function wire(worker: Worker) {
  worker.on("completed", (job) => {
    createJobLogger(job).info({ queue: worker.name }, "job completed");
  });
  worker.on("failed", (job, err) => {
    if (job) createJobLogger(job).error({ queue: worker.name, err }, "job failed");
    else logger.error({ queue: worker.name, err }, "worker error");
  });
  worker.on("error", (err) => {
    logger.error({ err, queue: worker.name }, "worker error");
  });
}
```

## Processor Functions

### Processor signature

```typescript
import type { Job } from "bullmq";

export async function notesExtractProcessor(job: Job<NotesExtractJob>) {
  const { rawNoteId } = job.data;
  // ... processing logic
}
```

### Error handling in processors

```typescript
try {
  // ... processing
} catch (err) {
  // Store error for visibility
  await db.update(rawNotes)
    .set({ processingError: `extract_failed: ${err instanceof Error ? err.message : String(err)}` })
    .where(eq(rawNotes.id, rawNoteId));

  // Discard deterministic errors (don't retry)
  if (err instanceof ZodError) {
    await job.discard();
    return;
  }

  // Re-throw to trigger BullMQ retry
  throw err;
}
```

Key patterns:
- **Store errors** in the database for API visibility
- **Discard deterministic errors** (validation failures) — retrying won't help
- **Re-throw transient errors** (network, AI API) — BullMQ will retry with backoff

### Job chaining — one job triggers the next

```typescript
// In notes-extract processor, after creating entities:
const organizeQueue = getEntitiesOrganizeQueue();
if (organizeQueue) {
  await organizeQueue.add("entities-organize", {
    rawNoteId,
    entityIds: createdEntityIds,
  }, {
    ...DEFAULT_JOB_OPTS,
    jobId: rawNoteId,
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 + jitter() },
  });
}
```

## Graceful Shutdown

### SIGINT/SIGTERM handling in worker.ts

```typescript
async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  await Promise.allSettled(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
```

**Why `Promise.allSettled`:** If one worker fails to close, the others still get a chance.

**Why `connection.quit()`:** Cleanly closes the Redis connection (vs `disconnect()` which drops it).

## Testing

### Mock queues in tests

```typescript
vi.mock("../src/jobs/queue.js", () => ({
  getNotesExtractQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getEntitiesOrganizeQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  // ... all queue getters
  DEFAULT_JOB_OPTS: { removeOnComplete: true, removeOnFail: 500 },
  isRedisConfigured: () => false,
  getRedisConnection: () => null,
}));
```

### Job logging in tests

Use `createJobLogger(job)` from `packages/api/src/lib/logger.ts` — it creates a child logger with `jobId` and `jobName` context.

## Checklist for New Queues/Workers

- [ ] Queue name uses hyphens, never colons
- [ ] Job data type defined in `queue.ts`
- [ ] Lazy queue getter exported from `queue.ts`
- [ ] Processor function in `packages/api/src/jobs/`
- [ ] Worker registered in `worker.ts` with `wire()` call
- [ ] Job addition includes `DEFAULT_JOB_OPTS`, `jobId`, `attempts`, `backoff`
- [ ] Processor handles errors: stores in DB, discards deterministic, re-throws transient
- [ ] Database inserts inside processor use `.onConflictDoNothing()` for retry safety
- [ ] Queue getter returns `null` check at call site (Redis-optional API)
- [ ] Queue mock added to test setup

## Common Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Queue name with colons | Redis key structure breaks silently | Use hyphens: `notes-extract` |
| Missing `maxRetriesPerRequest: null` | `MaxRetriesPerRequestError` thrown | Set in connection config |
| Redis `maxmemory-policy` not `noeviction` | Job data silently evicted | Configure in Redis/Valkey |
| Missing `onConflictDoNothing()` in processor | Duplicate rows on retry | Add to all inserts in processors |
| Using `db` instead of `tx` in transaction | Query runs outside transaction | Always use `tx` parameter |
| Not checking queue getter for `null` | Crash when Redis unavailable | Guard with `if (!queue)` |

## Context7 Documentation

For up-to-date BullMQ API reference, use Context7 MCP:
1. `resolve-library-id` with query "bullmq"
2. `query-docs` with the resolved ID and your specific question
