---
name: block-queue-colons
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: packages/api/src/
  - field: new_text
    operator: regex_match
    pattern: new\s+(Queue|Worker)\s*\(\s*['"][^'"]*:[^'"]*['"]
action: block
---

**BLOCKED: BullMQ queue names cannot contain colons**

BullMQ uses `:` internally as a Redis key separator. Queue names with colons (like `notes:extract`) create malformed Redis keys, causing jobs to be enqueued but **never processed**.

**Use hyphens instead:**
- `notes-extract` (not `notes:extract`)
- `entities-organize` (not `entities:organize`)
- `notes-reprocess` (not `notes:reprocess`)

See `memory/compatibility-gotchas.md` for details. Fix commit: `a7dbb48`.
