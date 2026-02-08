// src/db/schema/relations.ts

import { relations } from "drizzle-orm";
import { users } from "./users.js";
import { projects } from "./projects.js";
import { epics } from "./epics.js";
import { entities } from "./entities.js";
import { rawNotes } from "./raw-notes.js";
import { entitySources } from "./entity-sources.js";
import { entityRelationships } from "./entity-relationships.js";
import { tags } from "./tags.js";
import { entityTags } from "./entity-tags.js";
import { reviewQueue } from "./review-queue.js";
import { entityEvents } from "./entity-events.js";
import { apiKeys } from "./api-keys.js";

// -- Users --
export const usersRelations = relations(users, ({ many }) => ({
  assignedEntities: many(entities),
  capturedNotes: many(rawNotes),
  reviewsResolved: many(reviewQueue),
  entityEvents: many(entityEvents),
  apiKeys: many(apiKeys),
}));

// -- Projects --
export const projectsRelations = relations(projects, ({ many }) => ({
  epics: many(epics),
  entities: many(entities),
  reviews: many(reviewQueue),
}));

// -- Epics --
export const epicsRelations = relations(epics, ({ one, many }) => ({
  project: one(projects, {
    fields: [epics.projectId],
    references: [projects.id],
  }),
  entities: many(entities),
}));

// -- Entities --
export const entitiesRelations = relations(entities, ({ one, many }) => ({
  project: one(projects, {
    fields: [entities.projectId],
    references: [projects.id],
  }),
  epic: one(epics, {
    fields: [entities.epicId],
    references: [epics.id],
  }),
  parentTask: one(entities, {
    fields: [entities.parentTaskId],
    references: [entities.id],
    relationName: "subtasks",
  }),
  subtasks: many(entities, { relationName: "subtasks" }),
  assignee: one(users, {
    fields: [entities.assigneeId],
    references: [users.id],
  }),
  // Many-to-many: entity <-> raw notes (via entity_sources)
  entitySources: many(entitySources),
  // Many-to-many: entity <-> tags (via entity_tags)
  entityTags: many(entityTags),
  // Graph edges where this entity is the source
  outgoingRelationships: many(entityRelationships, {
    relationName: "sourceEntity",
  }),
  // Graph edges where this entity is the target
  incomingRelationships: many(entityRelationships, {
    relationName: "targetEntity",
  }),
  // Review queue items for this entity
  reviews: many(reviewQueue),
  // Activity log
  events: many(entityEvents),
}));

// -- Raw Notes --
export const rawNotesRelations = relations(rawNotes, ({ one, many }) => ({
  capturedByUser: one(users, {
    fields: [rawNotes.capturedBy],
    references: [users.id],
  }),
  entitySources: many(entitySources),
  entityEvents: many(entityEvents),
}));

// -- Entity Sources (join table) --
export const entitySourcesRelations = relations(entitySources, ({ one }) => ({
  entity: one(entities, {
    fields: [entitySources.entityId],
    references: [entities.id],
  }),
  rawNote: one(rawNotes, {
    fields: [entitySources.rawNoteId],
    references: [rawNotes.id],
  }),
}));

// -- Entity Relationships (graph edges) --
export const entityRelationshipsRelations = relations(
  entityRelationships,
  ({ one }) => ({
    source: one(entities, {
      fields: [entityRelationships.sourceId],
      references: [entities.id],
      relationName: "sourceEntity",
    }),
    target: one(entities, {
      fields: [entityRelationships.targetId],
      references: [entities.id],
      relationName: "targetEntity",
    }),
  })
);

// -- Tags --
export const tagsRelations = relations(tags, ({ many }) => ({
  entityTags: many(entityTags),
}));

// -- Entity Tags (join table) --
export const entityTagsRelations = relations(entityTags, ({ one }) => ({
  entity: one(entities, {
    fields: [entityTags.entityId],
    references: [entities.id],
  }),
  tag: one(tags, {
    fields: [entityTags.tagId],
    references: [tags.id],
  }),
}));

// -- Review Queue --
export const reviewQueueRelations = relations(reviewQueue, ({ one }) => ({
  entity: one(entities, {
    fields: [reviewQueue.entityId],
    references: [entities.id],
  }),
  project: one(projects, {
    fields: [reviewQueue.projectId],
    references: [projects.id],
  }),
  resolver: one(users, {
    fields: [reviewQueue.resolvedBy],
    references: [users.id],
  }),
}));

// -- Entity Events --
export const entityEventsRelations = relations(entityEvents, ({ one }) => ({
  entity: one(entities, {
    fields: [entityEvents.entityId],
    references: [entities.id],
  }),
  actor: one(users, {
    fields: [entityEvents.actorUserId],
    references: [users.id],
  }),
  rawNote: one(rawNotes, {
    fields: [entityEvents.rawNoteId],
    references: [rawNotes.id],
  }),
}));

// -- API Keys --
export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));
