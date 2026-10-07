# OpenLabel

**Open-source platform for labelling, curating and evaluating training data, for any modality and any training stack.**

> Status: early development (R0 foundation). Not yet ready for production use.

## What it does

- **Label** documents, images, audio, video, text and LLM data in purpose-built editors. Models pre-label; people correct.
- **Version everything:** label sets (taxonomies), annotations, assets, datasets and models, with full lineage.
- **Review and quality control:** review stages, gold sets, consensus, agreement metrics.
- **Export anywhere:** COCO, YOLO, docTR, Hugging Face datasets, JSONL, chat/DPO formats and more, to local disk, S3, Hugging Face Hub, Kaggle and others.
- **Train anywhere:** launch on local GPUs, Kubernetes, managed ML platforms, GPU clouds or notebook services through adapters.
- **Evaluate any OCR system:** run your own models or commercial APIs on your verified benchmark, convert every response to one canonical format, and compare CER, WER, detection F1, field accuracy, cost and latency.

The full design is in [docs/architecture.md](docs/architecture.md).

## Quick start (Docker)

Requirements: Docker with Compose v2.

```bash
cp .env.example .env
docker compose up -d
```

Then open http://localhost:3000. Health check: http://localhost:3000/api/health.

## Development

Requirements: Node.js 24 (see `.nvmrc`), pnpm 10+, Docker.

```bash
pnpm install
docker compose up -d postgres storage storage-init   # backing services only
pnpm db:migrate
pnpm dev
```

Common tasks:

| Command                          | Does                        |
| -------------------------------- | --------------------------- |
| `pnpm lint`                      | ESLint across the workspace |
| `pnpm typecheck`                 | TypeScript in strict mode   |
| `pnpm test`                      | Unit tests (Vitest)         |
| `pnpm build`                     | Build all packages and apps |
| `node scripts/tickets-board.mjs` | Regenerate the ticket board |

## Repository layout

```
apps/web          Next.js app (UI + API)
apps/worker       background jobs
packages/core     domain logic (framework-free)
packages/db       database schema and migrations
packages/contracts shared schemas (single source of truth)
docs/             architecture, ADRs, tickets
deploy/           deployment files
```

## Project management

Work is tracked as Jira-style tickets in [docs/tickets](docs/tickets/README.md); see the [board](docs/tickets/BOARD.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## Licence

[Apache License 2.0](LICENSE).
