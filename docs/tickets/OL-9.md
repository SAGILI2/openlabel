---
key: OL-9
type: story
title: "Organisations, memberships and invitations"
epic: OL-E2
status: in-review
priority: highest
points: 5
release: R1
labels: [backend]
depends_on: [OL-8]
assignee: SAGILI2
created: 2026-10-07
updated: 2026-10-07
---

## Description

Multi-tenant: every user belongs to one or more organisations; data is isolated per organisation.

## Acceptance criteria

- [x] Create organisation; creator becomes Owner
- [x] Invite by email with a role; accept invitation (shareable one-time link; emailing it is OL-45)
- [x] Switch active organisation
- [x] Every query scoped by organisation (enforced in a single data-access layer, covered by tests)

## Technical notes

- Data-access layer: `packages/db/src/access`. Org-owned queries take an `OrgScope`, obtainable only via `resolveOrgScope` (membership check). Typed `AccessError` codes.
- Invitations: 32-byte random token, only its SHA-256 stored; single use; 7-day expiry; must be accepted by the invited email; re-inviting revokes the earlier link.
- Roles: nobody grants or edits a role above their own; an org always keeps one owner; any member can leave. Coarse `requireRole` until OL-10's `can()`.
- Active org stored on the session (`sessions.active_org_id`), re-checked against memberships every request.
- Every change writes an `audit_events` row.
- UI: `/onboarding`, org switcher in the top bar, `/settings/members`, `/invite/[token]`.

## Activity

- 2026-10-07: created (status: backlog).
- 2026-10-07: implemented; verified in the browser (create org, invite, accept as a second user, roles shown). 25 db integration tests incl. cross-org isolation. Email delivery split out to OL-45. Status in-review.
