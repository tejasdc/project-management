# Testing Architecture

## Feature Overview

End-to-end local testing infrastructure for the project management system. The goal is to enable high-confidence verification of all application flows — including async job processing — without touching production, and to support agentic development workflows where AI agents can verify their own changes.

## Background

The system has a critical async pipeline: note capture → BullMQ queue → worker extracts entities via Claude API → second queue → worker organizes entities. This pipeline spans Postgres, Redis/BullMQ, and the Anthropic API. Currently, tests mock the queue layer entirely, leaving the worker→DB flow untested.

### Current State
- **Vitest** as test runner, configured per-package via `vitest.workspace.ts`
- **Testcontainers** spins up real Postgres in Docker for integration tests (`tests/global-setup.ts`)
- **Table truncation** between tests for isolation (`tests/setup.ts`)
- **Factory functions** for seeding test data (`tests/factories.ts`)
- **Queue mocking** — BullMQ queues are mocked via `vi.mock()`, so worker processing is never tested
- **No Redis in tests** — `REDIS_URL` is set to a dummy value
- **No AI calls in tests** — extraction/organization functions are never invoked
- **4 existing test files**: auth middleware, capture idempotency, review resolution, shared schemas

### What's Missing
- Worker/processor logic is untested (the entire extract → organize pipeline)
- Queue integration (enqueue → worker picks up) is untested
- SSE event publishing is untested
- No post-deploy smoke tests
- No way for agents to verify full-flow correctness after changes

## Requirements

1. **Full local E2E testing** — test the complete note → extract → organize pipeline locally
2. **Real infrastructure** — use real Postgres + real Redis (via Testcontainers), not mocks
3. **AI flexibility** — mock AI by default; support real AI calls via flag
4. **Zero production dependency** — all tests run locally with no external services
5. **Agent-friendly** — tests should be runnable via CLI with parseable output
6. **Fast feedback** — targeted tests should complete in seconds, full suite in under 60s
7. **No database pollution** — ephemeral containers, torn down after each run

## Assumptions

1. Docker is available on the development machine (already true — Testcontainers Postgres works)
2. The Anthropic API key is available when running real AI tests (via `ANTHROPIC_API_KEY` env var)
3. BullMQ workers can run in-process alongside tests (they're just Node.js event listeners on Redis)
4. Test containers add ~3-5s startup overhead (acceptable for the confidence gained)

## Brainstorming & Investigation Findings

### How Testcontainers Works
Testcontainers is a library that starts real Docker containers during test runs. The project already uses it for Postgres (`@testcontainers/postgresql`). Adding Redis follows the exact same pattern — `GenericContainer("redis:7-alpine")` starts a real Redis server on a random port. It's free, runs locally, and provides full parity with production Redis.

### BullMQ Is Not a Separate Service
BullMQ is a Node.js library, not a standalone server. It uses Redis as its backing store. `Queue.add()` writes job data to Redis keys; `Worker` polls those keys and invokes processor functions. Giving BullMQ a real Redis container means it works identically to production — no mocking needed.

### Processor Functions Are Mostly Self-Contained
`notesExtractProcessor` and `entitiesOrganizeProcessor` are standalone async functions that accept a BullMQ `Job` object. However, they are **not fully Redis-independent**:
- `notesExtractProcessor` calls `getEntitiesOrganizeQueue()` to enqueue the next job (requires Redis)
- Both processors call `tryPublishEvent()` which uses Redis pub/sub for SSE

This means:
- Direct processor calls (Layer 1) require either a real Redis connection OR stubbing of `getEntitiesOrganizeQueue` and `tryPublishEvent`
- Full queue integration (Layer 2) requires real Redis — no stubbing needed

### AI Mocking Strategy
The AI functions (`extractEntities`, `organizeEntities`) call the Anthropic API. For tests:
- **Mock by default**: Replace these with functions returning deterministic results. Tests are fast, free, and deterministic.
- **Real AI via flag**: When `TEST_WITH_REAL_AI=true` is set, use actual Anthropic API calls. Validates prompt/schema contract. Costs tokens, slower, non-deterministic output (but schema is deterministic).

### SSE Events Use Redis Pub/Sub
The `events.ts` service uses Redis pub/sub for SSE. With a real Redis container, SSE event publishing works naturally. Tests can subscribe to the channel and verify events are emitted.

## Options Explored

### Option A: Keep Mocking Queues (Status Quo)
- **Pros**: Simple, fast, no additional containers
- **Cons**: Doesn't test worker logic, queue integration, or the extract→organize chain. The BullMQ queue name colon bug (commit a7dbb48) would not have been caught.
- **Verdict**: Insufficient for the confidence level we need

### Option B: Direct Processor Calls (No Redis)
- **Pros**: Tests 95% of business logic without Redis. Simple setup.
- **Cons**: Doesn't test queue delivery, job serialization, worker registration, or SSE events.
- **Verdict**: Good as a supplementary layer but not sufficient alone

### Option C: Full Local E2E with Testcontainers Redis + In-Process Workers
- **Pros**: Full parity with production. Tests the complete pipeline. Catches queue config bugs, serialization issues, worker registration. SSE events testable.
- **Cons**: ~3-5s added startup for Redis container. More complex test setup. Need to coordinate worker lifecycle.
- **Verdict**: Best confidence-to-complexity ratio. Recommended.

### Option D: Staging Environment on Render
- **Pros**: Tests deployment config, env vars, cross-service networking
- **Cons**: Preview environments require Professional plan ($19/user/month). Separate staging DB is $6/month. Slower feedback loop. Overkill for current scale.
- **Verdict**: Not needed. Local testing + read-only smoke tests cover our needs.

## Selected Option

**Option C: Full Local E2E with Testcontainers Redis + In-Process Workers**, supplemented by direct processor calls for fast unit-level tests.

### Trade-offs Accepted
- Docker must be running for integration tests (already a requirement)
- ~5s startup overhead for two containers (Postgres + Redis)
- Test setup is more complex than pure mocking (but one-time cost)
- Real AI tests require an API key and cost tokens (opt-in only)

## Architecture

### Testing Layers

```
Layer 1: Unit / Direct Processor Tests
  - Call notesExtractProcessor / entitiesOrganizeProcessor directly
  - Fake Job objects, mocked AI
  - Stub tryPublishEvent + getEntitiesOrganizeQueue (Redis side effects)
  - Tests: DB transactions, entity creation, tag handling, review queue logic
  - Speed: <1s per test
  - Requires: Postgres + Redis containers (Redis needed for SSE/queue side effects,
    unless fully stubbed)

Layer 2: Queue Integration Tests (PRIMARY LAYER)
  - Full flow: captureNote() → queue → worker → entities in DB
  - Real Redis + BullMQ, mocked AI
  - Tests: Queue delivery, job serialization, worker processing, SSE events
  - Speed: 1-3s per test (waiting for async job completion)
  - Requires: Postgres + Redis containers

Layer 3: AI Integration Tests (opt-in)
  - Same as Layer 2 but with real Anthropic API calls
  - Tests: Prompt/schema contract, extraction quality
  - Assertions: schema validity + invariants (entity count, type presence), NOT exact text
  - Speed: 3-10s per test (API latency)
  - Requires: Postgres + Redis containers + ANTHROPIC_API_KEY
  - Gated by: TEST_WITH_REAL_AI=true env var
  - Needs larger timeouts and flake quarantine handling

Layer 4: Post-Deploy Smoke Tests (future, out of scope for now)
  - Read-only checks against live deployment
  - Health check, auth validation, list endpoints
  - No write operations
```

### Test Infrastructure Design

#### Global Setup (`tests/global-setup.ts`)

```
Start Postgres container (existing)
Start Redis container (new)
Run migrations against Postgres (existing)
Set DATABASE_URL and REDIS_URL env vars
Export teardown function that stops both containers
```

#### Per-Test Setup (`tests/setup.ts`)

```
Truncate all tables (existing)
Flush Redis (new — FLUSHDB to clear queues between tests)
```

#### Worker Lifecycle Helper (`tests/worker-helper.ts`)

```
startTestWorkers():
  - Create BullMQ Workers for notes-extract, entities-organize, notes-reprocess
  - Connect to test Redis
  - Return workers array + a waitForJob(queueName, timeout) utility

stopTestWorkers():
  - Close all workers gracefully

waitForJob(queueName, predicate, timeout):
  - Subscribe to BullMQ job completed/failed events
  - Resolve when the matching job completes or reject on timeout
  - Critical for E2E tests — lets us await async processing
```

#### AI Mock (`tests/ai-mock.ts`)

```
mockExtractEntities():
  - Returns a deterministic ExtractionResult matching the schema
  - Configurable: can set entity count, types, confidence levels
  - Example: 1 task entity with high confidence, "Fix login bug"

mockOrganizeEntities():
  - Returns a deterministic OrganizationResult
  - Configurable: project assignment, epic assignment

When TEST_WITH_REAL_AI=true:
  - Don't mock, let real functions execute
  - Requires ANTHROPIC_API_KEY in environment
```

#### Factory Additions (`tests/factories.ts`)

```
Existing: createTestUser, createTestApiKey, createTestEntity, etc.

New additions:
  createTestProject() — already exists
  createTestEpic(projectId) — for organization tests
  captureAndProcessNote(content, opts) — high-level helper that:
    1. Creates user + API key if not provided
    2. Calls captureNote()
    3. Waits for notes-extract job to complete
    4. Waits for entities-organize job to complete
    5. Returns { note, entities, reviewItems }
```

### File Structure

```
packages/api/tests/
  global-setup.ts        — Start Postgres + Redis containers, run migrations
  setup.ts               — Truncate tables + flush Redis between tests
  factories.ts           — Test data factories (extend existing)
  helpers.ts             — Request helpers (existing)
  worker-helper.ts       — NEW: Start/stop workers, waitForJob utility
  ai-mock.ts             — NEW: Deterministic AI response fixtures

  # Existing tests (keep as-is)
  auth-middleware.test.ts
  capture-idempotency.test.ts
  review-resolution.test.ts

  # New tests
  extract-processor.test.ts    — Layer 1: Direct processor call tests
  organize-processor.test.ts   — Layer 1: Direct processor call tests
  capture-to-entities.test.ts  — Layer 2: Full queue integration flow
  ai-extraction.test.ts        — Layer 3: Real AI contract tests (opt-in)
```

### Job Completion Synchronization

The trickiest part of async testing is knowing when a job has finished. Two approaches:

#### Approach A: QueueEvents (event-based)

BullMQ's `QueueEvents` class connects to Redis and listens for job lifecycle events.

**Critical gotcha**: QueueEvents must be created and `waitUntilReady()` BEFORE jobs are enqueued, otherwise you can miss the completed event and timeout forever. Create one `QueueEvents` instance per queue in `beforeAll`.

```
// Pseudocode
// In beforeAll — create BEFORE any jobs run
const extractEvents = new QueueEvents("notes-extract", { connection: redis });
await extractEvents.waitUntilReady();

// In test — register interest, then trigger the job
const jobDone = waitForJob(extractEvents, note.id, { timeout: 10_000 });
await captureNote({ input, capturedByUserId: user.id });
await jobDone;
```

**Important**: Always close QueueEvents in afterAll, or Vitest will hang.

#### Approach B: DB Polling (outcome-based) — RECOMMENDED

Skip QueueEvents entirely and poll the real DB outcomes. Simpler, no race conditions:

```
// Pseudocode
await captureNote({ input, capturedByUserId: user.id });

// Poll until note is marked processed (extract job completed)
await waitUntil(() => db.query.rawNotes.findFirst({
  where: and(eq(rawNotes.id, noteId), eq(rawNotes.processed, true))
}), { timeout: 10_000, interval: 100 });

// Then check entities were created (organize job completed)
await waitUntil(() => db.select().from(entities)
  .where(/* entitySourcesLinkedToNote */)
  .then(rows => rows.length > 0 ? rows : null),
  { timeout: 10_000, interval: 100 });
```

DB polling is preferred because:
- No race condition — the outcome persists in the DB regardless of timing
- Works even with `removeOnComplete: true` (which deletes job data from Redis)
- Simpler to debug — you can inspect the DB state on failure
- One less Redis connection to manage/close

### Dynamic Table Truncation

Replace the hardcoded table list in `setup.ts` with a dynamic query to prevent drift when schema changes:

```
// Pseudocode
const tables = await db.execute(sql`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
  AND tablename != '__drizzle_migrations'
`);
const tableNames = tables.rows.map(r => r.tablename).join(', ');
await db.execute(sql.raw(`TRUNCATE TABLE ${tableNames} CASCADE`));
```

### Known Gotchas & Mitigations

#### 1. Open Handle Leaks (will hang Vitest)

`services/events.ts` creates Redis pub/sub clients on first call to `tryPublishEvent()` and never closes them. BullMQ Workers and QueueEvents also hold Redis connections.

**Mitigation**: Add a `closeEventConnections()` function to `services/events.ts` that closes the pub/sub clients. Call it in test teardown alongside worker cleanup. The implementation should:
- Export a `closeEventConnections()` that calls `pub.quit()` and `sub.quit()`
- Reset the `wired` flag so connections can be re-established
- Be safe to call even if connections were never opened (no-op)

#### 2. Rate Limiter Interference

With real Redis, `tier2ApiKeyCaptureLimiter` becomes active in tests. Parallel or high-volume tests can hit unexpected 429s.

**Mitigation options** (pick one):
- A) Flush rate limit keys in `setup.ts` alongside FLUSHDB (simplest — FLUSHDB already handles this)
- B) Disable rate limiting when `NODE_ENV=test` (more targeted but adds conditional logic to prod code)
- C) Use per-test unique API keys (already done via factories — rate limits are per-key)

**Decision**: Option A — FLUSHDB between tests already clears rate limit state.

#### 3. Test Parallelism

`TRUNCATE` + `FLUSHDB` between tests is unsafe if Vitest runs test files in parallel (one file's truncation wipes another file's test data).

**Mitigation**: Set `fileParallelism: false` in the API package's vitest config for integration tests. Unit tests in `packages/shared` can still run in parallel since they don't share infrastructure.

#### 4. SSE Keepalive Interval Leak

The `/api/sse` route starts a `setInterval` for keepalive pings. If a test opens an SSE connection and doesn't abort it, the interval persists and prevents clean shutdown.

**Mitigation**: Any test that opens an SSE stream must `abort()` the request in `afterEach` or `afterAll`.

#### 5. Zero Entities Extracted Path

`notesExtractProcessor` marks the note as processed even if zero entities are extracted. It does NOT enqueue `entities-organize` when `createdEntityIds.length === 0`. Tests must not hang waiting for an organize job that will never arrive.

**Mitigation**: The `captureAndProcessNote` helper should check whether any entities were created before waiting for the organize job.

### Example E2E Test Flow

```
// Pseudocode: capture-to-entities.test.ts

describe("capture → extract → organize flow", () => {
  let workers;

  beforeAll(() => {
    // Mock AI to return deterministic results
    mockExtractEntities({ entities: [{ type: "task", content: "Fix login bug", ... }] });
    mockOrganizeEntities({ entityOrganizations: [{ projectId: project.id, ... }] });
    workers = startTestWorkers();
  });

  afterAll(() => stopTestWorkers(workers));

  it("processes a captured note into organized entities", async () => {
    const user = await createTestUser();
    const { plaintextKey } = await createTestApiKey({ userId: user.id });
    const project = await createTestProject();

    // Capture a note via the API
    const res = await app.request("/api/notes/capture", {
      method: "POST",
      headers: { authorization: `Bearer ${plaintextKey}`, "content-type": "application/json" },
      body: JSON.stringify({ content: "Fix the login bug on Safari", source: "cli" }),
    });
    expect(res.status).toBe(201);
    const { note } = await res.json();

    // Wait for extract job via DB polling (race-free)
    await waitUntilNoteProcessed(note.id, { timeout: 10_000 });

    // Verify: entities were created
    const entityRows = await db.select().from(entities);
    expect(entityRows.length).toBe(1);
    expect(entityRows[0].type).toBe("task");
    expect(entityRows[0].content).toBe("Fix login bug");

    // Wait for organize job via DB polling
    await waitUntilEntitiesOrganized(entityRows[0].id, project.id, { timeout: 10_000 });

    // Verify: entity was assigned to project
    const organized = await db.query.entities.findFirst({ where: eq(entities.id, entityRows[0].id) });
    expect(organized.projectId).toBe(project.id);
  });

  it("handles zero entities extracted without hanging", async () => {
    // Mock AI to return empty entities array
    mockExtractEntities({ entities: [] });

    const user = await createTestUser();
    const { note } = await captureNote({
      input: { content: "random gibberish", source: "cli" },
      capturedByUserId: user.id,
    });

    // Wait for extract only — organize job won't be enqueued
    await waitUntilNoteProcessed(note.id, { timeout: 10_000 });

    // Verify: note processed but no entities
    const entityRows = await db.select().from(entities);
    expect(entityRows.length).toBe(0);
  });
});
```

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Full local E2E testing via Testcontainers (Postgres + Redis) | Maximum confidence without production dependency |
| 2 | BullMQ workers run in-process during tests | Simplest coordination; workers are just event listeners |
| 3 | AI mocked by default, real via TEST_WITH_REAL_AI flag | Fast/free by default, opt-in for contract validation |
| 4 | No staging environment needed currently | Local testing provides sufficient confidence at current scale |
| 5 | DB polling for job completion sync (not QueueEvents) | Race-free, simpler, works with removeOnComplete:true |
| 6 | Dynamic table truncation via pg_tables query | Prevents hardcoded list from drifting as schema evolves |
| 7 | Three testing layers: unit processors, queue integration, AI contract | Each layer adds coverage without redundancy |
| 8 | fileParallelism: false for API integration tests | Prevents cross-file data corruption from TRUNCATE/FLUSHDB |
| 9 | Add closeEventConnections() to services/events.ts | Required to prevent open Redis handles from hanging Vitest |
| 10 | FLUSHDB between tests clears rate limit state | Simplest approach; no need for NODE_ENV conditionals |
| 11 | Skills/hooks for agent workflow (future) | Not designed yet; will be addressed after infrastructure is in place |

## Implementation Plan

### Phase 1: Test Infrastructure
1. Add `closeEventConnections()` to `services/events.ts` — reset pub/sub clients for clean teardown
2. Update `global-setup.ts` — add Redis container alongside Postgres
3. Update `setup.ts` — add Redis FLUSHDB, switch to dynamic table truncation
4. Set `fileParallelism: false` in API vitest config
5. Create `worker-helper.ts` — worker lifecycle management:
   - `startTestWorkers()`: create BullMQ Workers for all 3 queues
   - `stopTestWorkers()`: close workers + event connections gracefully
   - `waitUntilNoteProcessed(noteId, timeout)`: DB polling helper
   - `waitUntilEntitiesCreated(noteId, timeout)`: DB polling helper
6. Create `ai-mock.ts` — deterministic AI response fixtures with `vi.mock()` for extraction + organization modules
7. Extend `factories.ts` — add `createTestEpic`, `captureAndProcessNote` helpers

### Phase 2: Write Core Tests
1. `extract-processor.test.ts` — Layer 1: Direct processor call tests
   - Happy path: note → entities created, tags attached, review items queued
   - Zero entities extracted: note marked processed, no organize job
   - Low confidence: review queue items created
   - Error handling: processing error persisted on failure
   - Deterministic Zod error: job discarded (no retries)
2. `organize-processor.test.ts` — Layer 1: Direct processor call tests
   - Happy path: entities assigned to project/epic
   - Low confidence assignments: review items created instead
   - Duplicate detection: review item with similarity score
   - Epic creation suggestion: project-scoped review item
3. `capture-to-entities.test.ts` — Layer 2: Full E2E queue integration
   - Happy path: capture → extract → organize, verify DB outcomes
   - Zero entities path: capture → extract only, no hang
   - Concurrent captures: N notes, all processed
   - Error recovery: extract fails once, retries, succeeds
   - Redis-unavailable degradation: note saved, processingError set
4. SSE event tests — verify events emitted during processing
   - Open SSE stream, capture note, assert entity:created event received
   - Abort stream in cleanup to prevent keepalive leak

### Phase 3: AI Contract Tests
1. `ai-extraction.test.ts` — real AI extraction with known inputs (Layer 3)
   - Send well-known note content, validate response schema
   - Assert invariants: entity count > 0, valid types, confidence in range
   - Gated by `TEST_WITH_REAL_AI=true`
   - Larger timeouts (30s), flake-tolerant assertions (schema, not exact text)
2. `ai-organization.test.ts` — real AI organization with known inputs (Layer 3)
   - Pre-create project + entities, validate organization response schema

### Phase 4: Agent Workflow Integration (future)
1. Testing skill/hook for agent self-verification
2. Pre-commit or pre-deploy test triggers

## Review History

### Review 1: Codex (2025-02-08)
Key findings incorporated:
- Processors have Redis side effects (tryPublishEvent, getEntitiesOrganizeQueue) — Layer 1 not Redis-free
- QueueEvents race condition — switched to DB polling approach
- Open handle leak in services/events.ts — added closeEventConnections() to Phase 1
- Rate limiter interference — FLUSHDB handles it
- Test parallelism unsafe — added fileParallelism: false
- Missing scenarios: zero entities, retries, error handling, concurrent jobs, SSE E2E
