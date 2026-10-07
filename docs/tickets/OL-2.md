---
key: OL-2
type: task
title: "Ticket tracker in the repository"
epic: OL-E1
status: done
priority: highest
points: 2
release: R0
labels: [docs, infra]
depends_on: []
assignee:
created: 2026-10-07
updated: 2026-10-07
---

## Description

Jira-style tickets as Markdown files with YAML front-matter, plus a generated board.

## Acceptance criteria

- [x] Conventions documented in `docs/tickets/README.md`
- [x] Every epic and R0/R1 ticket exists as a file
- [x] `scripts/tickets-board.mjs` regenerates `BOARD.md` grouped by status and epic
- [x] Board script fails loudly on invalid front-matter (unknown status, missing key)

## Technical notes

-

## Activity

- 2026-10-07: created (status: todo).
- 2026-10-07: done: 38 tickets, board generator validates front-matter.
