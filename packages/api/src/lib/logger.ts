import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Render and most log drains add their own timestamp. Keep logs minimal.
  base: undefined,
});

