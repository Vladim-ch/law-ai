/**
 * RAG-сервис: чанкинг, индексация, семантический и гибридный поиск.
 *
 * Работает поверх таблицы `chunks` (pgvector, 768 размерность) и модели
 * эмбеддингов nomic-embed-text (Ollama). Prisma не поддерживает тип vector
 * нативно — все операции с эмбеддингами выполняются через raw SQL.
 */

import type { PrismaClient } from '@prisma/client';

import { generateEmbedding, generateEmbeddings } from '../lib/embeddings.js';

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

/** Допустимые типы источников чанков */
export type ChunkSourceType = 'law' | 'document' | 'knowledge_base';

/** Результат семантического / гибридного поиска */
export interface SearchResult {
  chunkId: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  metadata: unknown;
  similarity: number;
}

/** Параметры разбиения текста на чанки */
export interface ChunkingOptions {
  /** Максимальный размер чанка в символах (по умолчанию 1000) */
  chunkSize?: number;
  /** Размер перекрытия между чанками в символах (по умолчанию 200) */
  overlap?: number;
}

/** Параметры индексации документа */
export interface IndexDocumentParams {
  sourceType: ChunkSourceType;
  sourceId: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/** Параметры поиска */
export interface SearchParams {
  query: string;
  sourceType?: ChunkSourceType;
  /** Фильтр по владельцу документа (для sourceType='document' — только свои) */
  userId?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 200;
const DEFAULT_SEARCH_LIMIT = 10;

/** Размер батча при генерации эмбеддингов (экономим RAM на CPU) */
const EMBEDDING_BATCH_SIZE = 10;

// ---------------------------------------------------------------------------
// Чанкинг
// ---------------------------------------------------------------------------

/**
 * Разбивает текст на чанки с перекрытием.
 *
 * Алгоритм:
 * 1. Разбивает текст по абзацам (`\n\n`)
 * 2. Группирует абзацы в чанки, не превышающие chunkSize
 * 3. Если абзац сам по себе > chunkSize — разбивает по предложениям (`. `)
 * 4. Между чанками добавляется overlap для сохранения контекста
 *
 * @param text — исходный текст документа
 * @param options — размер чанка и перекрытие
 * @returns массив текстовых чанков
 */
export function splitIntoChunks(
  text: string,
  options?: ChunkingOptions,
): string[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;

  if (!text.trim()) return [];

  // Разбиваем на абзацы, убираем пустые
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  // Если абзац > chunkSize — разбиваем на предложения
  const segments = flatMapSegments(paragraphs, chunkSize);

  return groupIntoChunks(segments, chunkSize, overlap);
}

/**
 * Разбивает длинные абзацы на предложения, короткие оставляет как есть.
 */
function flatMapSegments(paragraphs: string[], chunkSize: number): string[] {
  const result: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (trimmed.length <= chunkSize) {
      result.push(trimmed);
      continue;
    }

    // Разбиваем по предложениям: точка + пробел, восклицательный/вопросительный знак
    const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);

    for (const sentence of sentences) {
      const s = sentence.trim();
      if (s.length > 0) {
        result.push(s);
      }
    }
  }

  return result;
}

/**
 * Группирует сегменты в чанки с учётом максимального размера и перекрытия.
 */
function groupIntoChunks(
  segments: string[],
  chunkSize: number,
  overlap: number,
): string[] {
  if (segments.length === 0) return [];

  const chunks: string[] = [];
  let currentParts: string[] = [];
  let currentLength = 0;

  for (const segment of segments) {
    const segmentLength = segment.length;
    // Разделитель \n\n между частями
    const separatorLength = currentParts.length > 0 ? 2 : 0;

    if (currentLength + separatorLength + segmentLength > chunkSize && currentParts.length > 0) {
      // Текущий чанк заполнен — сохраняем
      chunks.push(currentParts.join('\n\n'));

      // Формируем overlap: берём последние части, укладывающиеся в overlap
      const overlapParts: string[] = [];
      let overlapLength = 0;

      for (let i = currentParts.length - 1; i >= 0; i--) {
        const part = currentParts[i]!;
        const addLength = part.length + (overlapParts.length > 0 ? 2 : 0);
        if (overlapLength + addLength > overlap) break;
        overlapParts.unshift(part);
        overlapLength += addLength;
      }

      currentParts = overlapParts;
      currentLength = overlapLength;
    }

    currentParts.push(segment);
    currentLength += separatorLength + segmentLength;
  }

  // Последний чанк
  if (currentParts.length > 0) {
    chunks.push(currentParts.join('\n\n'));
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Индексация
// ---------------------------------------------------------------------------

/**
 * Индексирует документ: разбивает на чанки, генерирует эмбеддинги, сохраняет
 * в таблицу `chunks` с pgvector.
 *
 * Эмбеддинги генерируются батчами по EMBEDDING_BATCH_SIZE штук — это
 * экономит RAM при работе на CPU (nomic-embed-text).
 *
 * @param prisma — клиент Prisma для raw-запросов
 * @param params — параметры индексации (sourceType, sourceId, text, metadata)
 * @returns количество созданных чанков
 */
export async function indexDocument(
  prisma: PrismaClient,
  params: IndexDocumentParams,
): Promise<number> {
  const { sourceType, sourceId, text, metadata } = params;

  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return 0;

  // Удаляем старые чанки перед переиндексацией
  await deleteChunks(prisma, sourceType, sourceId);

  // Генерируем эмбеддинги и сохраняем батчами
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const embeddings = await generateEmbeddings(batch);

    // Сохраняем каждый чанк из батча
    for (let j = 0; j < batch.length; j++) {
      const chunkIndex = i + j;
      const content = batch[j]!;
      const embedding = embeddings[j]!;
      const embeddingStr = `[${embedding.join(',')}]`;
      const metadataJson = metadata ? JSON.stringify(metadata) : null;

      await prisma.$executeRaw`
        INSERT INTO chunks (id, source_type, source_id, chunk_index, content, embedding, metadata, created_at)
        VALUES (
          uuid_generate_v4(),
          ${sourceType},
          ${sourceId}::uuid,
          ${chunkIndex},
          ${content},
          ${embeddingStr}::vector,
          ${metadataJson}::jsonb,
          NOW()
        )
      `;
    }
  }

  return chunks.length;
}

// ---------------------------------------------------------------------------
// Удаление чанков
// ---------------------------------------------------------------------------

/**
 * Удаляет все чанки указанного источника.
 * Используется при переиндексации или удалении документа.
 */
export async function deleteChunks(
  prisma: PrismaClient,
  sourceType: string,
  sourceId: string,
): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM chunks
    WHERE source_type = ${sourceType}
      AND source_id = ${sourceId}::uuid
  `;
}

// ---------------------------------------------------------------------------
// Семантический поиск
// ---------------------------------------------------------------------------

/**
 * Семантический поиск по чанкам через pgvector (cosine distance).
 *
 * Генерирует эмбеддинг запроса и ищет ближайшие чанки в векторном
 * пространстве. Опционально фильтрует по типу источника.
 *
 * @param prisma — клиент Prisma
 * @param params — query (текст запроса), sourceType (фильтр), limit
 * @returns массив результатов с оценкой similarity (0..1)
 */
export async function semanticSearch(
  prisma: PrismaClient,
  params: SearchParams,
): Promise<SearchResult[]> {
  const { query, sourceType, userId, limit = DEFAULT_SEARCH_LIMIT } = params;

  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Фильтр по userId: документы — только свои, НПА (law) и база знаний — общие
  const userIdFilter = userId ?? null;

  const rows = await prisma.$queryRaw<SearchResult[]>`
    SELECT
      id AS "chunkId",
      source_type AS "sourceType",
      source_id AS "sourceId",
      chunk_index AS "chunkIndex",
      content,
      metadata,
      1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM chunks
    WHERE embedding IS NOT NULL
      AND (${sourceType}::text IS NULL OR source_type = ${sourceType}::text)
      AND (
        source_type != 'document'
        OR ${userIdFilter}::text IS NULL
        OR metadata->>'userId' = ${userIdFilter}
      )
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;

  return rows;
}

// ---------------------------------------------------------------------------
// Гибридный поиск
// ---------------------------------------------------------------------------

/**
 * Гибридный поиск: семантический (pgvector cosine) + полнотекстовый (pg_trgm).
 *
 * Комбинирует два сигнала релевантности:
 *   - 70% веса: семантическая близость эмбеддингов (cosine similarity)
 *   - 30% веса: триграммное сходство текста (pg_trgm similarity)
 *
 * Порог cosine distance < 0.5 отсекает заведомо нерелевантные чанки
 * (similarity > 0.5).
 *
 * @param prisma — клиент Prisma
 * @param params — query (текст запроса), sourceType (фильтр), limit
 * @returns массив результатов, отсортированных по combined_score
 */
export async function hybridSearch(
  prisma: PrismaClient,
  params: SearchParams,
): Promise<SearchResult[]> {
  const { query, sourceType, userId, limit = DEFAULT_SEARCH_LIMIT } = params;

  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Фильтр по userId: документы — только свои, НПА (law) и база знаний — общие
  const userIdFilter = userId ?? null;

  const rows = await prisma.$queryRaw<SearchResult[]>`
    SELECT
      id AS "chunkId",
      source_type AS "sourceType",
      source_id AS "sourceId",
      chunk_index AS "chunkIndex",
      content,
      metadata,
      0.7 * (1 - (embedding <=> ${embeddingStr}::vector)) +
      0.3 * similarity(content, ${query}) AS similarity
    FROM chunks
    WHERE embedding IS NOT NULL
      AND (${sourceType}::text IS NULL OR source_type = ${sourceType}::text)
      AND (
        source_type != 'document'
        OR ${userIdFilter}::text IS NULL
        OR metadata->>'userId' = ${userIdFilter}
      )
      AND (embedding <=> ${embeddingStr}::vector) < 0.5
    ORDER BY (
      0.7 * (1 - (embedding <=> ${embeddingStr}::vector)) +
      0.3 * similarity(content, ${query})
    ) DESC
    LIMIT ${limit}
  `;

  return rows;
}
