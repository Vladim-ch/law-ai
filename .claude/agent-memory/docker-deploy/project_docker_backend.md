---
name: Backend Docker setup
description: Backend containerized with multi-stage Dockerfile (deps/build/runtime), added to docker-compose.yml with healthcheck and all env vars from compose environment.
type: project
---

Backend Docker infrastructure established as of 2026-04-16.

- `backend/Dockerfile`: 3-stage (deps -> build -> runtime) on `node:20-alpine`. Prisma client generated in build stage and copied to runtime (avoids prisma CLI in prod image).
- `backend/.dockerignore`: excludes node_modules, dist, .env, docs, lint/format configs from build context.
- `docker-compose.yml`: backend service depends on postgres, redis, minio, ollama (all service_healthy). Env vars passed via `environment:` block, not `--env-file`. BACKEND_HOST hardcoded to `0.0.0.0` in compose.
- Healthcheck uses CMD-SHELL with `$${BACKEND_PORT}` for dynamic port resolution.
- LLM vars: `LLM_BASE_URL` (hardcoded to `http://ollama:11434/v1` in compose), `LLM_MODEL` from .env, `LLM_API_KEY` with default `ollama`.

**Why:** Backend code is ready (Fastify 5 + TypeScript 6 + Prisma 6), needed containerization for consistent dev/prod environments.
**How to apply:** When modifying LLM integration, env vars are validated in `backend/src/config/env.ts` (LLM_BASE_URL, LLM_MODEL, LLM_API_KEY).
