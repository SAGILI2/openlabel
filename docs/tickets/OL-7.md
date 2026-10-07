---
key: OL-7
type: task
title: "Database package: Drizzle schema, migrations, client"
epic: OL-E1
status: in-review
priority: highest
points: 5
release: R0
labels: [backend, db]
depends_on: [OL-3, OL-5]
assignee:
created: 2026-10-07
updated: 2026-10-07
---

## Description

`@openlabel/db` with the initial schema and migration tooling.

## Acceptance criteria

- [x] Drizzle schema for organisations, users, memberships, projects, assets, audit_events
- [x] Migrations generated and applied with `pnpm db:migrate`; worker/web run pending migrations on start
- [x] Every tenant table has `org_id`; indexes on foreign keys
- [x] Typed client factory with connection pooling
- [x] Integration test runs migrations against a real Postgres
- [x] Drift check: CI fails if the schema changes without a migration (`check:drift`), verified both ways
- [x] Migration policy recorded in ADR-0003

## Technical notes

-

## Activity

- 2026-10-07: created (status: todo).
- 2026-10-07: migrations run in compose via the migrate job; integration test (3 tests) against disposable Postgres; drift check proven both ways.
