CREATE TYPE "public"."entity_event_type" AS ENUM('comment', 'status_change', 'reprocess');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('task', 'decision', 'insight');--> statement-breakpoint
CREATE TYPE "public"."epic_creator" AS ENUM('user', 'ai_suggestion');--> statement-breakpoint
CREATE TYPE "public"."note_source" AS ENUM('cli', 'slack', 'voice_memo', 'meeting_transcript', 'obsidian', 'mcp', 'api');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."relationship_type" AS ENUM('derived_from', 'related_to', 'promoted_to', 'duplicate_of');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'accepted', 'rejected', 'modified');--> statement-breakpoint
CREATE TYPE "public"."review_type" AS ENUM('type_classification', 'project_assignment', 'epic_assignment', 'epic_creation', 'duplicate_detection', 'low_confidence', 'assignee_suggestion');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "epics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"project_id" uuid NOT NULL,
	"created_by" "epic_creator" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "entity_type" NOT NULL,
	"content" text NOT NULL,
	"status" text NOT NULL,
	"project_id" uuid,
	"epic_id" uuid,
	"parent_task_id" uuid,
	"assignee_id" uuid,
	"confidence" real DEFAULT 1 NOT NULL,
	"attributes" jsonb,
	"ai_meta" jsonb,
	"evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "valid_entity_status" CHECK ((
        (type = 'task' AND status IN ('captured', 'needs_action', 'in_progress', 'done'))
        OR (type = 'decision' AND status IN ('pending', 'decided'))
        OR (type = 'insight' AND status IN ('captured', 'acknowledged'))
      )),
	CONSTRAINT "parent_task_only_for_tasks" CHECK ((type = 'task' OR parent_task_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "raw_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"source" "note_source" NOT NULL,
	"external_id" text,
	"source_meta" jsonb,
	"captured_by" uuid,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_sources" (
	"entity_id" uuid NOT NULL,
	"raw_note_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_sources_entity_id_raw_note_id_pk" PRIMARY KEY("entity_id","raw_note_id")
);
--> statement-breakpoint
CREATE TABLE "entity_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"relationship_type" "relationship_type" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "entity_tags" (
	"entity_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_tags_entity_id_tag_id_pk" PRIMARY KEY("entity_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid,
	"project_id" uuid,
	"review_type" "review_type" NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"ai_suggestion" jsonb NOT NULL,
	"ai_confidence" real NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"user_resolution" jsonb,
	"training_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_queue_entity_or_project" CHECK ((entity_id IS NOT NULL OR project_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "entity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"type" "entity_event_type" NOT NULL,
	"actor_user_id" uuid,
	"raw_note_id" uuid,
	"body" text,
	"old_status" text,
	"new_status" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_epic_id_epics_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."epics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_parent_task_id_entities_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_notes" ADD CONSTRAINT "raw_notes_captured_by_users_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_sources" ADD CONSTRAINT "entity_sources_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_sources" ADD CONSTRAINT "entity_sources_raw_note_id_raw_notes_id_fk" FOREIGN KEY ("raw_note_id") REFERENCES "public"."raw_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_source_id_entities_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_target_id_entities_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_tags" ADD CONSTRAINT "entity_tags_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_tags" ADD CONSTRAINT "entity_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_events" ADD CONSTRAINT "entity_events_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_events" ADD CONSTRAINT "entity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_events" ADD CONSTRAINT "entity_events_raw_note_id_raw_notes_id_fk" FOREIGN KEY ("raw_note_id") REFERENCES "public"."raw_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "epics_project_id_idx" ON "epics" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "entities_project_id_idx" ON "entities" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "entities_epic_id_idx" ON "entities" USING btree ("epic_id");--> statement-breakpoint
CREATE INDEX "entities_assignee_id_idx" ON "entities" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "entities_parent_task_id_idx" ON "entities" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "entities_project_type_status_idx" ON "entities" USING btree ("project_id","type","status");--> statement-breakpoint
CREATE INDEX "entities_confidence_idx" ON "entities" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "entities_active_idx" ON "entities" USING btree ("project_id","type") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "raw_notes_unprocessed_captured_at_idx" ON "raw_notes" USING btree ("captured_at","id") WHERE processed = false;--> statement-breakpoint
CREATE INDEX "raw_notes_source_idx" ON "raw_notes" USING btree ("source");--> statement-breakpoint
CREATE INDEX "raw_notes_captured_by_idx" ON "raw_notes" USING btree ("captured_by");--> statement-breakpoint
CREATE INDEX "raw_notes_captured_at_idx" ON "raw_notes" USING btree ("captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_notes_source_external_id_uq" ON "raw_notes" USING btree ("source","external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entity_sources_raw_note_id_idx" ON "entity_sources" USING btree ("raw_note_id");--> statement-breakpoint
CREATE INDEX "entity_rel_source_id_idx" ON "entity_relationships" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "entity_rel_target_id_idx" ON "entity_relationships" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "entity_rel_type_idx" ON "entity_relationships" USING btree ("relationship_type");--> statement-breakpoint
CREATE INDEX "entity_rel_source_type_idx" ON "entity_relationships" USING btree ("source_id","relationship_type");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_rel_unique_edge_uq" ON "entity_relationships" USING btree ("source_id","target_id","relationship_type");--> statement-breakpoint
CREATE INDEX "review_queue_pending_idx" ON "review_queue" USING btree ("created_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "review_queue_entity_id_idx" ON "review_queue" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "review_queue_project_id_idx" ON "review_queue" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "review_queue_review_type_idx" ON "review_queue" USING btree ("review_type");--> statement-breakpoint
CREATE INDEX "review_queue_resolved_idx" ON "review_queue" USING btree ("status","resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_queue_pending_unique_entity_review_type" ON "review_queue" USING btree ("entity_id","review_type") WHERE status = 'pending' AND entity_id IS NOT NULL AND review_type <> 'low_confidence';--> statement-breakpoint
CREATE INDEX "entity_events_entity_id_created_at_idx" ON "entity_events" USING btree ("entity_id","created_at");--> statement-breakpoint
CREATE INDEX "entity_events_actor_user_id_idx" ON "entity_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_uq" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_active_lookup_idx" ON "api_keys" USING btree ("key_hash","revoked_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_epics_updated_at
  BEFORE UPDATE ON epics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER trg_review_queue_updated_at
  BEFORE UPDATE ON review_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION get_entity_lineage(
  p_entity_id UUID,
  p_direction TEXT DEFAULT 'both',
  p_max_depth INT DEFAULT 20,
  p_relationship_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  entity_id UUID,
  entity_type TEXT,
  entity_content TEXT,
  entity_status TEXT,
  relationship_type TEXT,
  relationship_direction TEXT,
  depth INT,
  path UUID[]
)
LANGUAGE sql STABLE
AS $$
  WITH RECURSIVE ancestors AS (
    SELECT
      er.source_id AS entity_id,
      er.relationship_type::TEXT,
      'ancestor'::TEXT AS relationship_direction,
      1 AS depth,
      ARRAY[p_entity_id, er.source_id] AS path
    FROM entity_relationships er
    WHERE er.target_id = p_entity_id
      AND (p_direction IN ('ancestors', 'both'))
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))

    UNION ALL

    SELECT
      er.source_id,
      er.relationship_type::TEXT,
      'ancestor'::TEXT,
      a.depth + 1,
      a.path || er.source_id
    FROM entity_relationships er
    JOIN ancestors a ON er.target_id = a.entity_id
    WHERE a.depth < p_max_depth
      AND NOT (er.source_id = ANY(a.path))
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))
  ),

  descendants AS (
    SELECT
      er.target_id AS entity_id,
      er.relationship_type::TEXT,
      'descendant'::TEXT AS relationship_direction,
      1 AS depth,
      ARRAY[p_entity_id, er.target_id] AS path
    FROM entity_relationships er
    WHERE er.source_id = p_entity_id
      AND (p_direction IN ('descendants', 'both'))
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))

    UNION ALL

    SELECT
      er.target_id,
      er.relationship_type::TEXT,
      'descendant'::TEXT,
      d.depth + 1,
      d.path || er.target_id
    FROM entity_relationships er
    JOIN descendants d ON er.source_id = d.entity_id
    WHERE d.depth < p_max_depth
      AND NOT (er.target_id = ANY(d.path))
      AND (p_relationship_types IS NULL OR er.relationship_type::TEXT = ANY(p_relationship_types))
  ),

  combined AS (
    SELECT * FROM ancestors
    UNION ALL
    SELECT * FROM descendants
  )

  SELECT
    c.entity_id,
    e.type::TEXT AS entity_type,
    e.content AS entity_content,
    e.status AS entity_status,
    c.relationship_type,
    c.relationship_direction,
    c.depth,
    c.path
  FROM combined c
  JOIN entities e ON e.id = c.entity_id
  WHERE e.deleted_at IS NULL
  ORDER BY c.relationship_direction, c.depth, c.entity_id;
$$;
