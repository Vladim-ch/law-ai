/**
 * Сервис работы с нормативными актами: импорт, индексация, поиск.
 *
 * Обеспечивает CRUD для модели Law и интеграцию с RAG-инфраструктурой
 * (чанкинг + pgvector) для семантического поиска по текстам НПА.
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import type { PrismaClient, Law } from '@prisma/client';

import { parseDocumentText } from './document.js';

import {
  indexDocument,
  semanticSearch,
  type SearchResult,
} from './rag.js';

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

/** Данные для импорта нормативного акта */
export interface ImportLawData {
  name: string;
  fullName: string;
  category: string;
  content: string;
}

/** Метаданные закона (без контента — для импорта из файла) */
export interface LawFileMeta {
  name: string;
  fullName: string;
  category: string;
}

// ---------------------------------------------------------------------------
// Импорт
// ---------------------------------------------------------------------------

/**
 * Создаёт или обновляет нормативный акт в БД (upsert по name).
 *
 * При обновлении перезаписывает fullName, category и content.
 * chunksCount сбрасывается — требуется повторная индексация.
 */
export async function importLaw(
  prisma: PrismaClient,
  data: ImportLawData,
): Promise<Law> {
  const { name, fullName, category, content } = data;

  return prisma.law.upsert({
    where: { name },
    create: { name, fullName, category, content },
    update: { fullName, category, content, chunksCount: 0 },
  });
}

/**
 * Читает текст из файла и импортирует как нормативный акт.
 * Поддерживает форматы: .txt, .docx, .pdf, .rtf.
 * Для .docx/.pdf/.rtf — парсинг через parseDocumentText (mammoth/pdf-parse).
 *
 * @param prisma — клиент Prisma
 * @param filePath — абсолютный путь к файлу (.txt, .docx, .pdf, .rtf)
 * @param meta — метаданные закона (name, fullName, category)
 * @returns созданная/обновлённая запись Law
 */
export async function importLawFromFile(
  prisma: PrismaClient,
  filePath: string,
  meta: LawFileMeta,
): Promise<Law> {
  const buffer = await readFile(filePath);
  const fileType = extname(filePath).replace('.', '').toLowerCase();

  let content: string;

  if (fileType === 'txt') {
    // Для .txt — прямое чтение UTF-8
    content = buffer.toString('utf-8');
  } else {
    // Для .docx, .pdf, .rtf — парсинг через document-сервис
    content = await parseDocumentText(buffer, fileType);
  }

  return importLaw(prisma, {
    name: meta.name,
    fullName: meta.fullName,
    category: meta.category,
    content,
  });
}

// ---------------------------------------------------------------------------
// Индексация
// ---------------------------------------------------------------------------

/**
 * Индексирует текст нормативного акта для RAG-поиска.
 *
 * 1. Загружает law.content из БД
 * 2. Разбивает на чанки через splitIntoChunks()
 * 3. Создаёт эмбеддинги и сохраняет в таблицу chunks (sourceType="law")
 * 4. Обновляет law.chunksCount
 *
 * @param prisma — клиент Prisma
 * @param lawId — UUID нормативного акта
 * @returns количество созданных чанков
 */
export async function indexLaw(
  prisma: PrismaClient,
  lawId: string,
): Promise<number> {
  const law = await prisma.law.findUniqueOrThrow({ where: { id: lawId } });

  const chunksCount = await indexDocument(prisma, {
    sourceType: 'law',
    sourceId: lawId,
    text: law.content,
    metadata: { lawName: law.name },
  });

  await prisma.law.update({
    where: { id: lawId },
    data: { chunksCount },
  });

  return chunksCount;
}

// ---------------------------------------------------------------------------
// Чтение
// ---------------------------------------------------------------------------

/**
 * Возвращает список всех нормативных актов (без поля content для экономии).
 */
export async function listLaws(prisma: PrismaClient): Promise<Law[]> {
  return prisma.law.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Поиск
// ---------------------------------------------------------------------------

/**
 * Семантический поиск по чанкам нормативных актов.
 *
 * @param prisma — клиент Prisma
 * @param query — текст запроса на естественном языке
 * @param limit — максимальное количество результатов (по умолчанию 10)
 * @returns массив SearchResult с оценкой similarity
 */
export async function searchLaws(
  prisma: PrismaClient,
  query: string,
  limit?: number,
): Promise<SearchResult[]> {
  return semanticSearch(prisma, {
    query,
    sourceType: 'law',
    limit,
  });
}
