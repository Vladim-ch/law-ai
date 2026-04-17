---
name: Ollama LLM service setup
description: Ollama self-hosted LLM added to docker-compose with CPU mode, commented GPU block for RTX 4090, ollama-init for model download
type: project
---

Ollama added to Docker Compose as LLM provider (replacing Anthropic/Claude API) on 2026-04-16.

- `ollama` service: `ollama/ollama:latest`, port 11434 on localhost, `ollama-data` named volume for model persistence.
- `ollama-init` service (profile `init`): pulls model specified in `LLM_MODEL` env var (default `qwen2.5:7b`).
- GPU support: commented `deploy.resources.reservations.devices` block in compose — uncomment for NVIDIA GPU.
- Backend uses OpenAI-compatible API via `LLM_BASE_URL=http://ollama:11434/v1`.
- Decision: Claude API unavailable, Ollama chosen. Current dev: CPU (qwen2.5:7b). Target: RTX 4090 (qwen2.5:14b or 32b).

**Why:** Claude API unavailable for the project. Ollama provides OpenAI-compatible REST API, enabling easy future switch to any OpenAI-compatible provider.
**How to apply:** To switch LLM provider, change `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` in `.env`. No code changes needed — backend uses OpenAI SDK with custom baseURL.
