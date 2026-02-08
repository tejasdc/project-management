import { Hono } from "hono";
import { HELLO } from "@pm/shared";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/", (c) => c.json({ message: HELLO }));

const port = Number(process.env.PORT) || 3001;

console.log(`Server running on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
