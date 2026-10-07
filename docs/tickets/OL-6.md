---
key: OL-6
type: task
title: "CI pipeline"
epic: OL-E1
status: in-review
priority: high
points: 3
release: R0
labels: [infra, security]
depends_on: [OL-3]
assignee:
created: 2026-10-07
updated: 2026-10-07
---

## Description

GitHub Actions run every quality gate on pull requests.

## Acceptance criteria

- [x] Lint, typecheck, unit tests, build on every PR
- [x] Docker image build
- [x] Dependency audit and licence check (permissive licences only in core)
- [x] Secret scanning
- [x] DCO sign-off check

## Technical notes

- Workflow: `.github/workflows/ci.yml` — jobs `quality` (format, lint, typecheck, tests with a Postgres service, build, `db:check`, board freshness), `supply-chain` (`pnpm audit --prod`, `scripts/check-licences.mjs`), `secrets` (gitleaks over full history), `docker` (runtime + migrate targets), `dco` (`scripts/check-dco.mjs`).
- Licence exceptions live in `scripts/check-licences.mjs`, each with a reason.

## Activity

- 2026-10-07: created (status: todo).
- 2026-10-07: workflow and scripts added; all gates pass locally and gitleaks finds no secrets. Status in-review until the first run on GitHub is green.
