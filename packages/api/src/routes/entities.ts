import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import type { AppEnv } from "../types/env.js";
import { entityInsertSchema } from "../db/validation.js";
import { parseLimit } from "../lib/pagination.js";
import { tryPublishEvent } from "../services/events.js";
import {
  addEntityComment,
  createEntity,
  getEntityById,
  listEntities,
  listEntityEvents,
  patchEntity,
  transitionEntityStatus,
} from "../services/entities.js";

const entityIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const listEntitiesQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  epicId: z.string().uuid().optional(),
  type: z.enum(["task", "decision", "insight"]).optional(),
  status: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  includeDeleted: z.string().optional(),
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

const entityPatchSchema = z.object({
  status: z.string().optional(),
  projectId: z.string().uuid().nullable().optional(),
  epicId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  content: z.string().min(1).optional(),
  attributes: z.record(z.string(), z.unknown()).nullable().optional(),
});

const listEventsQuerySchema = z.object({
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

const addCommentSchema = z.object({
  type: z.literal("comment"),
  body: z.string().min(1),
  meta: z.unknown().optional(),
});

const statusTransitionSchema = z.object({
  newStatus: z.string().min(1),
});

export const entityRoutes = new Hono<AppEnv>()
  .get(
    "/",
    zValidator("query", listEntitiesQuerySchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const q = c.req.valid("query");
      const limit = parseLimit(q.limit);
      const includeDeleted = q.includeDeleted === "true";

      const res = await listEntities({
        projectId: q.projectId,
        epicId: q.epicId,
        type: q.type as any,
        status: q.status,
        assigneeId: q.assigneeId,
        tagId: q.tagId,
        includeDeleted,
        limit,
        cursor: q.cursor,
      });

      return c.json(res);
    }
  )
  .get(
    "/:id",
    zValidator("param", entityIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const entity = await getEntityById(id);
      return c.json({ entity });
    }
  )
  .post(
    "/",
    zValidator("json", entityInsertSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const data = c.req.valid("json");
      const entity = await createEntity(data as any);
      await tryPublishEvent("entity:created", { id: entity.id });
      if (entity.projectId) await tryPublishEvent("project:stats_updated", { projectId: entity.projectId });
      return c.json({ entity }, 201);
    }
  )
  .patch(
    "/:id",
    zValidator("param", entityIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    zValidator("json", entityPatchSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const entity = await patchEntity({ id, patch: patch as any });
      await tryPublishEvent("entity:updated", { id: entity.id });
      if (entity.projectId) await tryPublishEvent("project:stats_updated", { projectId: entity.projectId });
      return c.json({ entity });
    }
  )
  .get(
    "/:id/events",
    zValidator("param", entityIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    zValidator("query", listEventsQuerySchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const q = c.req.valid("query");
      const limit = parseLimit(q.limit);
      const res = await listEntityEvents({ entityId: id, limit, cursor: q.cursor });
      return c.json(res);
    }
  )
  .post(
    "/:id/events",
    zValidator("param", entityIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    zValidator("json", addCommentSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const user = c.get("user");
      const event = await addEntityComment({
        entityId: id,
        actorUserId: user.id,
        body: body.body,
        meta: body.meta,
      });
      await tryPublishEvent("entity:event_added", { entityId: id, eventId: event.id, type: event.type });
      return c.json({ event }, 201);
    }
  )
  .post(
    "/:id/status",
    zValidator("param", entityIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    zValidator("json", statusTransitionSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { newStatus } = c.req.valid("json");
      const user = c.get("user");
      const entity = await transitionEntityStatus({ entityId: id, actorUserId: user.id, newStatus });
      await tryPublishEvent("entity:updated", { id: entity.id });
      if (entity.projectId) await tryPublishEvent("project:stats_updated", { projectId: entity.projectId });
      return c.json({ entity });
    }
  );
