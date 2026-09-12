import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "./db/schema/index.js";
import migrations from "../drizzle-sqlite/migrations.js";
import { createApp } from "./app.js";
import { runtimeContext, type Runtime } from "./runtime.js";
import { nextJobTime, runDueJob } from "./jobs/runner.js";

export interface Env {
  WORKSPACE: DurableObjectNamespace<Workspace>;
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY: string;
  REGISTRATION_CODE: string;
  CORS_ORIGINS: string;
  AI_MODEL?: string;
}
export class Workspace extends DurableObject<Env> {
  private runtime: Runtime;
  private app = createApp();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const db = drizzle(ctx.storage, { schema });
    this.runtime = {
      db, env,
      mutateAndWake: mutation => ctx.storage.transaction(async () => {
        const result = mutation();
        await ctx.storage.setAlarm(Date.now() + 1000);
        return result;
      }),
      broadcast: event => {
        for (const socket of ctx.getWebSockets()) {
          const { keyId } = socket.deserializeAttachment() as { keyId: string };
          const active = db.select({ id: schema.apiKeys.id }).from(schema.apiKeys)
            .where(and(eq(schema.apiKeys.id, keyId), isNull(schema.apiKeys.revokedAt))).get();
          try {
            if (!active) socket.close(4001, "Session revoked");
            else socket.send(JSON.stringify(event));
          } catch { /* Disconnected sockets must not fail a committed mutation. */ }
        }
      },
      revokeSockets: keyId => {
        for (const socket of ctx.getWebSockets(keyId)) socket.close(4001, "Session revoked");
      },
      upgradeWebSocket: (request, keyId) => {
        const origin = request.headers.get("Origin");
        if (origin && !env.CORS_ORIGINS.split(",").includes(origin)) return new Response("Forbidden origin", { status: 403 });
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426 });
        const pair = new WebSocketPair();
        ctx.acceptWebSocket(pair[1], [keyId]);
        pair[1].serializeAttachment({ keyId });
        pair[1].send(JSON.stringify({ type: "ready", ts: new Date().toISOString(), data: {} }));
        return new Response(null, { status: 101, webSocket: pair[0], headers: { "Sec-WebSocket-Protocol": "clarify" } });
      },
    };
    ctx.blockConcurrencyWhile(async () => { await migrate(db, migrations); });
  }
  fetch(request: Request) {
    return runtimeContext.run(this.runtime, () => this.app.fetch(request));
  }
  async alarm() {
    await runtimeContext.run(this.runtime, async () => {
      try { await runDueJob(); }
      finally {
        await this.ctx.storage.transaction(async () => {
          const next = nextJobTime();
          if (next === undefined) await this.ctx.storage.deleteAlarm();
          else await this.ctx.storage.setAlarm(Math.max(Date.now() + 100, next));
        });
      }
    });
  }
  webSocketMessage(socket: WebSocket, _message: string | ArrayBuffer) {
    // Live connections only carry server notifications; no mutation protocol.
    socket.close(1008, "Server notifications only");
  }
  webSocketClose() {
    // The configured runtime owns the close handshake, including no-status closes.
  }
  webSocketError(socket: WebSocket) { socket.close(1011, "Connection error"); }
}
export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return env.WORKSPACE.getByName("clarify-workspace").fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
