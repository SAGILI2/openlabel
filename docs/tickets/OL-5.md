---
key: OL-5
type: task
title: "Contracts package: zod schemas as the single source of truth"
epic: OL-E1
status: done
priority: high
points: 3
release: R0
labels: [backend]
depends_on: [OL-3]
assignee:
created: 2026-10-07
updated: 2026-10-07
---

## Description

`@openlabel/contracts` holds the shared schemas: config, API errors, region shapes, canonical OCR result.

## Acceptance criteria

- [x] Environment config schema validated at start-up with readable errors
- [x] RFC 9457 problem-details error schema and helper
- [x] Region schemas: box, polygon, OCR word/line, non-text region, flags, relations
- [x] Canonical OCR result schema (architecture section 12.1)
- [x] Unit tests for valid and invalid examples of every schema

## Technical notes

-

## Activity

- 2026-10-07: created (status: todo).
- 2026-10-07: done: config, problem details, geometry, regions (flags/relations/layers/ignore), canonical OCR + normalisers, value types. 55 unit tests.
