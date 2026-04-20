/**
 * Fastify-плагин для RAG-эмбеддингов.
 *
 * Декорирует Fastify-инстанс функциями:
 *   - `app.generateEmbedding` — генерация эмбеддинга для одного текста
 *   - `app.semanticSearch` — семантический поиск по чанкам (pgvector)
 *
 * При старте проверяет доступность модели эмбеддингов. Если модель не
 * скачана — логирует warning с инструкцией по скачиванию.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { env } from '../config/env.js';
import { generateEmbedding } from '../lib/embeddings.js';
import { llm } from '../lib/llm.js';
import { semanticSearch, type SearchParams, type SearchResult } from '../services/rag.js';

// ---------------------------------------------------------------------------
// Расширяем типы FastifyInstance
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyInstance {
    /** Генерирует эмбеддинг для текста (nomic-embed-text, 768 размерность). */
    generateEmbedding: (text: string) => Promise<number[]>;

    /** Семантический поиск по чанкам через pgvector (cosine distance). */
    semanticSearch: (
      prisma: PrismaClient,
      params: SearchParams,
    ) => Promise<SearchResult[]>;
  }
}

// ---------------------------------------------------------------------------
// Плагин
// ---------------------------------------------------------------------------

const embeddingPlugin: FastifyPluginAsync = async (app) => {
  app.decorate('generateEmbedding', generateEmbedding);
  app.decorate('semanticSearch', semanticSearch);

  // Проверяем доступность модели эмбеддингов при старте.
  // Не блокируем запуск — Ollama может ещё загружаться.
  try {
    await llm.embeddings.create({
      model: env.EMBEDDING_MODEL,
      input: 'test',
    });
    app.log.info(
      { model: env.EMBEDDING_MODEL, dimensions: env.EMBEDDING_DIMENSIONS },
      'Embedding: модель эмбеддингов доступна',
    );
  } catch {
    app.log.warn(
      `Embedding: модель ${env.EMBEDDING_MODEL} недоступна. ` +
        `Скачайте её командой: docker exec lawer-ollama ollama pull ${env.EMBEDDING_MODEL}`,
    );
  }
};

export default fp(embeddingPlugin, {
  name: 'embedding',
  // Зависит от LLM-плагина (использует тот же OpenAI SDK клиент).
  dependencies: ['llm'],
});
