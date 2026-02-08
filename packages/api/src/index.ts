import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { noteRoutes } from "./routes/notes.js";
import { projectRoutes } from "./routes/projects.js";
import { epicRoutes } from "./routes/epics.js";
import { entityRoutes } from "./routes/entities.js";
import { reviewQueueRoutes } from "./routes/review-queue.js";
import { tagRoutes } from "./routes/tags.js";
import { sseRoutes } from "./routes/sse.js";
import { tier1IpAuthFailLimiter } from "./middleware/rate-limit.js";
import type { AppEnv } from "./types/env.js";

const inner = createApp();

// Phase 2+ routes are registered here to avoid touching the already-staged app.ts.
inner.route("/api/notes", noteRoutes);
inner.route("/api/projects", projectRoutes);
inner.route("/api/epics", epicRoutes);
inner.route("/api/entities", entityRoutes);
inner.route("/api/review-queue", reviewQueueRoutes);
inner.route("/api", tagRoutes);
inner.route("/api/sse", sseRoutes);

// Wrap the app to allow pre-auth middleware without modifying app.ts.
const app = new Hono<AppEnv>();
app.use("/api/*", tier1IpAuthFailLimiter);
app.route("/", inner);

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, "api listening");
});
