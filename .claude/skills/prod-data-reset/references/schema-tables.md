# PM Agent Database Schema — Table Reference

## FK Dependency Order (leaf → root)

Truncate in this order to respect foreign keys without CASCADE:

```
1. review_queue      (FK → entities, projects, users)
2. entity_events     (FK → entities, users, raw_notes)
3. entity_sources    (FK → entities, raw_notes)
4. entity_relationships (FK → entities, entities)
5. entity_tags       (FK → entities, tags)
6. entities          (FK → projects, epics, users; self-ref parentTaskId)
7. epics             (FK → projects)
8. raw_notes         (FK → users)
9. tags              (no FK)
10. projects         (no FK)
```

## Tables Preserved During Reset

These tables are NEVER truncated:

- `users` — User accounts
- `api_keys` — Authentication keys (FK → users)

## Table Details

| Table | Row Count Query | Notes |
|-------|----------------|-------|
| review_queue | `SELECT count(*) FROM review_queue` | Pending AI review items |
| entity_events | `SELECT count(*) FROM entity_events` | Activity log (comments, status changes) |
| entity_sources | `SELECT count(*) FROM entity_sources` | Join: entity ↔ raw_note |
| entity_relationships | `SELECT count(*) FROM entity_relationships` | Graph edges between entities |
| entity_tags | `SELECT count(*) FROM entity_tags` | Join: entity ↔ tag |
| entities | `SELECT count(*) FROM entities` | Core: tasks, decisions, insights |
| epics | `SELECT count(*) FROM epics` | Organizational grouping |
| raw_notes | `SELECT count(*) FROM raw_notes` | Captured input (notes, transcripts) |
| tags | `SELECT count(*) FROM tags` | Taxonomy labels |
| projects | `SELECT count(*) FROM projects` | Top-level containers |
| users | `SELECT count(*) FROM users` | **PRESERVED** |
| api_keys | `SELECT count(*) FROM api_keys` | **PRESERVED** |
