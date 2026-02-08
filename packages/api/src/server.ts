import { serve } from "@hono/node-server";

import { app } from "./app.js";
import { logger } from "./lib/logger.js";

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, "api listening");
});

