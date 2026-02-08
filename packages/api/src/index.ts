import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { noteRoutes } from "./routes/notes.js";
import { projectRoutes } from "./routes/projects.js";
import { epicRoutes } from "./routes/epics.js";
import { entityRoutes } from "./routes/entities.js";

const app = createApp();

// Phase 2+ routes are registered here to avoid touching the already-staged app.ts.
app.route("/api/notes", noteRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/epics", epicRoutes);
app.route("/api/entities", entityRoutes);

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, "api listening");
});
