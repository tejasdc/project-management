CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`avatar_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "projects_status_values" CHECK("projects"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `epics` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`project_id` text NOT NULL,
	`created_by` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "epics_createdBy_values" CHECK("epics"."created_by" IN ('user', 'ai_suggestion'))
);
--> statement-breakpoint
CREATE INDEX `epics_project_id_idx` ON `epics` (`project_id`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`project_id` text,
	`epic_id` text,
	`parent_task_id` text,
	`assignee_id` text,
	`confidence` real DEFAULT 1 NOT NULL,
	`attributes` text,
	`ai_meta` text,
	`evidence` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_task_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "entities_type_values" CHECK("entities"."type" IN ('task', 'decision', 'insight')),
	CONSTRAINT "valid_entity_status" CHECK((
        (type = 'task' AND status IN ('captured', 'needs_action', 'in_progress', 'done'))
        OR (type = 'decision' AND status IN ('pending', 'decided'))
        OR (type = 'insight' AND status IN ('captured', 'acknowledged'))
      )),
	CONSTRAINT "parent_task_only_for_tasks" CHECK((type = 'task' OR parent_task_id IS NULL))
);
--> statement-breakpoint
CREATE INDEX `entities_project_id_idx` ON `entities` (`project_id`);--> statement-breakpoint
CREATE INDEX `entities_epic_id_idx` ON `entities` (`epic_id`);--> statement-breakpoint
CREATE INDEX `entities_assignee_id_idx` ON `entities` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `entities_parent_task_id_idx` ON `entities` (`parent_task_id`);--> statement-breakpoint
CREATE INDEX `entities_project_type_status_idx` ON `entities` (`project_id`,`type`,`status`);--> statement-breakpoint
CREATE INDEX `entities_confidence_idx` ON `entities` (`confidence`);--> statement-breakpoint
CREATE INDEX `entities_active_idx` ON `entities` (`project_id`,`type`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `raw_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`source_meta` text,
	`captured_by` text,
	`captured_at` integer NOT NULL,
	`processed` integer DEFAULT false NOT NULL,
	`processed_at` integer,
	`processing_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`captured_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "raw_notes_source_values" CHECK("raw_notes"."source" IN ('cli', 'slack', 'voice_memo', 'meeting_transcript', 'obsidian', 'mcp', 'api'))
);
--> statement-breakpoint
CREATE INDEX `raw_notes_unprocessed_captured_at_idx` ON `raw_notes` (`captured_at`,`id`) WHERE processed = false;--> statement-breakpoint
CREATE INDEX `raw_notes_source_idx` ON `raw_notes` (`source`);--> statement-breakpoint
CREATE INDEX `raw_notes_captured_by_idx` ON `raw_notes` (`captured_by`);--> statement-breakpoint
CREATE INDEX `raw_notes_captured_at_idx` ON `raw_notes` (`captured_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `raw_notes_source_external_id_uq` ON `raw_notes` (`source`,`external_id`) WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `entity_sources` (
	`entity_id` text NOT NULL,
	`raw_note_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`entity_id`, `raw_note_id`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`raw_note_id`) REFERENCES `raw_notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entity_sources_raw_note_id_idx` ON `entity_sources` (`raw_note_id`);--> statement-breakpoint
CREATE TABLE `entity_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "entity_relationships_relationshipType_values" CHECK("entity_relationships"."relationship_type" IN ('derived_from', 'related_to', 'promoted_to', 'duplicate_of'))
);
--> statement-breakpoint
CREATE INDEX `entity_rel_source_id_idx` ON `entity_relationships` (`source_id`);--> statement-breakpoint
CREATE INDEX `entity_rel_target_id_idx` ON `entity_relationships` (`target_id`);--> statement-breakpoint
CREATE INDEX `entity_rel_type_idx` ON `entity_relationships` (`relationship_type`);--> statement-breakpoint
CREATE INDEX `entity_rel_source_type_idx` ON `entity_relationships` (`source_id`,`relationship_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `entity_rel_unique_edge_uq` ON `entity_relationships` (`source_id`,`target_id`,`relationship_type`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `entity_tags` (
	`entity_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`entity_id`, `tag_id`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `review_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text,
	`project_id` text,
	`review_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`ai_suggestion` text NOT NULL,
	`ai_confidence` real NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`user_resolution` text,
	`training_comment` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "review_queue_reviewType_values" CHECK("review_queue"."review_type" IN ('type_classification', 'project_assignment', 'epic_assignment', 'epic_creation', 'project_creation', 'duplicate_detection', 'low_confidence', 'assignee_suggestion')),
	CONSTRAINT "review_queue_status_values" CHECK("review_queue"."status" IN ('pending', 'accepted', 'rejected', 'modified')),
	CONSTRAINT "review_queue_entity_or_project" CHECK((entity_id IS NOT NULL OR project_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `review_queue_pending_idx` ON `review_queue` (`created_at`) WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX `review_queue_entity_id_idx` ON `review_queue` (`entity_id`);--> statement-breakpoint
CREATE INDEX `review_queue_project_id_idx` ON `review_queue` (`project_id`);--> statement-breakpoint
CREATE INDEX `review_queue_review_type_idx` ON `review_queue` (`review_type`);--> statement-breakpoint
CREATE INDEX `review_queue_resolved_idx` ON `review_queue` (`status`,`resolved_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_queue_pending_unique_entity_review_type` ON `review_queue` (`entity_id`,`review_type`) WHERE status = 'pending' AND entity_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `entity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_user_id` text,
	`raw_note_id` text,
	`body` text,
	`old_status` text,
	`new_status` text,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`raw_note_id`) REFERENCES `raw_notes`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "entity_events_type_values" CHECK("entity_events"."type" IN ('comment', 'status_change', 'reprocess'))
);
--> statement-breakpoint
CREATE INDEX `entity_events_entity_id_created_at_idx` ON `entity_events` (`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `entity_events_actor_user_id_idx` ON `entity_events` (`actor_user_id`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_uq` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_active_lookup_idx` ON `api_keys` (`key_hash`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `note_pages` (
	`raw_note_id` text NOT NULL,
	`page` integer NOT NULL,
	`bytes` blob NOT NULL,
	PRIMARY KEY(`raw_note_id`, `page`),
	FOREIGN KEY (`raw_note_id`) REFERENCES `raw_notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `processing_jobs` (
	`raw_note_id` text PRIMARY KEY NOT NULL,
	`generation` text NOT NULL,
	`step` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer NOT NULL,
	`entity_ids` text DEFAULT '[]' NOT NULL,
	`error` text,
	FOREIGN KEY (`raw_note_id`) REFERENCES `raw_notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `processing_jobs_due` ON `processing_jobs` (`status`,`next_attempt`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expiration` ON `rate_limits` (`expires_at`);