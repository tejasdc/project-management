import { and, asc, desc, eq, gt, isNull, lt, or } from "drizzle-orm";

import { ENTITY_STATUSES } from "@pm/shared";
import { db } from "../db/index.js";
import { entities, entityEvents, entityTags } from "../db/schema/index.js";
import { entityWithAttributesSchema } from "../db/validation.js";
import { badRequest, notFound } from "../lib/errors.js";
import { decodeCursor, encodeCursor } from "../lib/pagination.js";

type EntityType = "task" | "decision" | "insight";

type EntityCursor = { createdAt: string; id: string };

function assertValidStatus(type: EntityType, status: string) {
  const allowed = (ENTITY_STATUSES as any)[type] as readonly string[] | undefined;
  if (!allowed || !allowed.includes(status)) throw badRequest(`Invalid status for type '${type}'`);
}

export async function getEntityById(id: string) {
  const entity = await db.query.entities.findFirst({
    where: (t, { eq }) => eq(t.id, id),
  });
  if (!entity) throw notFound("entity", id);
  return entity;
}

export async function listEntities(opts: {
  projectId?: string;
  epicId?: string;
  type?: EntityType;
  status?: string;
  assigneeId?: string;
  tagId?: string;
  includeDeleted?: boolean;
  limit: number;
  cursor?: string;
}) {
  const cursor = opts.cursor ? decodeCursor<EntityCursor>(opts.cursor) : null;

  const where: any[] = [];
  if (opts.projectId) where.push(eq(entities.projectId, opts.projectId));
  if (opts.epicId) where.push(eq(entities.epicId, opts.epicId));
  if (opts.type) where.push(eq(entities.type, opts.type));
  if (opts.status) where.push(eq(entities.status, opts.status));
  if (opts.assigneeId) where.push(eq(entities.assigneeId, opts.assigneeId));
  if (!opts.includeDeleted) where.push(isNull(entities.deletedAt));

  if (cursor) {
    const t = new Date(cursor.createdAt);
    where.push(
      or(
        lt(entities.createdAt, t),
        and(eq(entities.createdAt, t), lt(entities.id, cursor.id))
      )
    );
  }

  const baseWhere = where.length ? and(...where) : undefined;

  const rows = opts.tagId
    ? await db
        .select({ entity: entities })
        .from(entities)
        .innerJoin(entityTags, eq(entityTags.entityId, entities.id))
        .where(baseWhere ? and(baseWhere, eq(entityTags.tagId, opts.tagId)) : eq(entityTags.tagId, opts.tagId))
        .orderBy(desc(entities.createdAt), desc(entities.id))
        .limit(opts.limit + 1)
    : await db
        .select({ entity: entities })
        .from(entities)
        .where(baseWhere)
        .orderBy(desc(entities.createdAt), desc(entities.id))
        .limit(opts.limit + 1);

  const items = rows.slice(0, opts.limit).map((r) => r.entity);
  const hasMore = rows.length > opts.limit;
  const last = hasMore ? items[items.length - 1] : null;

  const nextCursor = last
    ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id } satisfies EntityCursor)
    : null;

  return { items, nextCursor };
}

export async function createEntity(input: typeof entities.$inferInsert) {
  if (input.status) assertValidStatus(input.type as EntityType, input.status);
  if (input.attributes !== undefined) {
    entityWithAttributesSchema.parse({ type: input.type, attributes: input.attributes });
  }

  const [entity] = await db.insert(entities).values(input as any).returning();
  return entity!;
}

export async function patchEntity(opts: {
  id: string;
  patch: Partial<Pick<typeof entities.$inferInsert, "status" | "projectId" | "epicId" | "assigneeId" | "content" | "attributes">>;
}) {
  const existing = await getEntityById(opts.id);

  if (opts.patch.status) assertValidStatus(existing.type as EntityType, opts.patch.status);

  if (opts.patch.attributes !== undefined && opts.patch.attributes !== null) {
    entityWithAttributesSchema.parse({ type: existing.type, attributes: opts.patch.attributes });
  }

  const [entity] = await db
    .update(entities)
    .set({ ...opts.patch, updatedAt: new Date() } as any)
    .where(eq(entities.id, opts.id))
    .returning();

  if (!entity) throw notFound("entity", opts.id);
  return entity;
}

export async function addEntityComment(opts: { entityId: string; actorUserId: string; body: string; meta?: unknown }) {
  await getEntityById(opts.entityId);
  const [event] = await db
    .insert(entityEvents)
    .values({
      entityId: opts.entityId,
      type: "comment",
      actorUserId: opts.actorUserId,
      body: opts.body,
      meta: opts.meta as any,
    })
    .returning();
  return event!;
}

export async function listEntityEvents(opts: { entityId: string; limit: number; cursor?: string; order?: "asc" | "desc" }) {
  const cursor = opts.cursor ? decodeCursor<EntityCursor>(opts.cursor) : null;
  const order = opts.order ?? "desc";
  const where: any[] = [eq(entityEvents.entityId, opts.entityId)];

  if (cursor) {
    const t = new Date(cursor.createdAt);
    where.push(
      order === "asc"
        ? or(
            gt(entityEvents.createdAt, t),
            and(eq(entityEvents.createdAt, t), gt(entityEvents.id, cursor.id))
          )
        : or(
            lt(entityEvents.createdAt, t),
            and(eq(entityEvents.createdAt, t), lt(entityEvents.id, cursor.id))
          )
    );
  }

  const rows = await db
    .select()
    .from(entityEvents)
    .where(and(...where))
    .orderBy(
      order === "asc" ? asc(entityEvents.createdAt) : desc(entityEvents.createdAt),
      order === "asc" ? asc(entityEvents.id) : desc(entityEvents.id)
    )
    .limit(opts.limit + 1);

  const items = rows.slice(0, opts.limit);
  const hasMore = rows.length > opts.limit;
  const last = hasMore ? items[items.length - 1] : null;
  const nextCursor = last
    ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id } satisfies EntityCursor)
    : null;

  return { items, nextCursor };
}

export async function transitionEntityStatus(opts: { entityId: string; actorUserId: string; newStatus: string }) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.entities.findFirst({
      where: (t, { eq }) => eq(t.id, opts.entityId),
    });
    if (!existing) throw notFound("entity", opts.entityId);

    assertValidStatus(existing.type as EntityType, opts.newStatus);
    if (existing.status === opts.newStatus) return existing;

    const [entity] = await tx
      .update(entities)
      .set({ status: opts.newStatus, updatedAt: new Date() })
      .where(eq(entities.id, opts.entityId))
      .returning();

    await tx.insert(entityEvents).values({
      entityId: opts.entityId,
      type: "status_change",
      actorUserId: opts.actorUserId,
      oldStatus: existing.status,
      newStatus: opts.newStatus,
      meta: { reason: "api" } as any,
    });

    return entity!;
  });
}
