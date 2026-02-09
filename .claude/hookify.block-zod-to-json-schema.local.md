---
name: block-zod-to-json-schema
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.tsx?$
  - field: new_text
    operator: regex_match
    pattern: (from|require\s*\()\s*['"]zod-to-json-schema|zodToJsonSchema\s*\(
action: block
---

**BLOCKED: zod-to-json-schema is incompatible with Zod v4**

The `zod-to-json-schema` library (v3) produces **empty schemas** when used with Zod v4. This is a silent failure — no errors, no warnings, just broken AI tool calls.

**Use instead:** Zod v4's native method:
```typescript
import { z } from 'zod';
const jsonSchema = z.toJSONSchema(myZodSchema);
```

See `memory/compatibility-gotchas.md` for details. Fix commit: `6cd7765`.
