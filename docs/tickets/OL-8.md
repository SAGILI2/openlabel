---
key: OL-8
type: story
title: "Authentication: email/password, sessions, MFA"
epic: OL-E2
status: in-review
priority: highest
points: 8
release: R1
labels: [backend, security]
depends_on: [OL-7]
assignee: SAGILI2
created: 2026-10-07
updated: 2026-10-07
---

## Description

Users sign up and sign in; admins can require two-factor authentication.

## Acceptance criteria

- [x] Email + password sign-up/sign-in (argon2id, OWASP parameters); minimum length configurable, default 6
- [x] Server-side sessions; revoke one or all sessions
- [x] TOTP two-factor authentication; recovery codes
- [x] Rate-limited login (shared across replicas via Postgres); generic error messages, no account enumeration
- [x] Google OAuth sign-in (enabled when GOOGLE_CLIENT_ID/SECRET are set; not yet tested against a real Google app)

## Technical notes

- Better Auth 1.7.7 (MIT), telemetry off. Tables in `packages/db/src/schema/auth.ts`, migration `0001_auth`.
- `AUTH_ALLOW_SIGNUP=false` lets only the first user (the installer) register; others join by invitation (OL-9).
- Screens: `/sign-in`, `/sign-up`, `/sign-in/two-factor`, `/settings/security`. The `(app)` layout requires a session.
- Tests: `apps/web/tests/unit` (errors, hashing, device labels) and `apps/web/tests/integration/server/auth` (real Postgres).

## Activity

- 2026-10-07: created (status: backlog).
- 2026-10-07: implemented; verified in the browser (sign-up, sign-in, 2FA setup, 2FA sign-in, wrong code, sign-out) and via API (enumeration, rate limit 429 after 5 attempts). Minimum password length set to 6 at the user's request. Status in-review.
