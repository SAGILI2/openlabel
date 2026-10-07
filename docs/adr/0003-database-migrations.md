# ADR-0003: Database migrations and schema drift

- Status: accepted
- Date: 2026-10-07

## Context

The schema will change often while the platform grows, and self-hosted users upgrade from older releases. Hand-written `ALTER TABLE` statements and hand-edited databases drift from the code, causing failures that only show up in production. Tools like Alembic (Python) solve this with generated, versioned migrations; we need the same.

## Decision

- **The TypeScript schema in `packages/db/src/schema` is the source of truth.** Nobody changes a database by hand.
- **Migrations are generated, not written:** `pnpm db:generate --name <change>` (drizzle-kit) diffs the schema against the last migration snapshot and writes a numbered SQL file in `packages/db/drizzle/`. The SQL is reviewed in the pull request like code.
- **Migrations are forward-only and never edited after merge.** A mistake is fixed by a new migration.
- **Applied automatically:** web and worker run pending migrations on start-up (`runMigrations`), tracked in Drizzle's journal table, so `docker compose up` upgrades a database.
- **Drift is checked in CI:**
  - `pnpm --filter @openlabel/db check:drift` fails if `src/schema` has changes that no committed migration captures.
  - `drizzle-kit check` fails if migration files conflict, e.g. two branches both adding `0005_*`.
- **Upgrade path tested in CI:** migrations run from an empty database and from the previous release's schema.
- **Data migrations** (backfills) go in their own migration with idempotent SQL, or as a one-off job, never mixed into schema changes.

## Consequences

Schema changes always ship with a reviewed migration; self-hosters upgrade by pulling a new image. The drift check was verified to pass on a clean schema and to fail on an unmigrated column (it reported the migration it would have generated).
