/**
 * Сервис генерации эмбеддингов через Ollama (OpenAI-совместимый API).
 *
 * Использует модель nomic-embed-text (768 размерность) — лёгкая, работает
 * на CPU, хорошо справляется с русским текстом. Подключение через тот же
 * OpenAI SDK клиент, что и для чата (lib/llm.ts).
 */

import { llm } from './llm.js';
import { env } from '../config/env.js';

/**
 * Генерирует эмбеддинг для одного текста.
 *
 * @param text — текст для векторизации (чанк документа, поисковый запрос и т.п.)
 * @returns массив чисел длиной EMBEDDING_DIMENSIONS (по умолчанию 768)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await llm.embeddings.create({
    model: env.EMBEDDING_MODEL,
    input: text,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error('Не удалось получить эмбеддинг: пустой ответ от модели');
  }

  return embedding;
}

/**
 * Генерирует эмбеддинги для массива текстов (батчевый запрос).
 *
 * OpenAI-совместимый API (и Ollama) поддерживают передачу массива input —
 * один HTTP-запрос вместо N отдельных. Это значительно быстрее при
 * индексации документов.
 *
 * @param texts — массив текстов для векторизации
 * @returns массив эмбеддингов (порядок соответствует входному массиву)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await llm.embeddings.create({
    model: env.EMBEDDING_MODEL,
    input: texts,
  });

  // Ollama может вернуть результаты в произвольном порядке — сортируем по index
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
