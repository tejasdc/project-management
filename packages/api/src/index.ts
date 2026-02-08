import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HELLO } from "@pm/shared";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/", (c) => c.json({ message: HELLO }));

const port = Number(process.env.PORT) || 3001;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on port ${info.port}`);
});
