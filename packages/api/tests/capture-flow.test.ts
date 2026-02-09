import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createTestApiKey, createTestUser } from "./factories.js";
import { authedRequest } from "./helpers.js";

// Mock the queue so capture doesn't require Redis.
vi.mock("../src/jobs/queue.js", () => ({
  getNotesExtractQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getNotesReprocessQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getEntitiesOrganizeQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getEntitiesComputeEmbeddingsQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  getReviewQueueExportTrainingDataQueue: () => ({ add: vi.fn().mockResolvedValue(undefined) }),
  DEFAULT_JOB_OPTS: { removeOnComplete: true, removeOnFail: 500 },
  isRedisConfigured: () => true,
  getRedisConnection: () => null,
  getRedisConnectionOrThrow: () => { throw new Error("Redis not available in tests"); },
}));

// Mock SSE events to prevent ioredis connections from the event publisher.
vi.mock("../src/services/events.js", () => ({
  tryPublishEvent: vi.fn().mockResolvedValue(undefined),
  publishEvent: vi.fn().mockResolvedValue(undefined),
  onEvent: vi.fn().mockReturnValue(() => {}),
  events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

describe("capture pipeline flow", () => {
  async function setup() {
    const user = await createTestUser();
    const { plaintextKey } = await createTestApiKey({ userId: user.id });
    const app = createApp();
    return { user, apiKey: plaintextKey, app };
  }

  // ----------------------------------------------------------------
  // Basic capture
  // ----------------------------------------------------------------

  it("captures a meeting transcript note", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: {
        content:
          "We need to add user authentication. Sarah will handle the OAuth flow. Decision: use JWT tokens instead of sessions.",
        source: "meeting_transcript",
        sourceMeta: { meetingTitle: "Sprint Planning", attendees: ["Sarah", "Tom", "Alice"] },
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.note.content).toContain("user authentication");
    expect(body.note.source).toBe("meeting_transcript");
    expect(body.note.sourceMeta).toEqual({
      meetingTitle: "Sprint Planning",
      attendees: ["Sarah", "Tom", "Alice"],
    });
    expect(body.deduped).toBe(false);
  });

  it("captures a slack message", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: {
        content:
          "The onboarding flow is too complex. Let's simplify it to 3 steps. Bug: the signup form crashes on Safari.",
        source: "slack",
        sourceMeta: { channel: "#product", threadTs: "1700000000.123456" },
        externalId: "slack-msg-001",
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.note.source).toBe("slack");
    expect(body.note.externalId).toBe("slack-msg-001");
    expect(body.note.sourceMeta?.channel).toBe("#product");
  });

  it("captures a voice memo", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: {
        content:
          "Epic: Payment Integration. Tasks: Stripe setup, subscription management, invoice generation.",
        source: "voice_memo",
        sourceMeta: { durationSeconds: 45, transcriptionModel: "whisper-v3" },
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.note.source).toBe("voice_memo");
    expect(body.note.sourceMeta?.durationSeconds).toBe(45);
  });

  it("captures a CLI note", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: {
        content: "TODO: refactor the database connection pooling. The current approach leaks connections under load.",
        source: "cli",
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.note.source).toBe("cli");
    expect(body.note.processed).toBe(false);
  });

  it("captures an Obsidian note", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: {
        content: "Research: GraphQL vs REST for our API. GraphQL offers better flexibility but REST is simpler for our use case.",
        source: "obsidian",
        sourceMeta: { vault: "work", path: "meetings/2024-01-15.md" },
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.note.source).toBe("obsidian");
  });

  // ----------------------------------------------------------------
  // Deduplication
  // ----------------------------------------------------------------

  it("deduplicates notes with the same source + externalId", async () => {
    const { app, apiKey } = await setup();

    const payload = {
      content: "Duplicate message from Slack",
      source: "slack" as const,
      externalId: "slack-dedup-001",
    };

    const res1 = await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: payload,
    });
    expect(res1.status).toBe(201);
    const body1 = (await res1.json()) as any;
    expect(body1.deduped).toBe(false);

    // Same externalId should be deduplicated
    const res2 = await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: payload,
    });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as any;
    expect(body2.deduped).toBe(true);
    expect(body2.note.id).toBe(body1.note.id);
  });

  // ----------------------------------------------------------------
  // Listing notes
  // ----------------------------------------------------------------

  it("lists notes filtered by source", async () => {
    const { app, apiKey } = await setup();

    // Capture notes from different sources
    await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: { content: "Slack note 1", source: "slack" },
    });
    await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: { content: "CLI note 1", source: "cli" },
    });
    await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: { content: "Slack note 2", source: "slack" },
    });

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/notes?source=slack",
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(2);
    expect(body.items.every((n: any) => n.source === "slack")).toBe(true);
  });

  it("lists notes filtered by processed=false", async () => {
    const { app, apiKey } = await setup();

    await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: { content: "Unprocessed note", source: "cli" },
    });

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/notes?processed=false",
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.every((n: any) => n.processed === false)).toBe(true);
  });

  it("paginates notes with cursor", async () => {
    const { app, apiKey } = await setup();

    // Create 3 notes
    for (let i = 0; i < 3; i++) {
      await authedRequest(app, {
        method: "POST",
        path: "/api/notes/capture",
        apiKey,
        json: { content: `Note ${i}`, source: "cli" },
      });
    }

    const res = await authedRequest(app, {
      method: "GET",
      path: "/api/notes?limit=2",
      apiKey,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBeTruthy();

    // Fetch second page
    const res2 = await authedRequest(app, {
      method: "GET",
      path: `/api/notes?limit=2&cursor=${body.nextCursor}`,
      apiKey,
    });

    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as any;
    expect(body2.items).toHaveLength(1);
    expect(body2.nextCursor).toBeNull();
  });

  // ----------------------------------------------------------------
  // Realistic multi-note capture scenarios
  // ----------------------------------------------------------------

  it("captures a team standup sequence", async () => {
    const { app, apiKey } = await setup();

    const standupNotes = [
      {
        content:
          "Yesterday I finished the API endpoint for user profiles. Today I'm starting the notification system. Blocker: need design specs for email templates.",
        source: "meeting_transcript" as const,
        sourceMeta: { meetingTitle: "Daily Standup", speaker: "Alice" },
      },
      {
        content:
          "I'm wrapping up the payment integration. Decision: we'll use Stripe webhooks for subscription events instead of polling. Risk: webhook delivery is eventually consistent.",
        source: "meeting_transcript" as const,
        sourceMeta: { meetingTitle: "Daily Standup", speaker: "Bob" },
      },
      {
        content:
          "Working on performance optimization. Insight: the main dashboard query takes 800ms because we're doing N+1 queries. I'll batch the entity fetches.",
        source: "meeting_transcript" as const,
        sourceMeta: { meetingTitle: "Daily Standup", speaker: "Charlie" },
      },
    ];

    for (const note of standupNotes) {
      const res = await authedRequest(app, {
        method: "POST",
        path: "/api/notes/capture",
        apiKey,
        json: note,
      });
      expect(res.status).toBe(201);
    }

    // Verify all notes were captured
    const listRes = await authedRequest(app, {
      method: "GET",
      path: "/api/notes?source=meeting_transcript",
      apiKey,
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as any;
    expect(listBody.items).toHaveLength(3);
  });

  it("captures sprint planning notes with rich metadata", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: {
        content: [
          "Sprint 14 Planning - Payment Integration",
          "Epic: Payment Processing Pipeline",
          "Task 1: Set up Stripe SDK and test keys (2 points, assigned to Sarah)",
          "Task 2: Implement checkout flow with error handling (5 points, assigned to Tom)",
          "Task 3: Add subscription management UI (3 points, assigned to Alice)",
          "Task 4: Invoice generation and PDF export (3 points)",
          "Decision: Use Stripe Elements for PCI compliance instead of building our own form",
          "Insight: Competitors charge 2.9% + 30c per transaction, we should aim for competitive pricing",
          "Risk: Stripe API changes in v2024-02 may affect our integration timeline",
        ].join("\n"),
        source: "meeting_transcript",
        sourceMeta: {
          meetingTitle: "Sprint 14 Planning",
          attendees: ["Sarah", "Tom", "Alice", "PM"],
          durationMinutes: 45,
        },
        capturedAt: new Date().toISOString(),
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.note.content).toContain("Payment Processing Pipeline");
    expect(body.note.capturedAt).toBeDefined();
  });

  // ----------------------------------------------------------------
  // Validation
  // ----------------------------------------------------------------

  it("rejects capture with empty content", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: { content: "", source: "cli" },
    });

    expect(res.ok).toBe(false);
  });

  it("rejects capture with invalid source", async () => {
    const { app, apiKey } = await setup();

    const res = await authedRequest(app, {
      method: "POST",
      path: "/api/notes/capture",
      apiKey,
      json: { content: "Valid content", source: "invalid_source" },
    });

    expect(res.ok).toBe(false);
  });
});
