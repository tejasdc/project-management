# Clarify.pm

Clarify.pm turns unstructured notes into tasks, decisions, and insights, with source
evidence and human review of uncertain suggestions.

The repository is [tejasdc/project-management](https://github.com/tejasdc/project-management).
Its remote-box checkout is `/root/workspace/project-management`; the public homepage
is [clarify.pm](https://clarify.pm/).

## Start here

- [Agent instructions](../AGENTS.md): architecture, project conventions, and required checks.
- [Hosting and recovery](clarify-hosting.md): Render services, credential location,
  deployment and rollback, domain configuration, live verification, and backend blockers.
- [Product and agent design](project-management-agent.md): capture, extraction, and organization.
- [Extraction prompts](extraction-prompts.md): tasks, decisions, insights, and review.
- [Frontend views](frontend-views.md), [database schema](database-schema.md), and
  [testing architecture](testing-architecture.md): implementation references.

## Delivery status — September 11, 2026

The public homepage runs on the existing Render frontend at `https://clarify.pm/`.
Its source is `packages/web/src/components/Homepage.tsx`; assets are under
`packages/web/public/homepage/`. The temporary Cloudflare homepage was removed.
Render's build command, publish directory, app-route rewrite, and Blueprint were
left unchanged. Both light and dark themes were checked in Chromium and WebKit on
Linux at desktop and mobile sizes.

The homepage being live does not mean the application backend is working. The
configured Postgres resource was not found, and Redis and the worker are suspended.
Preserving old data versus starting fresh still needs the owner's decision. Leave
the homepage's offline notice in place until login, capture, extraction, and review
pass live acceptance. Read the hosting runbook before changing services or syncing
the Blueprint.

The personal-site entry is controlled by `.publish.json`, using the existing
`clarify` slug, the full title **Clarify.pm**, and the canonical domain. Its selected
portfolio image is a dark-mode screenshot at `/specimens/clarify-dark.png` in the
`chann-app` repository. Publish descriptor changes through `ship-to-site`.
