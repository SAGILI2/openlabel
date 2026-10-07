---
key: OL-4
type: task
title: "Docker Compose stack: app, worker, Postgres, SeaweedFS (S3-compatible)"
epic: OL-E1
status: in-review
priority: highest
points: 5
release: R0
labels: [infra]
depends_on: [OL-3]
assignee:
created: 2026-10-07
updated: 2026-10-07
---

## Description

One command brings up the whole platform locally and on a single server.

## Acceptance criteria

- [x] `docker compose up -d` starts web, worker, postgres and storage
- [x] Postgres and SeaweedFS (S3-compatible) have health checks; web and worker wait for them
- [x] Data persisted in named volumes
- [x] SeaweedFS (S3-compatible) bucket created automatically on first start
- [x] Web reachable on a configurable port; `/api/health` returns 200 with DB and storage status
- [x] Multi-stage Dockerfile; runtime image runs as non-root; no dev dependencies in the final image
- [x] `.env.example` documents every variable; no secrets committed

## Technical notes

-

## Activity

- 2026-10-07: created (status: todo).
- 2026-10-07: SeaweedFS (S3-compatible) images are no longer published (repo archived 2026-04) so bundled storage switched to SeaweedFS (Apache-2.0). Stack verified: postgres, storage, storage-init, migrate, web all healthy; /api/health 200 with DB 9ms, storage 4ms. Non-root standalone runtime image.
