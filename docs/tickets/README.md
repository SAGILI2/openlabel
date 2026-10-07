# Ticket tracker

OpenLabel tracks work as Markdown tickets in this folder, in the same shape as Jira
issues, so the backlog lives with the code and is reviewed in pull requests.

## Layout

```
docs/tickets/
  README.md          this file: conventions
  BOARD.md           generated board: tickets grouped by status and epic
  epics/OL-E1.md     one file per epic
  OL-1.md            one file per issue
```

## Ticket fields

Every ticket starts with a YAML header:

| Field                 | Values                                                                   |
| --------------------- | ------------------------------------------------------------------------ |
| `key`                 | `OL-<n>` for issues, `OL-E<n>` for epics. Never reused                   |
| `type`                | `epic`, `story`, `task`, `bug`, `spike`                                  |
| `title`               | Short imperative summary                                                 |
| `epic`                | Parent epic key (issues only)                                            |
| `status`              | `backlog` → `todo` → `in-progress` → `in-review` → `done` (or `wont-do`) |
| `priority`            | `highest`, `high`, `medium`, `low`                                       |
| `points`              | Story points: 1, 2, 3, 5, 8, 13                                          |
| `release`             | `R0` (foundation), `R1`, `R2`, `R3`                                      |
| `labels`              | Free tags, e.g. `backend`, `frontend`, `infra`, `security`               |
| `depends_on`          | Keys that must be `done` first                                           |
| `assignee`            | GitHub handle or empty                                                   |
| `created` / `updated` | ISO dates                                                                |

The body has these sections, in this order: **Description**, **Acceptance criteria**
(checkboxes, each one testable), **Technical notes**, and **Activity** (dated log
of status changes and decisions).

## Workflow

1. Pick the highest-priority `todo` ticket whose `depends_on` are all `done`.
2. Set `status: in-progress`, add an Activity line.
3. Branch `<key>-<short-slug>`, e.g. `OL-3-docker-compose`.
4. Commit messages reference the key: `feat(db): add assets table (OL-7)`.
5. Open a pull request; set `status: in-review`.
6. A ticket is `done` only when every acceptance criterion is checked and CI passes.

## Regenerating the board

```bash
node scripts/tickets-board.mjs
```
