---
name: Frontend Docker setup
description: Next.js 14 standalone multi-stage Dockerfile, compose service with build-time NEXT_PUBLIC_* args, port 3000
type: project
---

Frontend containerized as Next.js standalone (output: 'standalone' in next.config.ts). Multi-stage Dockerfile: deps -> build -> runtime on node:20-alpine.

**Why:** Standalone mode produces minimal server.js + only required node_modules, resulting in ~120-150 MB runtime image instead of full node_modules.

**How to apply:**
- NEXT_PUBLIC_* variables must be passed as build args (not runtime env) — Next.js bakes them into the JS bundle at build time.
- Runtime needs only HOSTNAME=0.0.0.0 and PORT=3000 — standalone listens on localhost by default, incompatible with Docker networking.
- frontend depends_on backend (service_healthy), not on infra services directly — those are backend's transitive deps.
- Port 3000 bound to 127.0.0.1 only, consistent with other services.
- frontend/.dockerignore is separate from root .dockerignore since build context is ./frontend.
