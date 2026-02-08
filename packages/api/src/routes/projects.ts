import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import type { AppEnv } from "../types/env.js";
import { projectInsertSchema } from "../db/validation.js";
import { notFound } from "../lib/errors.js";
import { parseOptionalBoolean } from "../lib/pagination.js";
import { createProject, getProjectDashboard, listProjects, patchProject } from "../services/projects.js";

const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const listProjectsQuerySchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
  includeDeleted: z.string().optional(),
});

const projectPatchSchema = projectInsertSchema
  .pick({ name: true, description: true, status: true, deletedAt: true })
  .partial();

const dashboardQuerySchema = z.object({
  since: z.string().datetime().optional(),
});

export const projectRoutes = new Hono<AppEnv>()
  .get(
    "/",
    zValidator("query", listProjectsQuerySchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const q = c.req.valid("query");
      const includeDeleted = parseOptionalBoolean(q.includeDeleted) ?? false;
      const res = await listProjects({ status: q.status, includeDeleted });
      return c.json(res);
    }
  )
  .post(
    "/",
    zValidator("json", projectInsertSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const data = c.req.valid("json");
      const project = await createProject(data as any);
      return c.json({ project }, 201);
    }
  )
  .patch(
    "/:id",
    zValidator("param", projectIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    zValidator("json", projectPatchSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const project = await patchProject({ id, patch: patch as any });
      return c.json({ project });
    }
  )
  .get(
    "/:id/dashboard",
    zValidator("param", projectIdParamsSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    zValidator("query", dashboardQuerySchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const q = c.req.valid("query");
      const res = await getProjectDashboard({ projectId: id, since: q.since });
      return c.json(res);
    }
  );

