/**
 * Сервис документов: парсинг, загрузка в MinIO, CRUD в БД.
 *
 * Поддерживаемые форматы: docx, pdf, txt, rtf.
 * Парсинг текста — best-effort: если извлечение не удалось,
 * документ сохраняется без contentText (не блокируем загрузку).
 */

import type { PrismaClient, Document } from '@prisma/client';
import type { Client as MinioClient } from 'minio';
import type OpenAI from 'openai';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

import { getSystemMessage } from '../lib/system-prompt.js';
import { streamChat, chat } from '../lib/llm.js';

// ---------------------------------------------------------------------------
// Допустимые расширения файлов
// ---------------------------------------------------------------------------

/** Белый список расширений, разрешённых для загрузки. */
export const ALLOWED_FILE_TYPES = ['docx', 'pdf', 'txt', 'rtf'] as const;
export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number];

/** Проверяет, входит ли расширение в белый список. */
export function isAllowedFileType(ext: string): ext is AllowedFileType {
  return (ALLOWED_FILE_TYPES as readonly string[]).includes(ext.toLowerCase());
}

// ---------------------------------------------------------------------------
// Маппинг расширений → MIME-типов
// ---------------------------------------------------------------------------

const MIME_MAP: Record<AllowedFileType, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  txt: 'text/plain',
  rtf: 'application/rtf',
};

// ---------------------------------------------------------------------------
// Парсинг текста из документа
// ---------------------------------------------------------------------------

/**
 * Извлекает чистый текст из буфера файла.
 *
 * @throws Error — если формат не поддерживается.
 */
export async function parseDocumentText(
  buffer: Buffer,
  fileType: string,
): Promise<string> {
  const type = fileType.toLowerCase();

  switch (type) {
    case 'docx': {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    case 'pdf': {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    }

    case 'txt':
    case 'rtf':
      return buffer.toString('utf-8');

    default:
      throw new Error(`Неподдерживаемый формат файла: ${type}`);
  }
}

// ---------------------------------------------------------------------------
// Загрузка документа (MinIO + БД)
// ---------------------------------------------------------------------------

interface UploadDocumentParams {
  prisma: PrismaClient;
  minio: MinioClient;
  bucket: string;
  userId: string;
  filename: string;
  buffer: Buffer;
  fileType: AllowedFileType;
}

interface UploadDocumentResult {
  document: Document;
  /** Ошибка парсинга текста (если произошла). */
  parseError: string | null;
}

/**
 * Загружает документ в MinIO, парсит текст и сохраняет запись в БД.
 *
 * Если парсинг текста упал — не блокируем загрузку: документ
 * сохраняется с contentText = null, а ошибка возвращается
 * вызывающему коду для информирования пользователя.
 */
export async function uploadDocument(
  params: UploadDocumentParams,
): Promise<UploadDocumentResult> {
  const { prisma, minio, bucket, userId, filename, buffer, fileType } = params;

  // Генерируем безопасный путь — не используем пользовательский filename напрямую
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `documents/${userId}/${Date.now()}_${safeName}`;

  // Загружаем в MinIO
  const mimeType = MIME_MAP[fileType];
  await minio.putObject(bucket, filePath, buffer, buffer.length, {
    'Content-Type': mimeType,
  });

  // Извлекаем текст (best-effort)
  let contentText: string | null = null;
  let parseError: string | null = null;

  try {
    contentText = await parseDocumentText(buffer, fileType);
  } catch (error) {
    parseError =
      error instanceof Error
        ? error.message
        : 'Не удалось извлечь текст из документа';
  }

  // Сохраняем запись в БД
  const document = await prisma.document.create({
    data: {
      userId,
      filename,
      filePath,
      fileType,
      contentText,
    },
  });

  return { document, parseError };
}

// ---------------------------------------------------------------------------
// Список документов пользователя
// ---------------------------------------------------------------------------

interface ListDocumentsParams {
  prisma: PrismaClient;
  userId: string;
  limit: number;
  offset: number;
}

interface ListDocumentsResult {
  documents: Pick<Document, 'id' | 'filename' | 'fileType' | 'createdAt'>[];
  total: number;
}

/**
 * Возвращает список документов пользователя (без contentText).
 * Отсортировано по дате создания (новые первыми).
 */
export async function listDocuments(
  params: ListDocumentsParams,
): Promise<ListDocumentsResult> {
  const { prisma, userId, limit, offset } = params;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where: { userId },
      select: {
        id: true,
        filename: true,
        fileType: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.document.count({ where: { userId } }),
  ]);

  return { documents, total };
}

// ---------------------------------------------------------------------------
// Получить документ по ID
// ---------------------------------------------------------------------------

/**
 * Возвращает полную запись документа, включая contentText.
 * Проверяет принадлежность пользователю.
 *
 * @returns null — если документ не найден или принадлежит другому пользователю.
 */
export async function getDocument(
  prisma: PrismaClient,
  documentId: string,
  userId: string,
): Promise<Document | null> {
  return prisma.document.findFirst({
    where: { id: documentId, userId },
  });
}

// ---------------------------------------------------------------------------
// Удалить документ
// ---------------------------------------------------------------------------

/**
 * Удаляет документ из MinIO и из БД.
 * Проверяет принадлежность пользователю.
 *
 * @returns true — если документ удалён, false — если не найден.
 */
export async function deleteDocument(
  prisma: PrismaClient,
  minio: MinioClient,
  bucket: string,
  documentId: string,
  userId: string,
): Promise<boolean> {
  // Сначала ищем документ — проверяем владельца
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId },
  });

  if (!document) {
    return false;
  }

  // Удаляем файл из MinIO
  await minio.removeObject(bucket, document.filePath);

  // Удаляем запись из БД
  await prisma.document.delete({ where: { id: documentId } });

  return true;
}

// ---------------------------------------------------------------------------
// Промпт по умолчанию для комплексного анализа документа
// ---------------------------------------------------------------------------

const DEFAULT_ANALYSIS_PROMPT = `Выполни комплексный анализ документа:

1. **Краткое резюме** — о чём документ, кто стороны, предмет.
2. **Ключевые условия** — сроки, суммы, обязательства сторон, порядок расчётов.
3. **Потенциальные риски** — невыгодные условия, пробелы, несоответствия законодательству РФ.
4. **Соответствие законодательству** — ссылки на применимые нормативные акты (ГК РФ, ТК РФ и т.д.).
5. **Рекомендации** — что доработать, на что обратить внимание.`;

// ---------------------------------------------------------------------------
// Константы Map-Reduce
// ---------------------------------------------------------------------------

/** Порог длины текста (символы), выше которого включается map-reduce. */
const MAP_REDUCE_THRESHOLD = 30_000;

/** Целевой размер чанка (символы). */
const CHUNK_TARGET_SIZE = 8_000;

/** Перекрытие между чанками (символы). */
const CHUNK_OVERLAP = 500;

// ---------------------------------------------------------------------------
// Разбивка текста на чанки
// ---------------------------------------------------------------------------

/**
 * Разбивает текст на чанки ~CHUNK_TARGET_SIZE символов с перекрытием ~CHUNK_OVERLAP.
 * Старается не разрывать абзацы; если абзац длиннее порога — разбивает по предложениям.
 */
export function splitTextIntoChunks(text: string): string[] {
  // Разбиваем на абзацы
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];

  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // Если один абзац длиннее порога — разбиваем по предложениям
    if (paragraph.length > CHUNK_TARGET_SIZE) {
      // Сначала сохраняем накопленное
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      const sentences = paragraph.split(/(?<=\. )/);
      let sentenceChunk = '';

      for (const sentence of sentences) {
        if (sentenceChunk.length + sentence.length > CHUNK_TARGET_SIZE && sentenceChunk.length > 0) {
          chunks.push(sentenceChunk.trim());
          // Перекрытие: берём конец предыдущего чанка
          sentenceChunk = sentenceChunk.slice(-CHUNK_OVERLAP) + sentence;
        } else {
          sentenceChunk += sentence;
        }
      }

      if (sentenceChunk.length > 0) {
        currentChunk = sentenceChunk;
      }

      continue;
    }

    // Обычный абзац — проверяем, влезает ли в текущий чанк
    const separator = currentChunk.length > 0 ? '\n\n' : '';
    if (currentChunk.length + separator.length + paragraph.length > CHUNK_TARGET_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Перекрытие: берём конец предыдущего чанка
      const overlap = currentChunk.slice(-CHUNK_OVERLAP);
      currentChunk = overlap + '\n\n' + paragraph;
    } else {
      currentChunk += separator + paragraph;
    }
  }

  // Остаток
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Анализ документа (стриминг) — прямой вызов для коротких документов
// ---------------------------------------------------------------------------

interface AnalyzeDocumentParams {
  document: Document;
  /** Кастомный промпт пользователя. Если не задан — используется DEFAULT_ANALYSIS_PROMPT. */
  userPrompt?: string;
}

/**
 * Формирует промпт для анализа документа и возвращает async-генератор
 * с токенами ответа LLM. Вызывающий код стримит токены клиенту через SSE.
 */
export function analyzeDocument(
  params: AnalyzeDocumentParams,
): AsyncGenerator<string> {
  const { document, userPrompt } = params;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    getSystemMessage(),
    {
      role: 'user',
      content: `Проанализируй следующий юридический документ.

Файл: ${document.filename} (${document.fileType})

Текст документа:
---
${document.contentText}
---

${userPrompt || DEFAULT_ANALYSIS_PROMPT}`,
    },
  ];

  return streamChat(messages);
}

// ---------------------------------------------------------------------------
// Map-Reduce анализ документа (SSE-стриминг)
// ---------------------------------------------------------------------------

/** Тип SSE-события, отправляемого клиенту при map-reduce анализе. */
export type AnalysisEvent =
  | { type: 'analysis_start'; documentId: string; strategy: 'direct' | 'map-reduce'; totalChunks?: number }
  | { type: 'chunk_progress'; chunk: number; total: number }
  | { type: 'chunk_done'; chunk: number; total: number }
  | { type: 'reduce_start' }
  | { type: 'token'; content: string }
  | { type: 'analysis_end'; content: string }
  | { type: 'error'; error: string };

interface AnalyzeDocumentMapReduceParams {
  document: Document;
  userPrompt?: string;
  /** Колбэк для отправки SSE-событий клиенту. */
  sendEvent: (event: AnalysisEvent) => void;
}

/**
 * Анализирует документ через LLM.
 *
 * Для коротких документов (≤ 30K символов) — прямой стриминг (один вызов LLM).
 * Для длинных — map-reduce: разбивка на чанки, последовательный анализ каждого,
 * затем стриминговый синтез итогового заключения.
 */
export async function analyzeDocumentMapReduce(
  params: AnalyzeDocumentMapReduceParams,
): Promise<string> {
  const { document, userPrompt, sendEvent } = params;
  const contentText = document.contentText ?? '';

  // Короткий документ — прямой анализ
  if (contentText.length <= MAP_REDUCE_THRESHOLD) {
    sendEvent({ type: 'analysis_start', documentId: document.id, strategy: 'direct' });

    const stream = analyzeDocument({ document, userPrompt });
    let fullContent = '';

    for await (const token of stream) {
      fullContent += token;
      sendEvent({ type: 'token', content: token });
    }

    sendEvent({ type: 'analysis_end', content: fullContent });
    return fullContent;
  }

  // Длинный документ — map-reduce
  const chunks = splitTextIntoChunks(contentText);
  const totalChunks = chunks.length;

  sendEvent({
    type: 'analysis_start',
    documentId: document.id,
    strategy: 'map-reduce',
    totalChunks,
  });

  // --- Map-фаза: последовательный анализ каждого чанка ---
  const chunkAnalyses: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunkIndex = i + 1;
    sendEvent({ type: 'chunk_progress', chunk: chunkIndex, total: totalChunks });

    const chunkMessages: OpenAI.ChatCompletionMessageParam[] = [
      getSystemMessage(),
      {
        role: 'user',
        content: `Проанализируй фрагмент юридического документа "${document.filename}" (часть ${chunkIndex}/${totalChunks}).

Фрагмент:
---
${chunks[i]}
---

Выдели из этого фрагмента:
1. Ключевые условия (сроки, суммы, обязательства)
2. Потенциальные риски
3. Ссылки на нормативные акты (если упоминаются)
4. Важные определения и термины

Отвечай кратко и структурированно.`,
      },
    ];

    const analysis = await chat(chunkMessages);
    chunkAnalyses.push(analysis);

    sendEvent({ type: 'chunk_done', chunk: chunkIndex, total: totalChunks });
  }

  // --- Reduce-фаза: синтез итогового заключения (стриминг) ---
  sendEvent({ type: 'reduce_start' });

  const reducePrompt = userPrompt || `Составь комплексный анализ:
1. **Краткое резюме** — о чём документ, стороны, предмет
2. **Ключевые условия** — сроки, суммы, обязательства, порядок расчётов
3. **Потенциальные риски** — невыгодные условия, пробелы, несоответствия
4. **Соответствие законодательству** — ссылки на нормативные акты РФ
5. **Рекомендации** — что доработать`;

  const reduceMessages: OpenAI.ChatCompletionMessageParam[] = [
    getSystemMessage(),
    {
      role: 'user',
      content: `На основе анализа ${totalChunks} фрагментов документа "${document.filename}" составь итоговое заключение.

Промежуточные анализы:
---
${chunkAnalyses.join('\n\n---\n\n')}
---

${reducePrompt}`,
    },
  ];

  const reduceStream = streamChat(reduceMessages);
  let fullContent = '';

  for await (const token of reduceStream) {
    fullContent += token;
    sendEvent({ type: 'token', content: token });
  }

  sendEvent({ type: 'analysis_end', content: fullContent });
  return fullContent;
}

// ---------------------------------------------------------------------------
// Краткое резюме документа (синхронный ответ)
// ---------------------------------------------------------------------------

interface SummarizeDocumentParams {
  document: Document;
}

/**
 * Генерирует краткое резюме документа (3-5 предложений) через LLM.
 * Не-стриминговый вызов — возвращает готовый текст.
 */
export async function summarizeDocument(
  params: SummarizeDocumentParams,
): Promise<string> {
  const { document } = params;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    getSystemMessage(),
    {
      role: 'user',
      content: `Составь краткое резюме документа "${document.filename}" в 3-5 предложениях.

Текст документа:
---
${document.contentText}
---`,
    },
  ];

  return chat(messages);
}
