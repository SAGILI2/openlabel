---
key: OL-3
type: task
title: "Workspace tooling: pnpm, Turborepo, TypeScript, lint, format"
epic: OL-E1
status: done
priority: highest
points: 3
release: R0
labels: [infra]
depends_on: [OL-1]
assignee:
created: 2026-10-07
updated: 2026-10-07
---

## Description

pnpm workspaces with Turborepo, shared strict TypeScript config, ESLint and Prettier.

## Acceptance criteria

- [x] `pnpm install` works from a clean clone
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` run across all packages via Turborepo
- [x] Shared `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- [x] ESLint flat config with typescript-eslint strict rules; Prettier config
- [x] Node version pinned (`.nvmrc` and `engines`)

## Technical notes

TypeScript pinned to the newest version supported by typescript-eslint (currently <6.1).

## Activity

- 2026-10-07: created (status: todo).
- 2026-10-07: done: pnpm 10 + Turborepo, strict TS 6 (TS 7 not yet supported by typescript-eslint), ESLint flat config, Prettier, .nvmrc.
