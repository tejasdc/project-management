# AI-Powered Entity Extraction from Unstructured Text: Landscape Research

**Date**: 2026-02-07
**Purpose**: Inform the design of a system that ingests raw notes (quick captures, Slack messages, meeting transcripts) and uses AI to extract typed entities (task, decision, insight) with relationships between them.

---

## Table of Contents

1. [Existing Tools and Products](#1-existing-tools-and-products)
2. [Open-Source Projects and Frameworks](#2-open-source-projects-and-frameworks)
3. [Data Models for Extracted Entities](#3-data-models-for-extracted-entities)
4. [Common Failure Modes](#4-common-failure-modes)
5. [Best Practices for AI Extraction Pipelines](#5-best-practices-for-ai-extraction-pipelines)
6. [Recommended Architecture for Our System](#6-recommended-architecture-for-our-system)

---

## 1. Existing Tools and Products

### Tier 1: Meeting-Centric Extraction (Record -> Transcribe -> Extract)

These tools start with audio, transcribe it, and extract structured entities from the transcript.

#### Fireflies.ai
- **What it does**: Records meetings across Zoom/Teams/Meet, transcribes, and extracts action items, decisions, key topics, and sentiment.
- **Data model**: GraphQL API exposing `Transcript` objects containing `sentences` (with `raw_text`, `speaker_name`, `start_time`), `summary` (with `action_items`, `keywords`, `outline`, `topics_discussed`, `meeting_type`), `participants`, `speakers`, and `analytics` (sentiment, categories).
- **What works**: Strong API (GraphQL), pre-built NLP layer with custom topic categories, integration ecosystem. Now has an MCP server for direct AI agent access to meeting data.
- **What does not work**: Extraction is meeting-scoped -- no cross-meeting entity resolution. Action items are flat strings, not structured objects with assignees/deadlines parsed out.
- **Source**: https://docs.fireflies.ai/schema/transcript

#### Otter.ai
- **What it does**: Real-time transcription with topic segmentation, highlight summaries, and action items.
- **Data model**: Transcriptions segmented into topical sections. "Highlight summaries" mark key takeaways. Action items are tagged but not deeply structured.
- **What works**: Real-time collaborative editing of transcripts; strong speaker identification.
- **What does not work**: Limited API access; action items lack assignee/deadline parsing; no cross-session deduplication.

#### Circleback.ai (YC W24)
- **What it does**: Records meetings, extracts action items, and automatically creates issues in Linear, Notion, HubSpot, Salesforce.
- **Data model**: Extracts structured data with assignee names, due dates, and task descriptions. Routes to external project management systems.
- **What works**: Excellent downstream integration -- automatically creates Linear issues from feature requests mentioned in product demos. Demonstrates the "extraction-to-action" pipeline well.
- **What does not work**: Tied to meeting context; does not handle asynchronous text inputs like Slack messages or quick notes.
- **Source**: https://circleback.ai/

#### Granola.ai ($250M valuation, Series B May 2025)
- **What it does**: "Sidecar" architecture that captures meeting audio locally (no bot joins), transcribes in real-time, purges audio, keeps only transcripts and summaries.
- **Data model**: Notion-style editable notes with templates. "Recipes" transform meeting notes into structured business artifacts (Jira tickets, PRDs, coaching feedback).
- **What works**: Privacy-first (no stored audio). Recipes concept is compelling -- user-defined extraction templates that produce typed outputs. Human notes used as "anchors" alongside AI transcription for better extraction.
- **What does not work**: Desktop-only capture model; recipes are output-focused rather than building a persistent entity graph.
- **Source**: https://www.granola.ai/

### Tier 2: Knowledge-Centric Extraction (Note -> Organize -> Connect)

These tools focus on organizing existing text into connected knowledge.

#### Notion AI
- **What it does**: Scans pages to extract action items, summaries, key decisions. AI Meeting Notes feature records, transcribes, and generates structured summaries.
- **Data model**: Action items extracted as database entries with properties (assignee via @mention, due date, status). Uses sub-processors including OpenAI, Anthropic, Fireworks, and Baseten Labs.
- **What works**: Tight integration between extraction and the existing database/page model. Extracted action items become first-class database rows that can be assigned, filtered, and tracked.
- **What does not work**: Extraction is page-scoped; cross-page entity resolution is weak. No confidence scoring exposed to users.
- **Source**: https://www.notion.com/product/ai-meeting-notes

#### Mem.ai
- **What it does**: AI-first note-taking with automatic organization. Knowledge graph that "extracts entities out of other entities to generate new knowledge."
- **Data model**: Notes connected via `[[double bracket]]` syntax forming a knowledge graph. Graph visualization reveals clusters and patterns. Entity extraction feeds the graph.
- **What works**: The knowledge graph approach is the closest to what we want -- entities are not isolated, they form a connected web. Automatic organization removes manual filing.
- **What does not work**: Opaque extraction process; limited control over entity types; consumer-focused rather than team-oriented.

#### Reflect
- **What it does**: Networked note-taking with AI assistance. Backlinks create a graph of connected notes.
- **Data model**: Notes as nodes, backlinks as edges. AI summarization and connection suggestions.
- **What works**: Clean graph model; AI suggests connections between notes.
- **What does not work**: Manual capture-heavy; limited automated extraction from unstructured text.

### Tier 3: Context/Memory Layer Platforms (Ingest -> Extract -> Graph -> Query)

These are infrastructure platforms designed to be the memory layer for AI agents.

#### Graphlit
- **What it does**: Cloud platform that ingests multimodal content (PDFs, emails, meeting transcripts, Slack messages) and transforms them into an identity-resolved, time-aware knowledge graph.
- **Data model**: For each entity mention, creates an `Observation` with:
  - `type`: PERSON, ORGANIZATION, PRODUCT, EVENT, etc.
  - `confidence`: 0.0-1.0
  - `page_number` and `coordinates`
  - `text_context`
  - Automatic entity deduplication/resolution
  - Canonical entities aligned with Schema.org standards
- **What works**: Best-in-class provenance model. Entity resolution across documents ("Sarah Chen" resolved and connected to every conversation, document, and decision she has been part of). Time-aware queries ("Alice from Acme Corp mentioned pricing on Oct 15"). Slack integration turns channel history into searchable knowledge.
- **What does not work**: Focused on general entities (people, orgs, places) rather than action-typed entities (tasks, decisions, insights). Cloud-only.
- **Source**: https://www.graphlit.com/

#### Zep / Graphiti (Open Source)
- **What it does**: Temporal knowledge graph architecture for AI agent memory. Three-tier subgraph: episodes (raw data), semantic entities (extracted), communities (clusters).
- **Data model**:
  - **Episode nodes**: Raw input (messages, text, JSON) -- non-lossy data store
  - **Entity nodes**: Extracted via semantic processing, embedded in 1024D space for similarity computation
  - **Community nodes**: Clusters of connected entities with high-level summaries
  - Temporal awareness: entities have timestamps, relationships evolve over time
- **What works**: Mirrors human memory (episodic vs. semantic). Always keeps raw source data. Entity extraction processes both current and recent context (last N messages). Open source (Graphiti library on GitHub). 94.8% accuracy on Deep Memory Retrieval benchmark.
- **What does not work**: Designed for agent memory, not project management. Entity types are generic. No built-in concept of "task" or "decision" as first-class types.
- **Source**: https://github.com/getzep/graphiti, https://arxiv.org/abs/2501.13956

#### Relevance AI
- **What it does**: Template-based AI pipeline platform with pre-built templates for meeting transcript extraction.
- **Data model**: User-defined extraction schemas. Categorizes into predefined data points (use cases, pain points, feature requests). GPT-4 powered multi-stage analysis.
- **What works**: Flexible schema definition; good for custom entity types; tracks relationships between discussion points.
- **What does not work**: Template-based approach requires upfront schema design; no automatic entity resolution.
- **Source**: https://relevanceai.com/templates/extract-data-from-meeting-transcripts

---

## 2. Open-Source Projects and Frameworks

### Extraction Frameworks

#### Instructor (Python) -- 11k+ GitHub stars, 3M+ monthly downloads
- **What it is**: The most popular library for extracting structured data from LLMs using Pydantic models.
- **How it works**: Define a Pydantic model describing your desired output shape. Instructor patches the LLM client to enforce schema compliance, with automatic retries on validation failure.
- **Why it matters for us**: This is the extraction engine we should build on. Define `Task`, `Decision`, `Insight` as Pydantic models, and Instructor handles the structured extraction + validation loop.
- **Supports**: OpenAI, Anthropic, Google, Mistral, Cohere, Ollama, DeepSeek, and 15+ providers.
- **Source**: https://github.com/567-labs/instructor

#### Google LangExtract
- **What it is**: Python library for extracting structured info from unstructured text with precise source grounding.
- **Key innovation -- source grounding**: Every extraction is mapped to exact character offsets in the source text, enabling visual highlighting for traceability.
- **Data model**:
  ```
  Extraction:
    extraction_class: str  (entity type, e.g., "character", "medication")
    extraction_text: str   (verbatim text from source -- no paraphrasing)
    attributes: dict       (key-value pairs for context)
  ```
- **Long document strategy**: Text chunking (configurable `max_char_buffer`), parallel processing (`max_workers`), multi-pass extraction (`extraction_passes`) for higher recall.
- **Output**: JSONL format with interactive HTML visualization.
- **Source**: https://github.com/google/langextract

#### DSPy (Stanford NLP)
- **What it is**: Framework for optimizing LLM prompts programmatically. Entity extraction tutorial demonstrates Pydantic-based extraction with automatic prompt optimization.
- **How it works**: Define a `Signature` (input/output spec), wrap in `ChainOfThought`, and DSPy auto-optimizes the prompt using training examples. Automatic schema validation with re-prompting on errors.
- **Why it matters for us**: Could be used to optimize our extraction prompts over time using corrected examples as training data.
- **Source**: https://dspy.ai/tutorials/entity_extraction/

#### LlamaExtract (LlamaIndex)
- **What it is**: Managed service for structured extraction from documents. VLM-powered with confidence scores and citations.
- **How it works**: Two-step: (1) infer or define a schema (Pydantic -> JSON schema), (2) extract values according to schema. Outputs JSON.
- **Why it matters for us**: Demonstrates the schema-first approach with confidence scoring.
- **Source**: https://www.llamaindex.ai/llamaextract

### Task-Specific Open Source

#### saksham-jain177/task_extraction
- **What it is**: Heuristic-based NLP pipeline for extracting actionable tasks from unstructured text.
- **Techniques**: Part-of-speech tagging, imperative verb detection ("begins with a base-form verb"), modal phrase detection ("has to", "should", "must", "needs to"), regex-based deadline extraction, regex-based responsible person extraction.
- **Categorization**: Keyword matching against predefined categories + optional LDA topic modeling.
- **Data model**: Task sentence + responsible person + deadline + category.
- **Source**: https://github.com/saksham-jain177/task_extraction

#### OpenNRE (Tsinghua University)
- **What it is**: Neural Relation Extraction toolkit for extracting relations between entities.
- **Why it matters for us**: Useful for extracting relationships between entities (e.g., "Task X blocks Task Y", "Decision D relates to Task T").
- **Source**: https://github.com/thunlp/OpenNRE

#### dedupeio/dedupe
- **What it is**: Python library for fuzzy matching, record deduplication, and entity resolution.
- **Why it matters for us**: Critical for resolving "the same task mentioned in three different meetings" into a single entity.
- **Source**: https://github.com/dedupeio/dedupe

#### Open Semantic Entity Search API
- **What it is**: REST API for named entity extraction, linking, disambiguation, and reconciliation against knowledge graphs (SKOS, RDF ontologies, databases).
- **Source**: https://github.com/opensemanticsearch/open-semantic-entity-search-api

---

## 3. Data Models for Extracted Entities

### Model A: Flat Extraction (Fireflies/Otter/Circleback pattern)

```
ExtractedItem:
  id: uuid
  type: "action_item" | "decision" | "key_point"
  text: string              # raw extracted text
  assignee: string?         # parsed from text
  due_date: datetime?       # parsed from text
  source_transcript_id: uuid
  source_timestamp: datetime
  meeting_title: string
```

**Pros**: Simple, fast to implement, easy to push to Linear/Jira.
**Cons**: No relationships between entities; no cross-source deduplication; assignee/date parsing is brittle; no confidence scoring.

### Model B: Schema-First Typed Extraction (Instructor/LlamaExtract pattern)

```python
class Task(BaseModel):
    title: str
    description: str
    assignee: str | None
    due_date: datetime | None
    priority: Literal["high", "medium", "low"] | None
    status: Literal["open", "in_progress", "done"] = "open"

class Decision(BaseModel):
    title: str
    description: str
    decided_by: list[str]
    rationale: str | None
    alternatives_considered: list[str] | None

class Insight(BaseModel):
    title: str
    description: str
    category: str | None  # e.g., "risk", "opportunity", "observation"
    related_entities: list[str] | None

class ExtractionResult(BaseModel):
    tasks: list[Task]
    decisions: list[Decision]
    insights: list[Insight]
    confidence: float  # 0.0-1.0
```

**Pros**: Type-safe, validates automatically, LLM enforces schema, extensible.
**Cons**: Schema must be pre-defined; novel entity types get missed; no source grounding.

### Model C: Graph-Based with Provenance (Graphlit/Zep pattern)

```
Entity:
  id: uuid
  canonical_name: string
  type: TASK | DECISION | INSIGHT | PERSON | PROJECT | ...
  attributes: jsonb
  embedding: vector(1024)
  created_at: timestamp
  updated_at: timestamp

Observation (provenance link):
  id: uuid
  entity_id: uuid -> Entity
  source_id: uuid -> Source
  source_type: "meeting_transcript" | "slack_message" | "quick_note"
  extracted_text: string          # verbatim from source
  char_offset_start: int          # exact position in source
  char_offset_end: int
  confidence: float               # 0.0-1.0
  extracted_at: timestamp
  extraction_model: string        # e.g., "claude-3.5-sonnet"
  extraction_prompt_hash: string  # for reproducibility
  reviewed: boolean               # human verification
  reviewer_id: uuid?

Relationship:
  id: uuid
  from_entity_id: uuid -> Entity
  to_entity_id: uuid -> Entity
  type: "blocks" | "relates_to" | "decided_by" | "assigned_to" | "part_of"
  attributes: jsonb
  source_observation_id: uuid -> Observation  # provenance for the relationship too

Source:
  id: uuid
  type: "meeting_transcript" | "slack_message" | "quick_note"
  raw_content: text
  metadata: jsonb  # channel, participants, timestamp, etc.
  ingested_at: timestamp
```

**Pros**: Full provenance chain (entity -> observation -> source). Supports entity resolution and deduplication. Relationships are first-class. Confidence scoring enables review workflows. Embedding enables semantic similarity for dedup.
**Cons**: More complex to implement. Requires entity resolution logic. Query patterns are more complex.

### Model D: Three-Tier Memory (Zep/Graphiti pattern)

```
Episode (raw, non-lossy):
  id: uuid
  content: text                   # raw input
  source_type: string
  metadata: jsonb
  created_at: timestamp

SemanticEntity (extracted, deduped):
  id: uuid
  name: string
  type: string
  summary: text                   # AI-generated summary
  embedding: vector(1024)
  episode_ids: uuid[]             # which episodes mention this
  created_at: timestamp
  updated_at: timestamp

Community (clustered):
  id: uuid
  name: string
  summary: text                   # high-level cluster summary
  entity_ids: uuid[]
  created_at: timestamp
```

**Pros**: Never loses raw data. Mirrors human memory. Communities provide high-level project views automatically.
**Cons**: Three layers of abstraction is complex. Community detection algorithms needed.

### Provenance Standards: W3C PROV-DM

The W3C PROV Data Model (https://www.w3.org/TR/prov-dm/) provides a domain-agnostic standard for provenance with three core concepts:
- **Entity**: The thing whose origin we track
- **Activity**: The process that produced the entity
- **Agent**: Who/what performed the activity

This maps cleanly to our domain:
- Entity = extracted Task/Decision/Insight
- Activity = the extraction run (with model, prompt, timestamp)
- Agent = the AI model + human reviewer

---

## 4. Common Failure Modes

### 4.1 Over-Extraction
- **Problem**: AI extracts too many entities, flooding the system with noise. Every statement becomes a "task" or "insight."
- **Example**: "We should think about redesigning the dashboard" gets extracted as a high-priority task when it was casual brainstorming.
- **Mitigation**: Confidence thresholds (only surface entities above 0.8); distinguish between "someone should do X" (task) vs. "we discussed X" (topic); use few-shot examples showing what NOT to extract.

### 4.2 Under-Extraction (Missed Entities)
- **Problem**: Important commitments are buried in conversational language and missed.
- **Example**: "I'll have that to you by Friday" is a clear commitment but lacks explicit task keywords.
- **Mitigation**: Multi-pass extraction (LangExtract approach); train on examples of implicit commitments; process both current and recent context (Zep's "last N messages" approach).

### 4.3 Wrong Entity Type Classification
- **Problem**: A decision gets classified as a task, or a risk gets classified as an insight.
- **Example**: "We decided to go with Postgres" extracted as a task instead of a decision.
- **Mitigation**: Clear type definitions in the prompt with discriminating examples; chain-of-thought prompting where the model explains its classification before outputting.

### 4.4 Hallucinated Details
- **Problem**: LLM invents assignees, deadlines, or details not in the source text.
- **Example**: Source says "someone should handle the deployment" -> LLM extracts `assignee: "John"` even though John was not mentioned.
- **Evidence**: OpenSanctions documented LLMs hallucinating birthDate, birthPlace, and relationship types not present in source text. Names get "cleaned too much" -- junior suffixes dropped, unnamed individuals given placeholder names.
- **Mitigation**: Source grounding (LangExtract pattern -- map every extraction to exact character offsets); instruct model to use `null` for absent fields; validate extracted names against participant list.
- **Source**: https://www.opensanctions.org/articles/everything-that-goes-wrong-ai-text-extraction/

### 4.5 Poor Deduplication / Entity Resolution
- **Problem**: The same task mentioned in three meetings creates three separate task entities.
- **Example**: "Migrate to the new API" discussed on Monday, Wednesday, and Friday creates three tasks.
- **Mitigation**: Entity resolution using semantic similarity (cosine distance on embeddings); fuzzy matching (dedupe library); check existing entities before creating new ones; present candidates for human confirmation.

### 4.6 Wrong Project/Context Routing
- **Problem**: Extracted entity gets associated with the wrong project or context.
- **Example**: In a cross-team meeting, a task about "Project Alpha" gets routed to "Project Beta" because both were discussed.
- **Mitigation**: Extract project associations explicitly; use participant list and channel metadata to infer project; require human confirmation for ambiguous routing.

### 4.7 Inconsistent Extraction Across Runs
- **Problem**: Running the same extraction twice produces different results.
- **Evidence**: GDELT Project found LLMs "must often be run multiple times over the same passage, yielding different results each time."
- **Mitigation**: Low temperature settings; structured output mode (not free-form); log extraction parameters for reproducibility; use deterministic post-processing for normalization.

### 4.8 Temporal Confusion
- **Problem**: "Next Friday" means different things depending on when the meeting occurred. Relative dates get resolved incorrectly.
- **Mitigation**: Always resolve relative dates against meeting timestamp; include meeting date in extraction context; validate resolved dates are reasonable.

---

## 5. Best Practices for AI Extraction Pipelines

### 5.1 Prompt Engineering Patterns

#### Pattern 1: Schema-First with Pydantic
Define your output schema as Pydantic models and let Instructor/structured output enforce it:
```python
import instructor
from pydantic import BaseModel, Field

class Task(BaseModel):
    """A concrete, actionable work item committed to by a specific person."""
    title: str = Field(description="Brief imperative title, e.g., 'Deploy new API'")
    description: str = Field(description="Full context from the source text")
    assignee: str | None = Field(
        description="Person who committed to doing this. null if unassigned."
    )
    due_date: str | None = Field(
        description="Deadline if explicitly stated. null if not mentioned."
    )
    source_quote: str = Field(
        description="Exact quote from the source that this task was extracted from."
    )

class ExtractionResult(BaseModel):
    tasks: list[Task]
    decisions: list[Decision]
    insights: list[Insight]
```

#### Pattern 2: Few-Shot with Discriminating Examples
Include examples that show the boundary between entity types:
```
EXAMPLE: "We decided to use Postgres instead of MongoDB"
-> Decision (not a task -- no one needs to DO anything, a choice was made)

EXAMPLE: "John will migrate the database to Postgres by Friday"
-> Task (someone committed to a specific action with a deadline)

EXAMPLE: "Our current database is hitting 80% CPU during peak hours"
-> Insight (factual observation, not an action or choice)
```

#### Pattern 3: Chain-of-Thought Classification
Force the model to reason before classifying:
```
For each potential entity:
1. Quote the exact source text
2. Explain why this is or is not actionable
3. If actionable, explain why it is a task vs. decision vs. insight
4. Extract the structured fields
```

#### Pattern 4: Negative Examples (What NOT to Extract)
```
DO NOT extract:
- Casual suggestions without commitment ("maybe we should...")
- Restatements of existing knowledge ("as we discussed last week...")
- Hypotheticals ("if we were to...")
- Status updates with no action ("the API is running fine")
```

### 5.2 Confidence Scoring

- **Field-level confidence**: Not all fields in an extraction have equal certainty. Title might be 0.95 confident while assignee is 0.6.
- **Threshold routing**: Fields below 0.9 confidence get flagged for human review (per Parseur best practices).
- **Aggregate scoring**: Overall entity confidence = min(field confidences), so one uncertain field flags the whole entity.
- **Calibration**: Track accuracy of confidence scores over time. If items scored 0.8 are wrong 40% of the time, recalibrate.

### 5.3 Human-in-the-Loop Review Workflows

Based on research from Parseur, Google Cloud Document AI, and Unstract:

#### Review Queue Architecture
1. **Automatic routing**: Entities with confidence >= threshold pass through; below threshold enter review queue.
2. **Side-by-side interface**: Show source text alongside extracted entity with highlighted source spans.
3. **One-click correction**: Reviewers can accept, reject, or modify extractions efficiently.
4. **Role-based access**: Assign reviewers, supervisors, and admins for structured approval.
5. **SLA enforcement**: Time-bound review queues to prevent bottlenecks.

#### Feedback Loop
1. Track override rates by field type and entity type.
2. Log corrections as training examples.
3. Periodically re-optimize prompts using DSPy with correction data.
4. Monitor automation rate (% of entities passing without review) -- target increasing over time.

#### KPIs to Track
- Automation rate (% entities not needing review)
- Post-review accuracy rate
- Average review turnaround time
- Override frequency by field type
- False positive rate (entities that should not have been extracted)
- False negative rate (entities that were missed)

### 5.4 Multi-Source Ingestion Strategy

Different source types need different extraction approaches:

| Source Type | Extraction Challenge | Approach |
|---|---|---|
| Meeting transcript | Long, conversational, multiple topics | Chunk by topic/speaker turn, multi-pass extraction |
| Slack message | Short, contextual, threaded | Include thread context, resolve @mentions against user directory |
| Quick note | Terse, ambiguous, no conversation context | Ask for clarification if confidence low; use user's project context |
| Email | Formal, may contain forwarded chains | Parse email chain structure first, extract from most recent message |

### 5.5 Entity Resolution Strategy

For deduplicating entities across sources:

1. **Embedding similarity**: Embed entity title + description, cosine similarity > 0.85 = candidate match.
2. **Fuzzy string matching**: Use dedupe library for name/title matching.
3. **Temporal proximity**: Entities from meetings within the same week are more likely to be related.
4. **Participant overlap**: If the same people are in both meetings, entity overlap is more likely.
5. **Human confirmation**: Present candidate matches to users rather than auto-merging.

---

## 6. Recommended Architecture for Our System

Based on all research, here is a synthesis of what the best systems do well:

### Core Design Principles

1. **Always keep raw source data** (Zep's non-lossy episode layer). Never throw away the original text.
2. **Source grounding is non-negotiable** (LangExtract pattern). Every extraction must link to exact text in the source.
3. **Schema-first extraction** (Instructor pattern). Define entity types as Pydantic models with validation.
4. **Confidence scoring on every field** (LlamaExtract/Graphlit pattern). Route low-confidence extractions to human review.
5. **Entity resolution across sources** (Graphlit pattern). "Sarah Chen" mentioned in three meetings should be one entity.
6. **Human-in-the-loop by default** (OpenSanctions lesson). AI extracts, humans verify. Corrections feed back into prompt optimization.

### Suggested Data Model (Hybrid of Models B + C)

```
Source:
  id, type, raw_content, metadata, ingested_at

Extraction (the provenance link):
  id, entity_id, source_id,
  source_quote (verbatim text),
  char_offset_start, char_offset_end,
  confidence, extraction_model, extraction_prompt_version,
  reviewed (bool), reviewer_id, reviewed_at

Entity (the extracted item):
  id, type (task|decision|insight),
  canonical_name,
  structured_data (jsonb -- type-specific fields),
  embedding (vector),
  status, created_at, updated_at

Relationship:
  id, from_entity_id, to_entity_id,
  type (blocks|relates_to|decided_by|assigned_to|part_of),
  source_extraction_id,
  confidence

Project:
  id, name, description

EntityProjectAssignment:
  entity_id, project_id, confidence, assigned_by (ai|human)
```

### Suggested Pipeline

```
1. INGEST: Raw text -> Source record (preserve everything)
     |
2. EXTRACT: Source -> LLM (with Instructor + Pydantic schema)
     |        -> ExtractionResult (tasks, decisions, insights)
     |        -> Each with source_quote, confidence, char_offsets
     |
3. RESOLVE: Check extracted entities against existing entities
     |        -> Embedding similarity + fuzzy matching
     |        -> If match found: link to existing entity
     |        -> If no match: create new entity
     |
4. ROUTE: Assign entities to projects
     |        -> Use source metadata (channel, participants)
     |        -> Use entity content similarity to project description
     |        -> Flag ambiguous routing for human review
     |
5. REVIEW: Low-confidence entities enter review queue
     |        -> Side-by-side source + extraction view
     |        -> One-click accept/reject/modify
     |        -> Corrections logged as training examples
     |
6. ACT: Confirmed entities available for downstream use
          -> Push tasks to Linear/Jira
          -> Surface decisions in project dashboards
          -> Alert on new insights
```

### Technology Stack Recommendations

| Component | Recommended Tool | Alternative |
|---|---|---|
| Extraction engine | Instructor + Pydantic | LangExtract (if source grounding is priority) |
| LLM provider | Anthropic Claude or OpenAI GPT-4o | Any provider Instructor supports |
| Entity resolution | Custom embedding similarity + dedupe library | Graphlit (if you want managed) |
| Prompt optimization | DSPy (use human corrections as training) | Manual prompt iteration |
| Vector embeddings | pgvector (in Postgres) | Pinecone, Weaviate |
| Knowledge graph | Postgres with JSONB + relationships table | Neo4j (if graph queries are primary) |
| Review UI | Custom (side-by-side source + extraction) | Retool, or build with your frontend |

---

## Key Takeaways

1. **No one has solved this end-to-end for project management.** Meeting tools extract but do not organize. Knowledge tools organize but do not extract from meetings. There is a clear gap for a system that does both.

2. **Granola's "Recipes" concept is worth studying.** User-defined extraction templates that produce typed outputs is a powerful UX pattern.

3. **Source grounding (LangExtract) is the highest-signal innovation.** Being able to click an extracted task and see exactly where in the transcript it came from is the difference between trustworthy and untrustworthy extraction.

4. **Entity resolution is the hardest unsolved problem.** Fireflies, Otter, and Circleback all punt on this -- they treat each meeting as isolated. Graphlit and Zep tackle it but for general entities, not project management entities.

5. **Human-in-the-loop is essential, not optional.** OpenSanctions learned this the hard way. The question is not "should humans review?" but "how do we make review fast and feed corrections back into the system?"

6. **Instructor is the de facto standard for structured extraction.** With 3M+ monthly downloads and support for all major LLM providers, it is the extraction engine to build on.

---

## Sources

### Products
- [Fireflies.ai API Documentation](https://docs.fireflies.ai/schema/transcript)
- [Granola.ai](https://www.granola.ai/)
- [Notion AI Meeting Notes](https://www.notion.com/product/ai-meeting-notes)
- [Circleback.ai](https://circleback.ai/)
- [Graphlit Platform](https://www.graphlit.com/)
- [Relevance AI Templates](https://relevanceai.com/templates/extract-data-from-meeting-transcripts)
- [LlamaExtract](https://www.llamaindex.ai/llamaextract)
- [AFFiNE (Open Source)](https://github.com/toeverything/AFFiNE)

### Open Source / Libraries
- [Instructor](https://github.com/567-labs/instructor) -- Structured LLM outputs with Pydantic
- [Google LangExtract](https://github.com/google/langextract) -- Source-grounded extraction
- [Zep/Graphiti](https://github.com/getzep/graphiti) -- Temporal knowledge graph for agent memory
- [DSPy Entity Extraction](https://dspy.ai/tutorials/entity_extraction/) -- Programmatic prompt optimization
- [task_extraction](https://github.com/saksham-jain177/task_extraction) -- Heuristic NLP task extraction
- [OpenNRE](https://github.com/thunlp/OpenNRE) -- Neural relation extraction
- [dedupe](https://github.com/dedupeio/dedupe) -- Fuzzy matching and entity resolution

### Research and Analysis
- [Zep: Temporal Knowledge Graph Architecture (paper)](https://arxiv.org/abs/2501.13956)
- [OpenSanctions: Everything that goes wrong with AI text extraction](https://www.opensanctions.org/articles/everything-that-goes-wrong-ai-text-extraction/)
- [Simon Willison: Structured extraction using LLM schemas](https://simonwillison.net/2025/Feb/28/llm-schemas/)
- [Parseur: HITL Best Practices](https://parseur.com/blog/hitl-best-practices)
- [W3C PROV Data Model](https://www.w3.org/TR/prov-dm/)
- [Databricks: End-to-End Structured Extraction with LLM](https://community.databricks.com/t5/technical-blog/end-to-end-structured-extraction-with-llm-part-1-batch-entity/ba-p/98396)
- [Building software on top of LLMs (PyCon 2025)](https://building-with-llms-pycon-2025.readthedocs.io/en/latest/structured-data-extraction.html)
