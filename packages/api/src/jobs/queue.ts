import { Queue } from "bullmq";
import IORedis from "ioredis";

import { logger } from "../lib/logger.js";

export type NotesExtractJob = { rawNoteId: string };
export type EntitiesOrganizeJob = { rawNoteId: string; entityIds: string[] };
export type NotesReprocessJob = { rawNoteId: string; requestedByUserId?: string };
export type EntitiesComputeEmbeddingsJob = { entityId: string };
export type ReviewQueueExportTrainingDataJob = { since?: string };

let redis: IORedis | null = null;

export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

/**
 * Returns an IORedis connection, or null if REDIS_URL is not set.
 * The worker entry point should call getRedisConnectionOrThrow() instead.
 */
export function getRedisConnection(): IORedis | null {
  if (redis) return redis;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  redis = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  return redis;
}

/** Strict variant for worker process — throws if Redis is missing. */
export function getRedisConnectionOrThrow(): IORedis {
  const conn = getRedisConnection();
  if (!conn) throw new Error("REDIS_URL is required for the worker process");
  return conn;
}

// Lazy queue accessors — return null when Redis is unavailable.
function lazyQueue<T>(name: string): Queue<T> | null {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn({ queue: name }, "Queue unavailable — REDIS_URL not set");
    return null;
  }
  return new Queue<T>(name, { connection: conn });
}

let _notesExtract: Queue<NotesExtractJob> | null | undefined;
let _entitiesOrganize: Queue<EntitiesOrganizeJob> | null | undefined;
let _notesReprocess: Queue<NotesReprocessJob> | null | undefined;
let _entitiesComputeEmbeddings: Queue<EntitiesComputeEmbeddingsJob> | null | undefined;
let _reviewQueueExportTrainingData: Queue<ReviewQueueExportTrainingDataJob> | null | undefined;

export function getNotesExtractQueue() {
  if (_notesExtract === undefined) _notesExtract = lazyQueue("notes:extract");
  return _notesExtract;
}
export function getEntitiesOrganizeQueue() {
  if (_entitiesOrganize === undefined) _entitiesOrganize = lazyQueue("entities:organize");
  return _entitiesOrganize;
}
export function getNotesReprocessQueue() {
  if (_notesReprocess === undefined) _notesReprocess = lazyQueue("notes:reprocess");
  return _notesReprocess;
}
export function getEntitiesComputeEmbeddingsQueue() {
  if (_entitiesComputeEmbeddings === undefined) _entitiesComputeEmbeddings = lazyQueue("entities:compute-embeddings");
  return _entitiesComputeEmbeddings;
}
export function getReviewQueueExportTrainingDataQueue() {
  if (_reviewQueueExportTrainingData === undefined) _reviewQueueExportTrainingData = lazyQueue("review-queue:export-training-data");
  return _reviewQueueExportTrainingData;
}

export const DEFAULT_JOB_OPTS = {
  removeOnComplete: true,
  removeOnFail: 500,
} as const;
