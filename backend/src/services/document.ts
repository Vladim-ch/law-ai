/**
 * Сервис документов: парсинг, загрузка в MinIO, CRUD в БД.
 *
 * Поддерживаемые форматы: docx, pdf, txt, rtf.
 * Парсинг текста — best-effort: если извлечение не удалось,
 * документ сохраняется без contentText (не блокируем загрузку).
 */

import type { PrismaClient, Document } from '@prisma/client';
import type { Client as MinioClient } from 'minio';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

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
