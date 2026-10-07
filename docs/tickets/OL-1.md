---
key: OL-1
type: task
title: "Repository foundation and open-source files"
epic: OL-E1
status: done
priority: highest
points: 3
release: R0
labels: [infra, docs]
depends_on: []
assignee:
created: 2026-10-07
updated: 2026-10-07
---

## Description

Create the monorepo skeleton and the files every open-source project needs.

## Acceptance criteria

- [x] Apache-2.0 `LICENSE` (official text) and `NOTICE` present
- [x] `README.md` explains what OpenLabel is, the status, and how to run it locally
- [x] `CONTRIBUTING.md` (DCO sign-off, Conventional Commits, branch naming, ticket workflow)
- [x] `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` (private disclosure), `GOVERNANCE.md`, `CHANGELOG.md`
- [x] Issue and PR templates under `.github/`
- [x] `docs/architecture.md` committed with its diagrams
- [x] `.editorconfig`, `.gitattributes` (LF line endings), `.gitignore`

## Technical notes

Line endings forced to LF via .gitattributes so shell scripts work in Linux containers built on Windows hosts.

## Activity

- 2026-10-07: created (status: todo).
- 2026-10-07: done: open-source files, ADRs, templates, architecture doc committed.
