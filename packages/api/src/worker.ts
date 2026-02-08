import { Worker } from "bullmq";

import { logger } from "./lib/logger.js";
import { getRedisConnection } from "./jobs/queue.js";
import { notesExtractProcessor } from "./jobs/notes-extract.js";
import { entitiesOrganizeProcessor } from "./jobs/entities-organize.js";
import { notesReprocessProcessor } from "./jobs/notes-reprocess.js";

const connection = getRedisConnection();

function wire(worker: Worker) {
  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, name: job.name, queue: worker.name }, "job completed");
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, name: job?.name, queue: worker.name, err }, "job failed");
  });
  worker.on("error", (err) => {
    logger.error({ err, queue: worker.name }, "worker error");
  });
}

const workers = [
  new Worker("notes:extract", notesExtractProcessor, { connection, concurrency: 5 }),
  new Worker("entities:organize", entitiesOrganizeProcessor, { connection, concurrency: 5 }),
  new Worker("notes:reprocess", notesReprocessProcessor, { connection, concurrency: 2 }),
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

