---
name: RAG infrastructure
description: Chunk model with pgvector(768), embeddings service (nomic-embed-text), RAG service (chunking, indexing, semantic/hybrid search), embedding plugin
type: project
---

RAG-инфраструктура добавлена 2026-04-20.

**Why:** Нужен семантический поиск по нормативным актам, документам и базе знаний для AI-ассистента юридического отдела.

**How to apply:**
- Модель Chunk в schema.prisma: vector(768) для nomic-embed-text (НЕ 1536 как в Document/KnowledgeBase)
- Все pgvector-операции через raw SQL ($queryRaw/$executeRaw) — Prisma не поддерживает vector нативно
- Эмбеддинги генерируются батчами по 10 через lib/embeddings.ts
- RAG-сервис: services/rag.ts (splitIntoChunks, indexDocument, deleteChunks, semanticSearch, hybridSearch)
- Плагин: plugins/embedding.ts (декорирует app.generateEmbedding и app.semanticSearch)
- Env: EMBEDDING_MODEL, EMBEDDING_DIMENSIONS добавлены в env.ts
- ivfflat индекс (chunks_embedding_idx) создан на таблице chunks
