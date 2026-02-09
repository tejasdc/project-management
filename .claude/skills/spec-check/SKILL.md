---
name: spec-check
description: "Detect drift between code implementation and design docs/PRD. Use after implementing features, before PRs, or when reviewing code quality. Launches a subagent to compare schemas, enums, API responses, and extraction pipeline against docs."
user_invocable: true
---

# Spec Check

Detect schema/PRD drift by comparing the codebase against design documents.

## When to Use

- After implementing a batch of user stories
- Before creating a PR for feature work
- When asked to "check spec compliance" or "verify against the PRD"
- During code review to catch drift

## Workflow

Launch a `general-purpose` subagent with the following prompt. Do NOT run this in the main context — it reads many files.

### Subagent Prompt

```
Compare the PM Agent implementation against its design documents and report any drift.

## Documents to read:
1. `docs/project-management-agent.md` — design doc with 32 key decisions
2. `docs/database-schema.md` — full schema spec
3. `docs/extraction-prompts.md` — AI extraction schema and prompt spec

## Code to check:
1. `packages/api/src/db/schema/*.ts` — Drizzle table definitions
2. `packages/api/src/ai/schemas/*.ts` — extraction/organization Zod schemas
3. `packages/api/src/ai/extraction.ts` — Phase A extraction
4. `packages/api/src/ai/organization.ts` — Phase B organization
5. `packages/api/src/routes/*.ts` — API route handlers
6. `packages/api/src/services/*.ts` — business logic
7. `packages/shared/src/types.ts` — shared TypeScript types

## Check for these drift categories:

### 1. JSONB Shape Drift
Compare JSONB column types in schema files against `packages/shared/src/types.ts` and `docs/database-schema.md`. Check:
- `entity_sources.evidence` shape (quote, offset, permalink, confidence?)
- `entities.attributes` shape per entity type
- `entities.ai_meta` shape (model, extractedAt, tokenUsage, fieldConfidence)
- `review_queue.ai_suggestion` shape per review type

### 2. Enum Drift
Compare enums in `packages/api/src/db/schema/enums.ts` against docs. Check:
- Entity types, statuses, priorities
- Review types and statuses
- Note source types

### 3. Constraint Drift
Compare CHECK constraints, unique indexes, and partial indexes against `docs/database-schema.md`. Especially:
- `review_queue` uniqueness constraint (pending + entity_id + review_type)
- `raw_notes` external_id uniqueness
- `entity_relationships` pair uniqueness

### 4. API Response Drift
Compare route handlers against design doc API specs. Check:
- Pagination envelope shape (items, nextCursor, limit)
- Error response shape (error.code, error.message, error.details)
- Health check response shape

### 5. Extraction Pipeline Drift
Compare AI schemas against `docs/extraction-prompts.md`. Check:
- Phase A extraction output schema matches doc
- Phase B organization output schema matches doc
- Few-shot examples are present and match doc
- Evidence fields include all required properties

## Output Format

For each drift found, report:
| Category | File | Expected (from docs) | Actual (in code) | Severity |
|----------|------|---------------------|-------------------|----------|

Severity levels: CRITICAL (breaks data integrity), HIGH (incorrect behavior), LOW (cosmetic/naming)
```

## After Review

Present the drift table to the user and ask which items to fix. For CRITICAL items, recommend immediate fixes. For LOW items, ask if the docs should be updated instead.

## Important

- This skill is READ-ONLY — it does not make changes
- Always run the subagent, don't try to do this in the main context
- If drift is found, the fix might be in the code OR in the docs — discuss with the user
