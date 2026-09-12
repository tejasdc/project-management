import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Miniflare, Response as WorkerResponse } from "miniflare";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
let options: ConstructorParameters<typeof Miniflare>[0];
let mf: Miniflare, apiKey = "", extractionCalls = 0, organizationCalls = 0, failNext = false, recordedContent = "";
let blocked: (() => void) | undefined, signalStarted: (() => void) | undefined;
let failOrganizationNext = false;
const extraction = { entities: [{ type: "task", content: "Ship the Cloudflare migration", status: "captured", confidence: 0.5,
  fieldConfidence: {}, attributes: {}, tags: ["hosting"], evidence: [{ quote: "Ship the Cloudflare migration" }] }], relationships: [] };
const organization = { entityOrganizations: [], epicSuggestions: [], projectSuggestions: [{
  name: "Cloudflare migration", description: "A free hobby workspace", entityIndices: [0], confidence: 0.9, reason: "Explicit project" }] };
async function request(path: string, json?: unknown, key = apiKey, method = json === undefined ? "GET" : "POST") {
  return mf.dispatchFetch("https://clarify.test" + path, { method, headers: {
    ...(key ? { authorization: "Bearer " + key } : {}),
    ...(json === undefined ? {} : { "content-type": "application/json" }),
  }, ...(json === undefined ? {} : { body: JSON.stringify(json) }) });
}
async function sql(query: string, ...values: any[]) {
  const storage = await mf.unsafeGetDurableObjectStorage("clarify-test", "Workspace", { name: "clarify-workspace" });
  return storage.exec(query, ...values);
}
async function completed(id: string) {
  await expect.poll(async () => (await sql("SELECT status FROM processing_jobs WHERE raw_note_id = ?", id))[0]?.status,
    { timeout: 30_000, interval: 100 }).toBe("done");
}
beforeAll(async () => {
  options = {
    name: "clarify-test", modules: true, unsafeInspectDurableObjects: true, modulesRoot: resolve("../../tmp/native-bundle"), scriptPath: resolve("../../tmp/native-bundle/worker.js"),
    modulesRules: [{ type: "Text", include: ["**/*.sql"], fallthrough: true }],
    compatibilityDate: "2026-08-02", compatibilityFlags: ["nodejs_compat"],
    durableObjects: { WORKSPACE: { className: "Workspace", useSQLite: true } },
    durableObjectsPersist: mkdtempSync(join(tmpdir(), "clarify-workerd-")),
    bindings: { ANTHROPIC_API_KEY: "test-only", REGISTRATION_CODE: "test-invitation", CORS_ORIGINS: "https://clarify.test" },
    outboundService: async req => {
      if (new URL(req.url).hostname !== "api.anthropic.com") throw new Error("Unexpected outbound request");
      if (failNext) { failNext = false; return new WorkerResponse("temporary failure", { status: 503 }); }
      const body = await req.json() as any;
      const name = body.tool_choice.name;
      if (name === "organize_entities" && failOrganizationNext) {
        failOrganizationNext = false;
        return new WorkerResponse("temporary organization failure", { status: 503 });
      }
      if (name === "extract_entities") {
        extractionCalls++; recordedContent = body.messages[0].content;
        if (signalStarted) {
          const signal = signalStarted; signalStarted = undefined;
          await new Promise<void>(resolve => { blocked = resolve; signal(); });
        }
      } else organizationCalls++;
      return WorkerResponse.json({ id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-4-6",
        content: [{ type: "tool_use", id: "tool_test", name, input: name === "extract_entities" ? extraction : organization }],
        stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 10 } });
    },
  };
  mf = new Miniflare(options);
  const response = await request("/api/auth/register", { name: "Test Owner", email: "owner@example.test",
    password: "correct horse battery staple", registrationCode: "test-invitation" }, "");
  expect(response.status).toBe(201);
  apiKey = (await response.json() as any).apiKey;
});
afterAll(async () => { blocked?.(); await mf?.dispose(); });
describe("actual Cloudflare runtime", () => {
  it("preserves the canonical www redirect and serves both API hostnames", async () => {
    const redirected = await mf.dispatchFetch("https://www.clarify.pm/projects?view=active", { redirect: "manual" });
    expect(redirected.status).toBe(301);
    expect(redirected.headers.get("location")).toBe("https://clarify.pm/projects?view=active");
    for (const host of ["clarify.pm", "api.clarify.pm"]) {
      expect((await mf.dispatchFetch(`https://${host}/api/health`)).status).toBe(200);
      expect((await mf.dispatchFetch(`https://${host}/api/projects`)).status).toBe(401);
    }
  });
  it("protects registration and user responses, supports login and CORS", async () => {
    expect((await request("/api/auth/register", { name: "Intruder", email: "intruder@example.test", password: "password123", registrationCode: "wrong" }, "")).status).toBe(401);
    for (const path of ["/api/users", "/api/auth/me"]) {
      const res = await request(path); expect(res.status).toBe(200);
      expect(await res.text()).not.toMatch(/passwordHash|keyHash|password_hash/);
    }
    expect((await request("/api/auth/login", { email: "owner@example.test", password: "correct horse battery staple" }, "")).status).toBe(200);
    const cors = await mf.dispatchFetch("https://clarify.test/api/projects", { method: "OPTIONS", headers: {
      origin: "https://clarify.test", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } });
    expect(cors.headers.get("access-control-allow-origin")).toBe("https://clarify.test");
  });
  it("captures, extracts, organizes, reviews and reprocesses without duplicate delivery", async () => {
    const before = extractionCalls;
    const response = await request("/api/notes/capture", { content: "Ship the Cloudflare migration", source: "cli", externalId: "native-flow" });
    expect(response.status).toBe(201);
    const { note } = await response.json() as any;
    const duplicate = await request("/api/notes/capture", { content: "different duplicate", source: "cli", externalId: "native-flow" });
    expect((await duplicate.json() as any).note.content).toBe(note.content);
    await completed(note.id);
    expect(extractionCalls - before).toBe(1); expect(organizationCalls).toBeGreaterThan(0);
    expect(await sql("SELECT * FROM entity_sources WHERE raw_note_id = ?", note.id)).toHaveLength(1);
    const entities = (await (await request("/api/entities")).json() as any).items;
    expect(entities[0].evidence[0].rawNoteId).toBe(note.id); expect(entities[0].projectId).toBeTruthy();
    const pending = (await (await request("/api/review-queue")).json() as any).items;
    expect(pending.length).toBeGreaterThan(0);
    expect((await request("/api/review-queue/" + pending[0].id + "/resolve", { status: "accepted" })).status).toBe(200);
    expect((await request("/api/notes/" + note.id + "/reprocess", {})).status).toBe(202);
    await completed(note.id);
    expect(await sql("SELECT * FROM entity_sources WHERE raw_note_id = ?", note.id)).toHaveLength(2);
  });
  it("round-trips oversized content and metadata, preserving Unicode through reprocess", async () => {
    const content = "😀é".repeat(360_000), sourceMeta = { original: "🧭".repeat(530_000) };
    const response = await request("/api/notes/capture", { content, source: "api", sourceMeta });
    expect(response.status).toBe(201);
    const { note } = await response.json() as any;
    expect(note.content).toBe(content); expect(note.sourceMeta).toEqual(sourceMeta);
    await completed(note.id);
    const notes = (await (await request("/api/notes?limit=100")).json() as any).items;
    expect(notes.find((n: any) => n.id === note.id).content).toBe(content);
    await request("/api/notes/" + note.id + "/reprocess", {}); await completed(note.id);
    expect(recordedContent).toContain(content); expect(recordedContent).toContain(JSON.stringify(sourceMeta));
  });
  it("rolls back captures when payload storage fails", async () => {
    await sql("CREATE TRIGGER reject_test_pages BEFORE INSERT ON note_pages BEGIN SELECT RAISE(ABORT, 'fixture rejection'); END");
    const before = (await sql("SELECT count(*) AS count FROM raw_notes"))[0].count;
    expect((await request("/api/notes/capture", { content: "Must roll back", source: "cli" })).status).toBe(500);
    await sql("DROP TRIGGER reject_test_pages");
    expect((await sql("SELECT count(*) AS count FROM raw_notes"))[0].count).toBe(before);
  });
  it("retries transient AI failures durably", async () => {
    failNext = true;
    const { note } = await (await request("/api/notes/capture", { content: "Retry this migration", source: "cli" })).json() as any;
    await completed(note.id);
    expect((await sql("SELECT processing_error FROM raw_notes WHERE id = ?", note.id))[0].processing_error).toBeNull();
  });
  it("hibernates a live connection and closes it on key revocation", async () => {
    const { apiKey: keyInfo, plaintextKey } = await (await request("/api/auth/api-keys", { name: "socket test" })).json() as any;
    expect((await mf.dispatchFetch("https://clarify.test/api/live", { headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": "clarify, pm_live_invalid" } })).status).toBe(401);
    const response = await mf.dispatchFetch("https://clarify.test/api/live", { headers: {
      Upgrade: "websocket", Origin: "https://clarify.test", "Sec-WebSocket-Protocol": "clarify, " + plaintextKey } });
    expect(response.status).toBe(101);
    const socket = response.webSocket!; socket.accept();
    const events: string[] = [];
    socket.addEventListener("message", e => events.push(JSON.parse(String(e.data)).type));
    await mf.unsafeEvictDurableObject("clarify-test", "Workspace", { name: "clarify-workspace", webSockets: "hibernate" });
    await request("/api/projects", { name: "After hibernation" });
    await expect.poll(() => events.includes("project:created")).toBe(true);
    const closed = new Promise<number>(resolve => socket.addEventListener("close", e => resolve(e.code)));
    await request("/api/auth/api-keys/" + keyInfo.id + "/revoke", {}); expect(await closed).toBe(4001);
    expect((await request("/api/auth/me", undefined, plaintextKey)).status).toBe(401);
  });
  it("clears recovered organization errors and notifies connected browsers", async () => {
    const response = await mf.dispatchFetch("https://clarify.test/api/live", { headers: {
      Upgrade: "websocket", Origin: "https://clarify.test", "Sec-WebSocket-Protocol": "clarify, " + apiKey } });
    const socket = response.webSocket!; socket.accept();
    const processedEvents: string[] = [];
    socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data));
      if (message.type === "raw_note:processed") processedEvents.push(message.data.id);
    });
    try {
      failOrganizationNext = true;
      const { note } = await (await request("/api/notes/capture", { content: "Organization retry verification", source: "cli" })).json() as any;
      await expect.poll(async () => (await sql("SELECT processing_error FROM raw_notes WHERE id = ?", note.id))[0]?.processing_error,
        { timeout: 10_000, interval: 100 }).toBe("AI processing interrupted; retry scheduled.");
      processedEvents.length = 0;
      await completed(note.id);
      expect((await sql("SELECT processing_error FROM raw_notes WHERE id = ?", note.id))[0].processing_error).toBeNull();
      await expect.poll(() => processedEvents.includes(note.id)).toBe(true);
    } finally { socket.close(); }
  });
  it("preserves Unicode search and large tag sets", async () => {
    expect((await request("/api/users", { name: "Élodie", email: "elodie@example.test" })).status).toBe(201);
    const matches = (await (await request("/api/users?q=" + encodeURIComponent("élodie"))).json() as any).items;
    expect(matches.some((user: any) => user.name === "Élodie")).toBe(true);
    const tagIds = Array.from({ length: 120 }, () => crypto.randomUUID());
    for (const [index, id] of tagIds.entries()) await sql("INSERT INTO tags(id, name, created_at) VALUES (?, ?, ?)", id, "large-set-" + index, Date.now());
    const { entity } = await (await request("/api/entities", { type: "task", content: "Many tags", status: "captured" })).json() as any;
    expect((await request("/api/entities/" + entity.id + "/tags", { tagIds }, apiKey, "PUT")).status).toBe(200);
    expect(await sql("SELECT * FROM entity_tags WHERE entity_id = ?", entity.id)).toHaveLength(120);
  });
  it("rejects late AI results after an explicit new processing generation", async () => {
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const { note } = await (await request("/api/notes/capture", { content: "Generation ownership", source: "cli" })).json() as any;
    await started;
    expect((await request("/api/notes/" + note.id + "/reprocess", {})).status).toBe(202);
    blocked?.(); blocked = undefined;
    await completed(note.id);
    expect(await sql("SELECT * FROM entity_sources WHERE raw_note_id = ?", note.id)).toHaveLength(1);
  });
  it("survives a process restart during AI work", async () => {
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const { note } = await (await request("/api/notes/capture", { content: "Survive a restart", source: "cli" })).json() as any;
    await started;
    await mf.dispose();
    blocked?.(); blocked = undefined;
    mf = new Miniflare(options);
    await completed(note.id);
    expect(await sql("SELECT * FROM entity_sources WHERE raw_note_id = ?", note.id)).toHaveLength(1);
  });
});
