# Frontend Views: Wireframe Specifications

Companion document to [`project-management-agent.md`](./project-management-agent.md) and [`database-schema.md`](./database-schema.md).

This document defines every page in the web application with ASCII wireframes, component breakdowns, data requirements, and interaction specifications. All views use **shadcn/ui** components, **TanStack Router** for routing, **TanStack Query** for server state, and **TanStack Table** for tabular data.

---

## Table of Contents

1. [Global Layout](#global-layout)
2. [Review Queue Page](#1-review-queue-page) (Primary)
3. [Project List / Dashboard](#2-project-list--dashboard)
4. [Single Project View](#3-single-project-view)
5. [Entity Detail View](#4-entity-detail-view)
6. [Quick Capture](#5-quick-capture)
7. [Settings / API Keys](#6-settings--api-keys)

---

## Global Layout

Every page shares a common shell: a top navigation bar and an optional sidebar. The Quick Capture input is accessible globally as a keyboard-shortcut-triggered modal (Cmd+K or similar).

```
+------------------------------------------------------------------------+
| [Logo] PM Agent    [Projects] [Review Queue (badge:12)]    [? Capture] |
|                                                     [Settings] [Avatar]|
+------------------------------------------------------------------------+
|                                                                        |
|                         << Page Content >>                             |
|                                                                        |
+------------------------------------------------------------------------+
```

**Key components:**
- `NavigationMenu` (shadcn) for top nav links
- `Badge` for pending review count
- `Avatar` + `DropdownMenu` for user menu
- `CommandDialog` (Cmd+K) for Quick Capture (see View 5)

**Real-time updates (global):**
- SSE stream updates the review queue badge count whenever new items are added or resolved

---

## 1. Review Queue Page

### Purpose

The primary operational view. Displays all items requiring human review of AI suggestions. Users triage AI decisions here: accept, modify, or reject each suggestion. Training comments feed back into the DSPy optimization loop.

### URL Route

```
/reviews
```

Search params (TanStack Router validated):
- `?type=` — filter by review type (e.g., `project_assignment`, `duplicate_detection`)
- `?project=` — filter by project ID
- `?confidenceMin=` / `?confidenceMax=` — filter by AI confidence range
- `?groupBy=` — `review_type` (default) or `entity_type`

### Layout

```
+------------------------------------------------------------------------+
| GLOBAL NAV                                                             |
+------------------------------------------------------------------------+
|                                                                        |
|  Review Queue                                            [12 pending]  |
|                                                                        |
|  +------------------+  +----------------+  +-------------------------+ |
|  | Filter: Type   v |  | Project:  All v|  | Confidence: [0.3]-[0.9]| |
|  +------------------+  +----------------+  +-------------------------+ |
|                                                                        |
|  Group by: [Review Type] [Entity Type]                    [Expand All] |
|                                                                        |
|  ================================================================      |
|  PROJECT ASSIGNMENT (4)                                         [-]    |
|  ================================================================      |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  | #1  Task: "Redesign onboarding flow"                    0.72     | |
|  |                                                                  | |
|  |  AI suggests: Project "Web App Redesign"                         | |
|  |  Reason: Content mentions onboarding, matches 3 existing tasks   | |
|  |                                                                  | |
|  |  Source: "The onboarding flow is confusing..." (Slack, 2h ago)   | |
|  |                                                                  | |
|  |  [Accept]  [Change Project v]  [Reject]  [+ Comment]            | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  | #2  Decision: "Use Stripe for payments"                 0.65     | |
|  |                                                                  | |
|  |  AI suggests: Project "Billing System"                           | |
|  |  Reason: Mentions Stripe, payment processing                     | |
|  |                                                                  | |
|  |  [Accept]  [Change Project v]  [Reject]  [+ Comment]            | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  ================================================================      |
|  EPIC CREATION (2)                                              [-]    |
|  ================================================================      |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  | AI suggests creating epic: "User Authentication"                 | |
|  |  in project: "Web App Redesign"                         0.81     | |
|  |                                                                  | |
|  |  Description: "All work related to login, signup, password       | |
|  |  reset, and OAuth integration"                                   | |
|  |                                                                  | |
|  |  Would group these entities:                                     | |
|  |  +------------------------------------------------------------+ | |
|  |  | * Task: "Implement OAuth login"          (needs_action)     | | |
|  |  | * Task: "Add password reset flow"        (captured)         | | |
|  |  | * Task: "Build signup form validation"   (in_progress)      | | |
|  |  | * Decision: "OAuth provider selection"   (pending)          | | |
|  |  +------------------------------------------------------------+ | |
|  |                                                                  | |
|  |  [Create Epic]  [Edit Name/Desc...]  [Reject]  [+ Comment]      | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  ================================================================      |
|  DUPLICATE DETECTION (3)                                        [-]    |
|  ================================================================      |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  | Possible duplicate detected                             0.87     | |
|  |                                                                  | |
|  |  +---------------------------+  +-----------------------------+  | |
|  |  | ENTITY A                  |  | ENTITY B                    |  | |
|  |  | Task: "Fix login button   |  | Task: "Login button not     |  | |
|  |  |  not responding on        |  |  working on mobile Safari"  |  | |
|  |  |  mobile Safari"           |  |                             |  | |
|  |  |                           |  |                             |  | |
|  |  | Status: needs_action      |  | Status: captured            |  | |
|  |  | Project: Web App          |  | Project: Web App            |  | |
|  |  | Source: Slack (#bugs)     |  | Source: CLI capture          |  | |
|  |  | Created: Feb 5            |  | Created: Feb 6              |  | |
|  |  +---------------------------+  +-----------------------------+  | |
|  |                                                                  | |
|  |  Similarity: 87%                                                 | |
|  |                                                                  | |
|  |  [Merge (keep A)]  [Merge (keep B)]  [Not Duplicates]  [+ Cmt]  | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  ================================================================      |
|  LOW CONFIDENCE (3)                                             [-]    |
|  ================================================================      |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  | #1  "We should probably look into caching at some point"  0.45   | |
|  |                                                                  | |
|  |  AI classified as: Insight                                       | |
|  |  Low confidence fields:                                          | |
|  |    - type (0.45): Could be Task or Insight                       | |
|  |    - project (0.38): No clear project match                      | |
|  |                                                                  | |
|  |  Source: Voice memo, Feb 6 (full transcript available)            | |
|  |                                                                  | |
|  |  Type: [Task v]  Project: [Select project v]  [Save]  [+ Cmt]   | |
|  +------------------------------------------------------------------+ |
|                                                                        |
+------------------------------------------------------------------------+
```

### Key Components

| Component | shadcn/ui | Purpose |
|---|---|---|
| Filter bar | `Select`, `Slider` (for confidence range), `Button` | Filter review items |
| Group toggle | `ToggleGroup` | Switch between grouping modes |
| Collapsible sections | `Collapsible` | Group headers that expand/collapse |
| Review card | `Card`, `CardHeader`, `CardContent`, `CardFooter` | Individual review item |
| Confidence indicator | `Badge` with color coding | Green (>0.8), Yellow (0.5-0.8), Red (<0.5) |
| Accept button | `Button` variant="default" | One-click accept |
| Change dropdown | `Select` or `Popover` + `Command` (searchable) | Reassign to different project/epic |
| Reject button | `Button` variant="outline" | Reject suggestion |
| Comment input | `Dialog` with `Textarea` | Add training comment for DSPy |
| Duplicate comparison | Two `Card` components side-by-side | Compare entities |
| Entity list (epic creation) | `Table` or styled list | Show entities that would be grouped |
| Pending count | `Badge` variant="secondary" | Total pending items in header |

### Data Requirements

| Data | API Endpoint | Notes |
|---|---|---|
| Pending review items | `GET /api/review-queue?status=pending&type=...&project=...` | Primary query. Joins with `entities` and `projects` for display data. |
| Entity details (for each item) | Embedded in review queue response | The API should return the entity content, type, status, and project name inline. |
| Project list (for reassignment) | `GET /api/projects?status=active` | Populates the "Change Project" dropdown. |
| Epic list (for reassignment) | `GET /api/projects/:id/epics` | Populates the "Change Epic" dropdown, scoped by selected project. |
| Duplicate entity details | Embedded in review queue response (via `ai_suggestion.duplicateEntityId`) | Both entities returned inline for side-by-side display. |
| Candidate entities (epic creation) | Embedded in review queue response | List of entity IDs + summaries that would be grouped under the proposed epic. |

### User Interactions

| Action | API Call | Behavior |
|---|---|---|
| Accept suggestion | `PATCH /api/review-queue/:id` with `{ status: "accepted" }` | Applies the AI suggestion (e.g., sets entity's project_id). Card animates out. Counter decrements. |
| Modify suggestion | `PATCH /api/review-queue/:id` with `{ status: "modified", userResolution: {...} }` | Applies user's chosen value instead of AI's. Card animates out. |
| Reject suggestion | `PATCH /api/review-queue/:id` with `{ status: "rejected" }` | Discards suggestion. Entity remains unmodified. Card animates out. |
| Add training comment | `PATCH /api/review-queue/:id` with `{ trainingComment: "..." }` | Saves comment for DSPy feedback loop. Can be combined with accept/modify/reject. |
| Create epic (epic_creation) | `POST /api/epics` then `PATCH /api/review-queue/:id` with `{ status: "accepted" }` | Creates the epic, assigns listed entities, resolves review item. |
| Merge duplicates | `POST /api/entities/:id/merge` with `{ duplicateId: "..." }` then resolve review | Marks one entity as `duplicate_of` the other. Resolves review item. |
| Change grouping | URL search param update (`?groupBy=entity_type`) | Re-renders groups. No API call. |
| Change filters | URL search param update | Refetches with new query params via TanStack Query. |

### Real-time Updates (SSE)

- New review items appear at the top of their group with a subtle highlight animation
- When another user resolves an item, it fades out with a "Resolved by [name]" toast
- Pending count badge updates in real time

---

## 2. Project List / Dashboard

### Purpose

Landing page after login. Shows all active projects with summary statistics. Provides an at-a-glance view of what is happening across all projects and quick access to any single project.

### URL Route

```
/projects
```

Search params:
- `?status=` — `active` (default) or `archived`
- `?q=` — search/filter by name

### Layout

```
+------------------------------------------------------------------------+
| GLOBAL NAV                                                             |
+------------------------------------------------------------------------+
|                                                                        |
|  Projects                                    [Search...    ]  [+ New]  |
|                                                                        |
|  [Active (8)]  [Archived (3)]                                          |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |                                                                  | |
|  |  +------------------------------+  +------------------------------+|
|  |  | Web App Redesign             |  | Billing System               ||
|  |  | Complete overhaul of the     |  | Payment processing and       ||
|  |  | customer-facing web app      |  | subscription management      ||
|  |  |                              |  |                              ||
|  |  |  Tasks          Decisions    |  |  Tasks          Decisions    ||
|  |  |  +---------+    +--------+  |  |  +---------+    +--------+  ||
|  |  |  |cap.   12|    |pend.  3|  |  |  |cap.    5|    |pend.  1|  ||
|  |  |  |action  8|    |dec.   7|  |  |  |action  4|    |dec.   2|  ||
|  |  |  |in_pr.  5|    +--------+  |  |  |in_pr.  2|    +--------+  ||
|  |  |  |done   21|                |  |  |done    9|                ||
|  |  |  +---------+    Insights    |  |  +---------+    Insights    ||
|  |  |                 +--------+  |  |                 +--------+  ||
|  |  |  Reviews: 4     |total  6|  |  |  Reviews: 1     |total  3|  ||
|  |  |  pending        +--------+  |  |  pending        +--------+  ||
|  |  |                              |  |                              ||
|  |  |  [View Project]  [Archive]   |  |  [View Project]  [Archive]   ||
|  |  +------------------------------+  +------------------------------+|
|  |                                                                  | |
|  |  +------------------------------+  +------------------------------+|
|  |  | Mobile App                   |  | Internal Tools               ||
|  |  | React Native mobile client   |  | Developer productivity       ||
|  |  |                              |  | tooling                      ||
|  |  |  Tasks          Decisions    |  |  Tasks          Decisions    ||
|  |  |  +---------+    +--------+  |  |  +---------+    +--------+  ||
|  |  |  |cap.    3|    |pend.  0|  |  |  |cap.    7|    |pend.  2|  ||
|  |  |  |action  2|    |dec.   4|  |  |  |action  3|    |dec.   1|  ||
|  |  |  |in_pr.  1|    +--------+  |  |  |in_pr.  4|    +--------+  ||
|  |  |  |done    6|                |  |  |done   11|                ||
|  |  |  +---------+    Insights    |  |  +---------+    Insights    ||
|  |  |                 +--------+  |  |                 +--------+  ||
|  |  |  Reviews: 0     |total  2|  |  |  Reviews: 7     |total  9|  ||
|  |  |  pending        +--------+  |  |  pending        +--------+  ||
|  |  |                              |  |                              ||
|  |  |  [View Project]  [Archive]   |  |  [View Project]  [Archive]   ||
|  |  +------------------------------+  +------------------------------+|
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
|                                                                        |
+------------------------------------------------------------------------+
```

### Create Project Dialog

```
+------------------------------------------+
|  Create New Project                   [X] |
|                                          |
|  Name:                                   |
|  +--------------------------------------+|
|  | e.g., "Web App Redesign"             ||
|  +--------------------------------------+|
|                                          |
|  Description:                            |
|  +--------------------------------------+|
|  |                                      ||
|  |                                      ||
|  +--------------------------------------+|
|                                          |
|              [Cancel]  [Create Project]  |
+------------------------------------------+
```

### Key Components

| Component | shadcn/ui | Purpose |
|---|---|---|
| Project cards | `Card`, `CardHeader`, `CardContent`, `CardFooter` | Display project summary |
| Stats breakdown | Custom grid with `Badge` or small tables | Task counts by status, decision/insight counts |
| Pending reviews badge | `Badge` variant="destructive" (if >0) | Highlight projects needing attention |
| Search input | `Input` with search icon | Filter projects by name |
| Status tabs | `Tabs`, `TabsList`, `TabsTrigger` | Switch between active/archived |
| Create dialog | `Dialog`, `DialogContent`, `Input`, `Textarea`, `Button` | New project form |
| Archive action | `AlertDialog` (confirmation) | Confirm before archiving |
| Grid layout | CSS Grid (2 columns on desktop, 1 on mobile) | Responsive card layout |

### Data Requirements

| Data | API Endpoint | Notes |
|---|---|---|
| Project list with stats | `GET /api/projects?status=active` | Returns projects with aggregated entity counts by type+status, pending review count, and recent insight count. This is a single denormalized endpoint to avoid N+1 queries. |
| Search/filter | Same endpoint with `?q=search_term` | Server-side filtering by project name. |

### User Interactions

| Action | API Call | Behavior |
|---|---|---|
| Create project | `POST /api/projects` | Opens dialog, submits form, new card appears in grid. |
| Archive project | `PATCH /api/projects/:id` with `{ status: "archived" }` | Confirmation dialog, card fades out. |
| Unarchive project | `PATCH /api/projects/:id` with `{ status: "active" }` | Available on archived tab. |
| View project | Navigate to `/projects/$projectId` | Client-side navigation. |
| Search | Debounced URL param update (`?q=...`) | Refetches with search filter. |

### Real-time Updates (SSE)

- Task counts update when entities are created/modified via the processing pipeline
- Pending review count updates when new review items are created or resolved

---

## 3. Single Project View

### Purpose

Detailed view of a single project. Organized into tabs for epics, tasks, decisions, insights, and unepiced items. This is where users manage the day-to-day work within a project.

### URL Route

```
/projects/$projectId
```

Search params (vary by active tab):
- `?tab=` — `epics` (default), `tasks`, `decisions`, `insights`, `unepiced`
- `?status=` — filter by entity status
- `?category=` — filter tasks by category (feature, bug_fix, etc.)
- `?assignee=` — filter by assignee ID
- `?priority=` — filter by priority
- `?epic=` — filter by epic ID
- `?sort=` — column to sort by
- `?order=` — `asc` or `desc`

### Layout: Header + Tabs

```
+------------------------------------------------------------------------+
| GLOBAL NAV                                                             |
+------------------------------------------------------------------------+
|                                                                        |
|  < Back to Projects                                                    |
|                                                                        |
|  Web App Redesign                                         [Edit] [...]  |
|  Complete overhaul of the customer-facing web app                      |
|                                                                        |
|  +----------+  +----------+  +-----------+  +----------+              |
|  | Tasks 46 |  | Dec.  10 |  | Insights 6|  | Reviews 4|              |
|  |  5 in prg |  |  3 pend  |  |           |  |  pending |              |
|  +----------+  +----------+  +-----------+  +----------+              |
|                                                                        |
|  [Epics]  [Tasks]  [Decisions]  [Insights]  [Unepiced]     [+ Entity]  |
|  ~~~~~~                                                                |
|                                                                        |
|           << Tab Content Below >>                                      |
|                                                                        |
+------------------------------------------------------------------------+
```

### Tab: Epics

```
|  +------------------------------------------------------------------+ |
|  |                                                                  | |
|  |  [+ Create Epic]                                                 | |
|  |                                                                  | |
|  |  +--------------------------------------------------------------+| |
|  |  | User Authentication                              [Expand v]  || |
|  |  | "Login, signup, password reset, OAuth"                       || |
|  |  |                                                              || |
|  |  | Progress: [===========----------] 55%  (11/20 tasks done)    || |
|  |  |                                                              || |
|  |  | +----------------------------------------------------------+|| |
|  |  | | Type     | Content                  | Status    | Assignee||| |
|  |  | |----------|--------------------------|-----------|---------||| |
|  |  | | Task     | Implement OAuth login    | in_prog.  | Sarah   ||| |
|  |  | | Task     | Add password reset flow  | captured  | --      ||| |
|  |  | | Task     | Build signup validation  | done      | Alex    ||| |
|  |  | | Decision | OAuth provider selection | pending   | --      ||| |
|  |  | | ...      | (16 more)                |           |         ||| |
|  |  | +----------------------------------------------------------+|| |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  |  +--------------------------------------------------------------+| |
|  |  | Payment Processing                              [Expand v]   || |
|  |  | "Stripe integration, subscription management"                || |
|  |  |                                                              || |
|  |  | Progress: [====--------------------] 20%  (3/15 tasks done)  || |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  |  +--------------------------------------------------------------+| |
|  |  | Onboarding Flow                                 [Expand v]   || |
|  |  | "New user onboarding and tutorial experience"                || |
|  |  |                                                              || |
|  |  | Progress: [========================] 100% (8/8 tasks done)   || |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
```

### Tab: Tasks

```
|  +------------------------------------------------------------------+ |
|  |                                                                  | |
|  |  Filters:                                                        | |
|  |  +----------+ +----------+ +----------+ +--------+ +----------+ | |
|  |  |Status: v | |Cat.:   v | |Epic:   v | |Prio: v | |Assign: v | | |
|  |  +----------+ +----------+ +----------+ +--------+ +----------+ | |
|  |                                                                  | |
|  |  +--------------------------------------------------------------+| |
|  |  | Status      | Content              | Category | Pri. | Epic  || |
|  |  |-------------|----------------------|----------|------|-------|| |
|  |  | needs_action| Redesign onboarding  | feature  | high | Onb. || |
|  |  | in_progress | Implement OAuth      | feature  | high | Auth || |
|  |  | captured    | Fix mobile nav bug   | bug_fix  | med  | --   || |
|  |  | done        | Add dark mode toggle | improve. | low  | UI   || |
|  |  | needs_action| Refactor auth module | refactor | med  | Auth || |
|  |  | captured    | Add rate limiting    | chore    | high | --   || |
|  |  | ...         |                      |          |      |      || |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  |  Showing 1-25 of 46              [< Prev]  [1] [2]  [Next >]   | |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
```

### Tab: Decisions

```
|  +------------------------------------------------------------------+ |
|  |                                                                  | |
|  |  Filters: [Status: All v]  [Epic: All v]                        | |
|  |                                                                  | |
|  |  +--------------------------------------------------------------+| |
|  |  | Pending                                                      || |
|  |  |                                                              || |
|  |  | +----------------------------------------------------------+|| |
|  |  | | OAuth provider selection                                  ||| |
|  |  | | Options: Google, Auth0, Clerk, Custom                     ||| |
|  |  | | Epic: User Authentication                                 ||| |
|  |  | | Created: Feb 3, 2026                     [View Details >] ||| |
|  |  | +----------------------------------------------------------+|| |
|  |  |                                                              || |
|  |  | +----------------------------------------------------------+|| |
|  |  | | Database hosting provider                                 ||| |
|  |  | | Options: Render Postgres, Supabase, Neon                  ||| |
|  |  | | Epic: Infrastructure                                     ||| |
|  |  | | Created: Feb 1, 2026                     [View Details >] ||| |
|  |  | +----------------------------------------------------------+|| |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  |  +--------------------------------------------------------------+| |
|  |  | Decided                                                      || |
|  |  |                                                              || |
|  |  | +----------------------------------------------------------+|| |
|  |  | | API framework selection                                   ||| |
|  |  | | Chosen: Hono                                              ||| |
|  |  | | Rationale: Best TypeScript DX, official MCP middleware     ||| |
|  |  | | Decided by: Tejas                        [View Details >] ||| |
|  |  | +----------------------------------------------------------+|| |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
```

### Tab: Insights

```
|  +------------------------------------------------------------------+ |
|  |                                                                  | |
|  |  +--------------------------------------------------------------+| |
|  |  | "Users are abandoning the checkout at the address step"       || |
|  |  |  Sentiment: negative   Status: captured                      || |
|  |  |  Data: 23% drop-off at step 3                                || |
|  |  |  Source: Meeting transcript, Feb 5                           || |
|  |  |                              [Acknowledge]  [Promote to Task]|| |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  |  +--------------------------------------------------------------+| |
|  |  | "Competitor X launched a similar feature last week"           || |
|  |  |  Sentiment: neutral    Status: acknowledged                  || |
|  |  |  Source: Slack #general, Feb 4                               || |
|  |  |                                              [Promote to Task]|| |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
```

### Tab: Unepiced Items

```
|  +------------------------------------------------------------------+ |
|  |                                                                  | |
|  |  These entities are not assigned to any epic.                    | |
|  |  Drag to an epic or use the dropdown to assign.                 | |
|  |                                                                  | |
|  |  +--------------------------------------------------------------+| |
|  |  | Type     | Content                  | Status     | Assign To || |
|  |  |----------|--------------------------|------------|------------|  |
|  |  | Task     | Fix mobile nav bug       | captured   | [Epic v]  || |
|  |  | Task     | Add rate limiting        | captured   | [Epic v]  || |
|  |  | Insight  | Caching investigation    | captured   | [Epic v]  || |
|  |  | Decision | CDN provider choice      | pending    | [Epic v]  || |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
```

### Create Entity Dialog

```
+------------------------------------------+
|  Create Entity                        [X] |
|                                          |
|  Type:                                   |
|  ( ) Task  ( ) Decision  ( ) Insight     |
|                                          |
|  Content:                                |
|  +--------------------------------------+|
|  |                                      ||
|  |                                      ||
|  +--------------------------------------+|
|                                          |
|  Epic (optional):                        |
|  +--------------------------------------+|
|  | Select epic...                    v  ||
|  +--------------------------------------+|
|                                          |
|  [Type-specific fields appear here       |
|   based on selected type]                |
|                                          |
|  For Task:                               |
|    Category: [feature v]                 |
|    Priority: [medium v]                  |
|    Assignee: [Select... v]               |
|                                          |
|  For Decision:                           |
|    Options: [Add option +]               |
|                                          |
|              [Cancel]  [Create Entity]   |
+------------------------------------------+
```

### Create Epic Dialog

```
+------------------------------------------+
|  Create Epic                          [X] |
|                                          |
|  Name:                                   |
|  +--------------------------------------+|
|  | e.g., "User Authentication"          ||
|  +--------------------------------------+|
|                                          |
|  Description:                            |
|  +--------------------------------------+|
|  |                                      ||
|  +--------------------------------------+|
|                                          |
|              [Cancel]  [Create Epic]     |
+------------------------------------------+
```

### Key Components

| Component | shadcn/ui | Purpose |
|---|---|---|
| Project header | Custom layout with `Button`, `Badge` | Name, description, stats summary |
| Stat cards | `Card` (compact) | Task/decision/insight/review counts |
| Tab navigation | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Switch between content sections |
| Epic accordion | `Collapsible` or `Accordion` | Expand/collapse epic details |
| Progress bar | `Progress` | Epic completion percentage |
| Tasks table | TanStack Table + `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` | Sortable, filterable task list |
| Filter selects | `Select` | Status, category, priority, epic, assignee filters |
| Pagination | `Pagination` | Page through large task lists |
| Decision cards | `Card` grouped by status | Pending vs decided sections |
| Insight cards | `Card` with `Badge` for sentiment | Insight display with promote action |
| Epic assignment dropdown | `Select` or `Popover` + `Command` | Assign unepiced items to epics |
| Create entity dialog | `Dialog`, `RadioGroup`, `Input`, `Textarea`, `Select` | Manually create entities |
| Create epic dialog | `Dialog`, `Input`, `Textarea` | Manually create epics |

### Data Requirements

| Data | API Endpoint | Notes |
|---|---|---|
| Project details + stats | `GET /api/projects/:id` | Returns project with aggregated counts. |
| Epics with progress | `GET /api/projects/:id/epics` | Each epic includes child entity counts by status for progress computation. |
| Epic children (expanded) | `GET /api/epics/:id/entities` | Fetched on expand. Returns entities belonging to the epic. |
| Tasks (filterable) | `GET /api/projects/:id/entities?type=task&status=...&category=...&epic=...&assignee=...&sort=...&order=...&page=...&limit=...` | Paginated, filterable, sortable. |
| Decisions | `GET /api/projects/:id/entities?type=decision` | Grouped by status client-side. |
| Insights | `GET /api/projects/:id/entities?type=insight` | Displayed as cards. |
| Unepiced items | `GET /api/projects/:id/entities?epic=none` | Entities where `epic_id IS NULL`. |
| Users (for assignee filter) | `GET /api/users` | Populates assignee filter dropdown. |

### User Interactions

| Action | API Call | Behavior |
|---|---|---|
| Switch tabs | URL param update (`?tab=tasks`) | Loads tab content. TanStack Query caches previous tabs. |
| Filter tasks | URL param updates | Refetches with new filters. |
| Sort table column | URL param update (`?sort=status&order=asc`) | Re-sorts via server query. |
| Expand epic | Client-side toggle + lazy fetch | Fetches epic's entities on first expand. |
| Create entity | `POST /api/entities` | Dialog form, entity appears in appropriate tab. |
| Create epic | `POST /api/epics` | Dialog form, epic appears in epics tab. |
| Promote insight to task | `POST /api/entities/:id/promote` | Creates a task derived from the insight, adds `promoted_to` relationship. |
| Acknowledge insight | `PATCH /api/entities/:id` with `{ status: "acknowledged" }` | Updates insight status. |
| Assign to epic | `PATCH /api/entities/:id` with `{ epicId: "..." }` | Moves entity into an epic. Disappears from unepiced tab. |
| Click entity row/card | Navigate to `/entities/$entityId` | Opens entity detail view. |
| Edit project | `PATCH /api/projects/:id` | Inline edit or dialog for name/description. |

### Real-time Updates (SSE)

- New entities appear when the processing pipeline creates them
- Task status changes reflect immediately (e.g., another user marks a task done)
- Epic progress bars update as child entity statuses change
- New review items update the review count badge in the header stats

---

## 4. Entity Detail View

### Purpose

Full detail page for any single entity (task, decision, or insight). Shows all metadata, evidence chain back to source notes, AI confidence information, relationships to other entities, and a full activity timeline.

### URL Route

```
/entities/$entityId
```

### Layout

```
+------------------------------------------------------------------------+
| GLOBAL NAV                                                             |
+------------------------------------------------------------------------+
|                                                                        |
|  < Back to Web App Redesign > User Authentication                      |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |                          MAIN CONTENT                            | |
|  |                                                                  | |
|  |  [Task]  [feature]  [high priority]          Status: [in_prog v] | |
|  |                                                                  | |
|  |  Redesign onboarding flow to 2 steps                             | |
|  |  _______________________________________________________________  | |
|  |                                                                  | |
|  |  Project: Web App Redesign    Epic: Onboarding Flow              | |
|  |  Assignee: [Sarah v]         Created: Feb 3, 2026                | |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +-------------------------------+  +-------------------------------+  |
|  |        EVIDENCE               |  |      AI METADATA              |  |
|  |                               |  |                               |  |
|  |  Source quotes:               |  |  Overall confidence: 0.82     |  |
|  |                               |  |                               |  |
|  |  +---------------------------+|  |  Field confidence:            |  |
|  |  | "The onboarding flow is   ||  |  +---------------------------+|  |
|  |  |  confusing. Three users   ||  |  | type          0.95  ----  ||  |
|  |  |  dropped off at step 2   ||  |  | project       0.88  ----  ||  |
|  |  |  last week."             ||  |  | epic          0.82  ---   ||  |
|  |  |                           ||  |  | category      0.91  ----  ||  |
|  |  |  Source: Slack #product   ||  |  | assignee      0.72  ---   ||  |
|  |  |  Feb 3, 2026  [Open note] ||  |  +---------------------------+|  |
|  |  +---------------------------+|  |                               |  |
|  |                               |  |  Model: claude-3.5-sonnet     |  |
|  |  +---------------------------+|  |  Prompt v: 1.2                |  |
|  |  | "We decided to simplify   ||  |  Run ID: ext_abc123           |  |
|  |  |  it to two steps. Sarah   ||  |                               |  |
|  |  |  will handle the          ||  |                               |  |
|  |  |  redesign."               ||  |                               |  |
|  |  |                           ||  |                               |  |
|  |  |  Source: Same note        ||  |                               |  |
|  |  |  [Open note]              ||  |                               |  |
|  |  +---------------------------+|  |                               |  |
|  +-------------------------------+  +-------------------------------+  |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |                     RELATIONSHIPS                                | |
|  |                                                                  | |
|  |  Derived from:                                                   | |
|  |  +--------------------------------------------------------------+| |
|  |  | Decision: "Simplify onboarding to 2 steps"   [decided]  [>]  || |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  |  Related to:                                                     | |
|  |  +--------------------------------------------------------------+| |
|  |  | Task: "Update onboarding analytics"      [needs_action]  [>] || |
|  |  | Task: "Write onboarding help docs"       [captured]      [>] || |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  |  Subtasks:                                                       | |
|  |  +--------------------------------------------------------------+| |
|  |  | Task: "Design new step 1 mockups"         [done]         [>] || |
|  |  | Task: "Implement step 1 frontend"         [in_progress]  [>] || |
|  |  | Task: "Implement step 2 frontend"         [captured]     [>] || |
|  |  +--------------------------------------------------------------+| |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |                     ACTIVITY LOG                                 | |
|  |                                                                  | |
|  |  [+ Add Comment]                                                 | |
|  |                                                                  | |
|  |  Feb 6, 10:32 AM  Sarah                                         | |
|  |  Status changed: captured -> in_progress                         | |
|  |                                                                  | |
|  |  Feb 5, 3:15 PM  System                                         | |
|  |  Entity reprocessed (new raw note added context)                 | |
|  |  Model: claude-3.5-sonnet, Prompt v1.2                          | |
|  |                                                                  | |
|  |  Feb 4, 11:00 AM  Alex                                          | |
|  |  "This should be prioritized - 3 support tickets about           | |
|  |   onboarding this week"                                          | |
|  |                                                                  | |
|  |  Feb 3, 9:45 AM  System                                         | |
|  |  Entity created from raw note (Slack #product)                   | |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
|                                                                        |
+------------------------------------------------------------------------+
```

### Key Components

| Component | shadcn/ui | Purpose |
|---|---|---|
| Breadcrumb | `Breadcrumb` | Navigation: Projects > Project Name > Epic Name |
| Entity type badge | `Badge` | Color-coded entity type (task/decision/insight) |
| Category badge | `Badge` variant="outline" | Task category (feature, bug_fix, etc.) |
| Priority badge | `Badge` with color | Priority level indicator |
| Status selector | `Select` | Change entity status inline |
| Assignee selector | `Select` or `Popover` + `Command` (searchable) | Assign/reassign user |
| Evidence cards | `Card` with quote formatting | Source quotes with links to raw notes |
| Confidence bars | `Progress` or custom bar | Per-field confidence visualization |
| AI metadata panel | `Card` | Model info, prompt version, extraction run ID |
| Relationship links | Clickable `Card` items or styled list | Links to related entities |
| Subtask list | `Table` or styled list with status badges | Child tasks with status |
| Activity timeline | Custom timeline component using `Separator`, `Avatar` | Chronological event log |
| Comment form | `Textarea` + `Button` | Add new comment |
| Actions dropdown | `DropdownMenu` | Edit, move to epic, move to project, delete |

### Data Requirements

| Data | API Endpoint | Notes |
|---|---|---|
| Entity full details | `GET /api/entities/:id` | Returns entity with all fields including attributes, ai_meta, evidence. |
| Entity relationships | `GET /api/entities/:id/relationships` | Returns both incoming and outgoing relationships with target/source entity summaries. |
| Subtasks | `GET /api/entities/:id/subtasks` | Returns child entities where `parent_task_id = :id`. |
| Activity log | `GET /api/entities/:id/events` | Returns entity_events ordered by created_at DESC. |
| Raw note (for "Open note" link) | `GET /api/raw-notes/:id` | Full raw note content when user clicks through. |
| Users (for assignee) | `GET /api/users` | Populates assignee dropdown. |
| Epics (for move action) | `GET /api/projects/:projectId/epics` | Populates "Move to epic" dropdown. |

### User Interactions

| Action | API Call | Behavior |
|---|---|---|
| Change status | `PATCH /api/entities/:id` with `{ status: "..." }` | Updates status. Creates a `status_change` event. Badge updates. |
| Change assignee | `PATCH /api/entities/:id` with `{ assigneeId: "..." }` | Updates assignee. |
| Add comment | `POST /api/entities/:id/events` with `{ type: "comment", body: "..." }` | Appends to activity log. |
| Move to epic | `PATCH /api/entities/:id` with `{ epicId: "..." }` | Updates epic assignment. Breadcrumb updates. |
| Move to project | `PATCH /api/entities/:id` with `{ projectId: "..." }` | Updates project. Breadcrumb updates. |
| Click relationship | Navigate to `/entities/$relatedEntityId` | Opens related entity's detail view. |
| Click "Open note" | Navigate to raw note view or open in modal | Shows full raw note content. |
| Edit content | Inline edit via `Textarea` or `Dialog` | `PATCH /api/entities/:id` with `{ content: "..." }` |

### Real-time Updates (SSE)

- Activity log updates when other users add comments or change status
- Relationship updates when the processing pipeline creates new connections
- Status badge updates from other users' changes

---

## 5. Quick Capture

### Purpose

Minimal, fast input for capturing thoughts, ideas, and notes. Designed for speed: open, type, capture, close. Available from anywhere in the app via keyboard shortcut. Shows recent captures with their processing status so users can confirm their notes are being handled.

### URL Route

This is not a standalone page. It is a global modal accessible via:
- Keyboard shortcut: `Cmd+K` (or a dedicated shortcut like `Cmd+Shift+C`)
- The "Capture" button in the global nav

Optionally, a `/capture` route can exist as a standalone page for bookmarking or PWA home screen shortcuts.

### Layout: Modal (Primary)

```
+------------------------------------------------------------------------+
|                                                                        |
|       +------------------------------------------------------+        |
|       |  Quick Capture                                   [X]  |        |
|       |                                                      |        |
|       |  +--------------------------------------------------+|        |
|       |  |                                                  ||        |
|       |  |  Type your thought, idea, or note...             ||        |
|       |  |                                                  ||        |
|       |  |                                                  ||        |
|       |  |                                                  ||        |
|       |  +--------------------------------------------------+|        |
|       |                                                      |        |
|       |  Source: [CLI v]  |  [Capture]  or  Cmd+Enter        |        |
|       |                                                      |        |
|       |  -------------------------------------------------- |        |
|       |                                                      |        |
|       |  Recent Captures:                                    |        |
|       |                                                      |        |
|       |  +--------------------------------------------------+|        |
|       |  | "We should add rate limiting to the API"         ||        |
|       |  |  2 min ago                    [Processing...]    ||        |
|       |  +--------------------------------------------------+|        |
|       |                                                      |        |
|       |  +--------------------------------------------------+|        |
|       |  | "Sarah mentioned the login flow needs rework"    ||        |
|       |  |  15 min ago    -> Task, Decision   [Processed]   ||        |
|       |  +--------------------------------------------------+|        |
|       |                                                      |        |
|       |  +--------------------------------------------------+|        |
|       |  | "Competitor launched social login yesterday"      ||        |
|       |  |  1 hour ago    -> Insight          [Processed]   ||        |
|       |  +--------------------------------------------------+|        |
|       |                                                      |        |
|       +------------------------------------------------------+        |
|                                                                        |
+------------------------------------------------------------------------+
```

### Layout: Standalone Page (Optional)

```
+------------------------------------------------------------------------+
| GLOBAL NAV                                                             |
+------------------------------------------------------------------------+
|                                                                        |
|                    Quick Capture                                        |
|                                                                        |
|        +------------------------------------------------------+        |
|        |                                                      |        |
|        |  Type your thought, idea, or note...                 |        |
|        |                                                      |        |
|        |                                                      |        |
|        |                                                      |        |
|        +------------------------------------------------------+        |
|                                                                        |
|        Source: [API v]                      [Capture]                   |
|                                                                        |
|        --------------------------------------------------------        |
|                                                                        |
|        Recent Captures                                                 |
|                                                                        |
|        +------------------------------------------------------+        |
|        | "We should add rate limiting to the API"              |        |
|        |  2 min ago                         [Processing...]    |        |
|        +------------------------------------------------------+        |
|        | "Sarah mentioned the login flow needs rework"         |        |
|        |  15 min ago   -> Task, Decision    [Processed]        |        |
|        +------------------------------------------------------+        |
|        | "Competitor launched social login yesterday"           |        |
|        |  1 hour ago   -> Insight           [Processed]        |        |
|        +------------------------------------------------------+        |
|                                                                        |
+------------------------------------------------------------------------+
```

### Key Components

| Component | shadcn/ui | Purpose |
|---|---|---|
| Modal container | `CommandDialog` or `Dialog` | Global modal overlay |
| Text input | `Textarea` (auto-resize) | Main capture input |
| Source selector | `Select` | Optional source tag (defaults to `api`) |
| Capture button | `Button` | Submit the note |
| Keyboard shortcut hint | `kbd` styling | Shows Cmd+Enter shortcut |
| Recent captures list | Custom list | Shows last 5-10 captures |
| Processing status | `Badge` with spinner or check icon | `Processing...` / `Processed` / `Error` |
| Extracted entities | Small `Badge` list | Shows what entities were extracted (after processing) |

### Data Requirements

| Data | API Endpoint | Notes |
|---|---|---|
| Submit capture | `POST /api/capture` with `{ content: "...", source: "api" }` | Calls the `capture_note` function. Returns the raw note ID. |
| Recent captures | `GET /api/raw-notes?capturedBy=me&limit=10&sort=capturedAt&order=desc` | Shows recent notes for the current user. |
| Processing status | Included in raw notes response: `processed`, `processedAt`, `processingError` | Polled or updated via SSE. |
| Extracted entities (per note) | `GET /api/raw-notes/:id/entities` (via entity_sources join) | Shows what entities were created from this note. |

### User Interactions

| Action | API Call | Behavior |
|---|---|---|
| Open modal | None (client-side) | Cmd+K or nav button opens modal. Auto-focuses textarea. |
| Capture note | `POST /api/capture` | Clears textarea, shows note in "Recent" list with "Processing..." badge. |
| Close modal | None (client-side) | Escape key or click outside. |
| Click processed note | Navigate to entity detail or raw note view | Opens the extracted entity or the raw note. |

### Real-time Updates (SSE)

- Processing status transitions from "Processing..." to "Processed" in real time
- Extracted entity badges appear once processing completes
- Error state shown if processing fails

---

## 6. Settings / API Keys

### Purpose

Manage personal API keys for authenticating CLI tools, MCP servers, and other integrations. Users can create named keys, see usage information, and revoke keys they no longer need.

### URL Route

```
/settings
```

Search params:
- `?tab=` — `api-keys` (default), potentially more settings tabs later

### Layout

```
+------------------------------------------------------------------------+
| GLOBAL NAV                                                             |
+------------------------------------------------------------------------+
|                                                                        |
|  Settings                                                              |
|                                                                        |
|  [API Keys]  [Profile]  [Preferences]                                  |
|  ~~~~~~~~~                                                              |
|                                                                        |
|  API Keys                                          [+ Create New Key]  |
|                                                                        |
|  API keys authenticate CLI tools, MCP servers, and other               |
|  integrations. Keep your keys secret.                                  |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  | Name           | Created        | Last Used       | Status       | |
|  |----------------|----------------|-----------------|--------------|  |
|  | cli-laptop     | Jan 15, 2026   | 2 hours ago     | [Revoke]     | |
|  | mcp-server     | Jan 20, 2026   | 5 minutes ago   | [Revoke]     | |
|  | slack-bot      | Feb 1, 2026    | 1 day ago       | [Revoke]     | |
|  | ci-pipeline    | Feb 3, 2026    | Never           | [Revoke]     | |
|  | old-laptop     | Dec 10, 2025   | Jan 5, 2026     | Revoked      | |
|  +------------------------------------------------------------------+ |
|                                                                        |
+------------------------------------------------------------------------+
```

### Create Key Dialog

```
+------------------------------------------+
|  Create API Key                       [X] |
|                                          |
|  Key Name:                               |
|  +--------------------------------------+|
|  | e.g., "cli-laptop", "mcp-server"    ||
|  +--------------------------------------+|
|                                          |
|              [Cancel]  [Create Key]      |
+------------------------------------------+
```

### Key Created Dialog (shown ONCE)

```
+------------------------------------------+
|  API Key Created                      [X] |
|                                          |
|  Your new API key:                       |
|                                          |
|  +--------------------------------------+|
|  | pm_k1_a8f3e2b1c4d5e6f7...           ||
|  +--------------------------------------+|
|  [Copy to Clipboard]                     |
|                                          |
|  WARNING: This key will only be shown    |
|  ONCE. Copy it now and store it          |
|  securely. If you lose it, you'll need   |
|  to create a new one.                    |
|                                          |
|  Usage:                                  |
|                                          |
|  CLI:                                    |
|    export PM_API_KEY="pm_k1_a8f..."      |
|                                          |
|  MCP config:                             |
|    { "env": { "PM_API_KEY": "pm_k1..." }}|
|                                          |
|  HTTP:                                   |
|    Authorization: Bearer pm_k1_a8f...    |
|                                          |
|                          [Done]          |
+------------------------------------------+
```

### Revoke Confirmation

```
+------------------------------------------+
|  Revoke API Key                       [X] |
|                                          |
|  Are you sure you want to revoke the     |
|  key "cli-laptop"?                       |
|                                          |
|  Any tools or integrations using this    |
|  key will immediately lose access.       |
|                                          |
|        [Cancel]  [Revoke Key]            |
+------------------------------------------+
```

### Key Components

| Component | shadcn/ui | Purpose |
|---|---|---|
| Settings tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Future-proof for additional settings sections |
| API keys table | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` | List of keys with metadata |
| Create key dialog | `Dialog`, `DialogContent`, `Input`, `Button` | Name input for new key |
| Key display dialog | `Dialog`, `Alert` (warning variant), `Button` | One-time key display with copy button |
| Copy button | `Button` with clipboard API | Copy key to clipboard with success feedback |
| Usage snippets | `code` blocks | Pre-formatted usage examples |
| Revoke button | `Button` variant="destructive" (outline) | Per-row revoke action |
| Revoke confirmation | `AlertDialog` | Confirm destructive action |
| Status indicator | `Badge` or text | "Active" (implicit) vs "Revoked" with date |
| Relative time | Custom or library (e.g., `date-fns formatDistanceToNow`) | "2 hours ago", "Never" |

### Data Requirements

| Data | API Endpoint | Notes |
|---|---|---|
| List API keys | `GET /api/api-keys` | Returns all keys for the current user. Only returns metadata (name, created, last_used, revoked_at). Never returns the key or hash. |
| Create key | `POST /api/api-keys` with `{ name: "..." }` | Server generates key, stores hash, returns the plaintext key ONCE in the response. |
| Revoke key | `DELETE /api/api-keys/:id` or `PATCH /api/api-keys/:id/revoke` | Sets `revoked_at` timestamp. Does not delete the record. |

### User Interactions

| Action | API Call | Behavior |
|---|---|---|
| Create key | `POST /api/api-keys` | Opens name dialog, then shows key-created dialog with the plaintext key. After closing, key is never shown again. |
| Copy key | None (client-side clipboard) | Copies key to clipboard. Button shows "Copied!" feedback. |
| Revoke key | `PATCH /api/api-keys/:id/revoke` | Confirmation dialog. On confirm, key row updates to show "Revoked" status. |
| Tab navigation | URL param update (`?tab=profile`) | Switches settings section. |

### Real-time Updates (SSE)

- `last_used_at` updates periodically (not critical for real-time, can refresh on page load)
- No SSE needed for this view; it is low-frequency.

---

## Summary: Route Map

| Route | View | Description |
|---|---|---|
| `/projects` | Project List / Dashboard | All projects with summary stats |
| `/projects/$projectId` | Single Project View | Project detail with tabs |
| `/reviews` | Review Queue | Primary triage view for AI suggestions |
| `/entities/$entityId` | Entity Detail | Full entity detail with evidence, relationships, activity |
| `/capture` | Quick Capture (standalone) | Optional standalone capture page |
| `/settings` | Settings / API Keys | API key management |

**Global overlays (not routes):**

| Trigger | Overlay | Description |
|---|---|---|
| `Cmd+K` / Nav button | Quick Capture Modal | Fast note capture from anywhere |
| Various "Create" buttons | Entity/Epic/Project Dialogs | Creation forms as modals |

---

## Summary: SSE Event Types

All real-time updates flow through a single SSE connection per authenticated client.

| Event | Views Affected | Payload |
|---|---|---|
| `review_queue:created` | Review Queue, Global Nav (badge) | New review item data |
| `review_queue:resolved` | Review Queue, Global Nav (badge) | Review item ID + resolver |
| `entity:created` | Project View (all tabs) | New entity data |
| `entity:updated` | Project View, Entity Detail | Updated entity fields |
| `entity:event_added` | Entity Detail (activity log) | New event data |
| `raw_note:processed` | Quick Capture | Raw note ID + extracted entity IDs |
| `project:stats_updated` | Project List | Updated stats for a project |

---

## Component Reuse Map

Several components appear across multiple views and should be built as shared components.

| Shared Component | Used In |
|---|---|
| `EntityTypeBadge` (task/decision/insight with color) | Review Queue, Project View, Entity Detail |
| `StatusBadge` (status with color per entity type) | Project View, Entity Detail, Review Queue |
| `ConfidenceBadge` (color-coded confidence score) | Review Queue, Entity Detail |
| `PriorityBadge` (critical/high/medium/low) | Project View, Entity Detail |
| `CategoryBadge` (feature/bug_fix/improvement/...) | Project View, Entity Detail |
| `ProjectSelector` (searchable project dropdown) | Review Queue, Entity Detail |
| `EpicSelector` (searchable epic dropdown, scoped to project) | Project View, Entity Detail, Review Queue |
| `UserSelector` (searchable user dropdown) | Project View, Entity Detail |
| `EntityCard` (compact entity summary) | Review Queue, Project View (insights, decisions) |
| `EntityRow` (table row for entity) | Project View (tasks table), Epic expanded view |
| `ActivityTimeline` (event log display) | Entity Detail |
| `SourceQuoteCard` (evidence display) | Entity Detail |
| `RelativeTime` (e.g., "2 hours ago") | All views |
| `QuickCaptureModal` (global capture input) | Global (any page) |
| `ConfirmDialog` (destructive action confirmation) | Settings, Project List |
