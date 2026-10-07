# ADR-0005: Scaling — stateless app, horizontal workers, separate inference

- Status: accepted
- Date: 2026-10-07

## Context

One server cannot run OCR, detection or speech models over large datasets while also serving the
labelling UI. Pre-labelling and evaluation runs can mean millions of model calls; GPU inference
must not block or starve the web app.

## Decision

Split the system into tiers that scale independently:

| Tier              | Scales by                                                                                                                                                                            | State                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Web/API (Next.js) | more replicas behind a load balancer                                                                                                                                                 | none (sessions in DB)             |
| Workers           | more replicas; per-queue concurrency limits                                                                                                                                          | none                              |
| Inference servers | separate pools per model (CPU or GPU), autoscaled on queue depth; any server that implements the `/predict` contract — self-hosted (Triton, vLLM, TorchServe, BentoML) or a paid API | model weights only                |
| Postgres          | vertical first, then read replicas; large tables (predictions, eval results) partitioned by project/run                                                                              | metadata only                     |
| Object storage    | S3-compatible service, scales on its own                                                                                                                                             | all media and raw model responses |

Rules:

1. **The web app never runs a model.** It enqueues a job and returns.
2. **Workers never hold model weights.** They batch items, call inference servers over HTTP, store
   raw + canonical results, and retry with back-off. Rate limits and cost caps are per engine.
3. **Jobs are chunked** (e.g. 100 assets per job), idempotent and resumable, so a run of a million
   assets survives restarts and spreads across any number of workers.
4. **Media never passes through the app.** Clients and workers read and write object storage with
   signed URLs.
5. **The queue sits behind an interface.** pg-boss (Postgres) is the default because it needs no
   extra service and handles thousands of jobs per second; a Redis/NATS/SQS driver can replace it
   for larger installs without changing job code.

Deployment ladder: one machine with Docker Compose → Compose with GPU inference on a second
machine → Kubernetes (Helm) with autoscaled workers and inference pools (KEDA on queue depth).

## Consequences

- Throughput grows by adding workers and inference replicas; the UI stays responsive during
  large runs.
- Every job type needs idempotency keys and progress reporting from the start (OL-26).
- Load tests are part of the release checklist before R2.
