---
name: External service plugins
description: Fastify plugins for Prisma, Redis (ioredis), MinIO created in backend/src/plugins/; /health endpoint extended with real dependency checks
type: project
---

Prisma, Redis, MinIO Fastify plugins added under `backend/src/plugins/`. Each decorates FastifyInstance with typed clients (`app.prisma`, `app.redis`, `app.minio`). Health endpoint at `/health` performs parallel checks with 3s timeout, returns ok/degraded/error status.

**Why:** Backend needs real connections for upcoming features (BullMQ queues, document storage, DB queries) and health checks for Docker/k8s probes.

**How to apply:** When adding new routes that need DB/Redis/MinIO access, use `fastify.prisma`, `fastify.redis`, `fastify.minio` — types are already declared via module augmentation.
