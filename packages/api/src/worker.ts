import { Worker } from "bullmq";

import { createJobLogger, logger } from "./lib/logger.js";
import { getRedisConnectionOrThrow } from "./jobs/queue.js";
import { notesExtractProcessor } from "./jobs/notes-extract.js";
import { entitiesOrganizeProcessor } from "./jobs/entities-organize.js";
import { notesReprocessProcessor } from "./jobs/notes-reprocess.js";

const connection = getRedisConnectionOrThrow();

function wire(worker: Worker) {
  worker.on("completed", (job) => {
    createJobLogger(job).info({ queue: worker.name }, "job completed");
  });
  worker.on("failed", (job, err) => {
    if (job) createJobLogger(job).error({ queue: worker.name, err }, "job failed");
    else logger.error({ queue: worker.name, err }, "job failed");
  });
  worker.on("error", (err) => {
    logger.error({ err, queue: worker.name }, "worker error");
  });
}

function getConcurrency(defaultValue: number) {
  const raw = process.env.BULLMQ_CONCURRENCY;
  if (!raw) return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return Math.floor(n);
}

const workers = [
  new Worker("notes:extract", notesExtractProcessor, { connection, concurrency: getConcurrency(5) }),
  new Worker("entities:organize", entitiesOrganizeProcessor, { connection, concurrency: getConcurrency(5) }),
  new Worker("notes:reprocess", notesReprocessProcessor, { connection, concurrency: getConcurrency(2) }),
];

for (const w of workers) wire(w);

logger.info({ queues: workers.map((w) => w.name) }, "worker started");

async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  await Promise.allSettled(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
