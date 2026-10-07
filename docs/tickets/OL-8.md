---
key: OL-8
type: story
title: "Authentication: email/password, sessions, MFA"
epic: OL-E2
status: backlog
priority: highest
points: 8
release: R1
labels: [backend, security]
depends_on: [OL-7]
assignee:
created: 2026-10-07
updated: 2026-10-07
---

## Description

Users sign up and sign in; admins can require two-factor authentication.

## Acceptance criteria

- [ ] Email + password sign-up/sign-in (argon2 hashing)
- [ ] Server-side sessions; revoke one or all sessions
- [ ] TOTP two-factor authentication; recovery codes
- [ ] Rate-limited login; generic error messages
- [ ] Google OAuth sign-in

## Technical notes

Better Auth.

## Activity

- 2026-10-07: created (status: backlog).
