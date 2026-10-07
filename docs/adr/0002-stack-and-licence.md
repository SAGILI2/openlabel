# ADR-0002: Licence, stack and storage

- Status: accepted
- Date: 2026-10-07

## Decision

| Concern        | Choice                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Licence        | Apache-2.0, DCO sign-off, no CLA                                                                 |
| Language       | TypeScript (app, API, worker); Python for model and evaluation adapters                          |
| Web app        | Next.js (App Router) with React                                                                  |
| Database       | PostgreSQL with Drizzle ORM; JSONB for modality-specific region shapes                           |
| Object storage | Adapter with local-disk and S3-compatible implementations (SeaweedFS bundled; MinIO is archived) |
| Jobs           | pg-boss (queue in Postgres)                                                                      |
| Schemas        | zod in `packages/contracts`, the single source for types and OpenAPI                             |
| Deployment     | Docker Compose first; Helm later                                                                 |
| Monorepo       | pnpm workspaces + Turborepo                                                                      |

## Reasons

- Apache-2.0 is permissive with an explicit patent grant, which eases adoption by companies.
- The core data (assets → annotation versions → reviews → snapshots) is relational and needs transactions; PostgreSQL handles that and still stores flexible region JSON. MongoDB was rejected for that reason; SQLite does not support concurrent multi-user labelling.
- A Postgres-backed queue avoids running Redis.

## Consequences

Contributors need Node.js and Docker; Python is needed only for model/evaluation adapters.
