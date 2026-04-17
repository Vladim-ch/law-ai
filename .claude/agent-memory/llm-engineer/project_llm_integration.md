---
name: LLM Integration Architecture
description: How the LLM client (OpenAI SDK + Ollama) is wired into the Fastify backend — lib/llm.ts, system-prompt.ts, plugins/llm.ts
type: project
---

LLM integration uses OpenAI SDK v6 as a universal client for Ollama (self-hosted, OpenAI-compatible API).

**Why:** Ollama exposes an OpenAI-compatible `/v1` endpoint, so using the official `openai` npm package gives us type safety, streaming support, and easy provider switching (just change `LLM_BASE_URL`).

**How to apply:**
- `backend/src/lib/llm.ts` — exports `llm` (OpenAI client instance), `chat()`, `streamChat()`. Default params: temperature=0.3, max_tokens=4096.
- `backend/src/lib/system-prompt.ts` — exports `SYSTEM_PROMPT` (Russian legal assistant prompt) and `getSystemMessage()`.
- `backend/src/plugins/llm.ts` — Fastify plugin that decorates `app.llm`, `app.chat`, `app.streamChat`. Does optional health-check via `llm.models.list()` on startup (warns, doesn't block).
- Env vars: `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` (default 'ollama').
- Current hardware: CPU with Qwen 2.5 7B; planned upgrade to RTX 4090 with 14B/32B models.
