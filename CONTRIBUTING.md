# Contributing to OpenLabel

Thank you for helping. This guide covers how work is organised and what a pull request needs.

## Before you start

- Look for an existing ticket in [docs/tickets](docs/tickets/BOARD.md). For anything non-trivial, open or comment on a ticket first so the approach can be agreed.
- Significant design decisions are recorded as Architecture Decision Records in [docs/adr](docs/adr).

## Development setup

See the Development section of the [README](README.md).

## Workflow

1. Pick a `todo` ticket whose dependencies are `done`; set it to `in-progress`.
2. Create a branch named `<ticket-key>-<short-slug>`, e.g. `OL-14-asset-upload`.
3. Make focused commits (see below).
4. Run `pnpm lint && pnpm typecheck && pnpm test` locally.
5. Open a pull request using the template; set the ticket to `in-review`.
6. A maintainer reviews. The ticket is `done` when every acceptance criterion is checked and CI passes.

`main` is protected by a repository ruleset that applies to everyone, maintainers included:
changes land only through pull requests; every CI job (lint/typecheck/test/build, dependency
audit and licences, secret scan, Docker image, DCO) must pass on a branch that is up to date
with `main`; review threads must be resolved; and force-pushes and branch deletion are blocked.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(db): add assets table (OL-7)
fix(editor): keep selection after zoom (OL-20)
docs: explain storage adapters
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`.

## Developer Certificate of Origin (DCO)

Every commit must be signed off, certifying you have the right to submit it under the project's licence ([developercertificate.org](https://developercertificate.org/)):

```bash
git commit -s -m "feat(api): add API keys (OL-35)"
```

This adds `Signed-off-by: Your Name <you@example.com>`. CI rejects pull requests with unsigned commits. There is no separate CLA.

## Coding standards

The full list is in [docs/architecture.md](docs/architecture.md), section 14.3. In short:

- **TypeScript:** `strict` mode; no `any` without a comment explaining why; ESLint and Prettier must pass.
- **Python:** 3.11+, type hints on public functions, Ruff, `mypy --strict`.
- **Contracts first:** API bodies, regions and adapter I/O are zod schemas in `packages/contracts`; generate types from them, never copy by hand.
- **Domain logic** lives in `packages/core` and does not import web or database code.
- **Every query is scoped by organisation.** Permission checks go through the permissions module only.
- **No user-facing strings in code:** use translation keys.
- **Errors:** typed errors with stable codes; API errors use RFC 9457 problem details.
- **No secrets** in code, logs or tests.

## Tests

- **Tests never live in `src/`.** Each package has its own `tests/` folder that mirrors `src/`:

  ```
  packages/contracts/
    src/value-types/validate.ts
    tests/unit/value-types/validate.test.ts
  packages/db/
    src/migrate/run.ts
    tests/integration/migrate/run.test.ts
  ```

  `tests/unit/` is fast and isolated; `tests/integration/` may use Docker (Postgres, S3-compatible storage); `tests/e2e/` (apps only) uses Playwright.

- New logic needs unit tests; adapters must pass the shared contract test kit.
- Bug fixes include a test that fails without the fix.
- Core packages and metrics keep at least 90% line coverage.

## Licence

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
