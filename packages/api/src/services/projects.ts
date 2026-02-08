import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { entities, epics, projects } from "../db/schema/index.js";
import { notFound } from "../lib/errors.js";

export async function listProjects(opts?: { status?: "active" | "archived"; includeDeleted?: boolean }) {
  const where: any[] = [];
  if (opts?.status) where.push(eq(projects.status, opts.status));
  if (!opts?.includeDeleted) where.push(isNull(projects.deletedAt));

  const items = await db
    .select()
    .from(projects)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(projects.updatedAt), desc(projects.createdAt));

  return { items };
}

export async function createProject(input: { name: string; description?: string | null; status?: "active" | "archived" }) {
  const [project] = await db.insert(projects).values(input).returning();
  return project!;
}

export async function patchProject(opts: { id: string; patch: { name?: string; description?: string | null; status?: "active" | "archived"; deletedAt?: Date | null } }) {
  const [project] = await db.update(projects).set(opts.patch).where(eq(projects.id, opts.id)).returning();
  if (!project) throw notFound("project", opts.id);
  return project;
}

export async function getProjectDashboard(opts: { projectId: string; since?: string }) {
  const project = await db.query.projects.findFirst({
    where: (t, { and, eq, isNull }) => and(eq(t.id, opts.projectId), isNull(t.deletedAt)),
  });
  if (!project) throw notFound("project", opts.projectId);

  const since = opts.since ? new Date(opts.since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const tasksByStatusRows = await db
    .select({ status: entities.status, count: count() })
    .from(entities)
    .where(
      and(
        eq(entities.projectId, opts.projectId),
        eq(entities.type, "task"),
        isNull(entities.deletedAt)
      )
    )
    .groupBy(entities.status);

  const tasksByStatus: Record<string, number> = {};
  for (const r of tasksByStatusRows) tasksByStatus[r.status] = Number(r.count);

  const [openDecisionsRow] = await db
    .select({ count: count() })
    .from(entities)
    .where(
      and(
        eq(entities.projectId, opts.projectId),
        eq(entities.type, "decision"),
        eq(entities.status, "pending"),
        isNull(entities.deletedAt)
      )
    );

  const [recentInsightsRow] = await db
    .select({ count: count() })
    .from(entities)
    .where(
      and(
        eq(entities.projectId, opts.projectId),
        eq(entities.type, "insight"),
        gte(entities.createdAt, since),
        isNull(entities.deletedAt)
      )
    );

  const [totalEntitiesRow] = await db
    .select({ count: count() })
    .from(entities)
    .where(and(eq(entities.projectId, opts.projectId), isNull(entities.deletedAt)));

  const epicItems = await db
    .select()
    .from(epics)
    .where(and(eq(epics.projectId, opts.projectId), isNull(epics.deletedAt)))
    .orderBy(desc(epics.updatedAt), desc(epics.createdAt));

  const epicTaskCounts = await db
    .select({
      epicId: entities.epicId,
      status: entities.status,
      count: count(),
    })
    .from(entities)
    .where(
      and(
        eq(entities.projectId, opts.projectId),
        eq(entities.type, "task"),
        isNull(entities.deletedAt),
        sql`${entities.epicId} IS NOT NULL`
      )
    )
    .groupBy(entities.epicId, entities.status);

  const epicProgressById = new Map<string, { total: number; done: number; tasksByStatus: Record<string, number> }>();
  for (const row of epicTaskCounts) {
    const epicId = row.epicId as string;
    const agg = epicProgressById.get(epicId) ?? { total: 0, done: 0, tasksByStatus: {} };
    const n = Number(row.count);
    agg.total += n;
    agg.tasksByStatus[row.status] = (agg.tasksByStatus[row.status] ?? 0) + n;
    if (row.status === "done") agg.done += n;
    epicProgressById.set(epicId, agg);
  }

  const epicsSummary = epicItems.map((e) => {
    const agg = epicProgressById.get(e.id) ?? { total: 0, done: 0, tasksByStatus: {} };
    const percent = agg.total > 0 ? agg.done / agg.total : 0;
    return {
      epic: e,
      progress: {
        totalTasks: agg.total,
        doneTasks: agg.done,
        percent,
      },
      tasksByStatus: agg.tasksByStatus,
    };
  });

  const recentEntities = await db
    .select()
    .from(entities)
    .where(and(eq(entities.projectId, opts.projectId), isNull(entities.deletedAt)))
    .orderBy(desc(entities.createdAt), desc(entities.id))
    .limit(20);

  return {
    project,
    stats: {
      tasksByStatus,
      openDecisions: Number(openDecisionsRow?.count ?? 0),
      recentInsights: Number(recentInsightsRow?.count ?? 0),
      totalEntities: Number(totalEntitiesRow?.count ?? 0),
    },
    epics: epicsSummary,
    recentEntities,
  };
}

