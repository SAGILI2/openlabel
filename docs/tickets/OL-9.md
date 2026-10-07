---
key: OL-9
type: story
title: "Organisations, memberships and invitations"
epic: OL-E2
status: backlog
priority: highest
points: 5
release: R1
labels: [backend]
depends_on: [OL-8]
assignee:
created: 2026-10-07
updated: 2026-10-07
---

## Description

Multi-tenant: every user belongs to one or more organisations; data is isolated per organisation.

## Acceptance criteria

- [ ] Create organisation; creator becomes Owner
- [ ] Invite by email with a role; accept invitation
- [ ] Switch active organisation
- [ ] Every query scoped by organisation (enforced in a single data-access layer, covered by tests)

## Technical notes

-

## Activity

- 2026-10-07: created (status: backlog).
