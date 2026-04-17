---
name: Backend Docker setup
description: Backend containerized with multi-stage Dockerfile (deps/build/runtime), added to docker-compose.yml with healthcheck and all env vars from compose environment.
type: project
---

Backend Docker infrastructure established as of 2026-04-16.

- `backend/Dockerfile`: 3-stage (deps → build → runtime) on `node:20-alpine`. Prisma client generated in build stage and copied to runtime (avoids prisma CLI in prod image).
- `backend/.dockerignore`: excludes node_modules, dist, .env, docs, lint/format configs from build context.
- `docker-compose.yml`: backend service depends on postgres, redis, minio (all service_healthy). Env vars passed via `environment:` block, not `--env-file`. BACKEND_HOST hardcoded to `0.0.0.0` in compose.
- Healthcheck uses CMD-SHELL with `$${BACKEND_PORT}` for dynamic port resolution.
- `ANTHROPIC_API_KEY` uses `${ANTHROPIC_API_KEY:-}` to allow empty value on MVP.

**Why:** Backend code is ready (Fastify 5 + TypeScript 6 + Prisma 6), needed containerization for consistent dev/prod environments.
**How to apply:** When adding frontend service later, follow same patterns (multi-stage, healthcheck, env from compose, Russian comments, lawer-net network).
