import { Queue } from "bullmq";
import IORedis from "ioredis";

import { serviceUnavailable } from "../lib/errors.js";

export type NotesExtractJob = { rawNoteId: string };
export type EntitiesOrganizeJob = { rawNoteId: string; entityIds: string[] };
export type NotesReprocessJob = { rawNoteId: string; requestedByUserId?: string };
export type EntitiesComputeEmbeddingsJob = { entityId: string };
export type ReviewQueueExportTrainingDataJob = { since?: string };

let redis: IORedis | null = null;

function getRedisUrl() {
  const url = process.env.REDIS_URL;
  if (!url) throw serviceUnavailable("REDIS_URL is not set");
  return url;
}

export function getRedisConnection() {
  if (redis) return redis;

  // BullMQ best practice: avoid ioredis request retry limits for blocking ops.
  redis = new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  return redis;
}

export const notesExtractQueue = new Queue<NotesExtractJob>("notes:extract", {
  connection: getRedisConnection(),
});

export const entitiesOrganizeQueue = new Queue<EntitiesOrganizeJob>("entities:organize", {
  connection: getRedisConnection(),
});

export const notesReprocessQueue = new Queue<NotesReprocessJob>("notes:reprocess", {
  connection: getRedisConnection(),
});

export const entitiesComputeEmbeddingsQueue = new Queue<EntitiesComputeEmbeddingsJob>("entities:compute-embeddings", {
  connection: getRedisConnection(),
});

export const reviewQueueExportTrainingDataQueue = new Queue<ReviewQueueExportTrainingDataJob>("review-queue:export-training-data", {
  connection: getRedisConnection(),
});

export const DEFAULT_JOB_OPTS = {
  removeOnComplete: true,
  removeOnFail: 500,
} as const;
