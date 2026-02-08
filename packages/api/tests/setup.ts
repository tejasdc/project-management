import { beforeEach } from "vitest";
import { sql as dsql } from "drizzle-orm";

beforeEach(async () => {
  const { db } = await import("../src/db/index.js");
  // Wipe all app tables for isolation.
  await db.execute(
    dsql`
      truncate table
        api_keys,
        entity_events,
        entity_relationships,
        entity_sources,
        entity_tags,
        review_queue,
        entities,
        epics,
        projects,
        raw_notes,
        tags,
        users
      cascade
    `
  );
});
