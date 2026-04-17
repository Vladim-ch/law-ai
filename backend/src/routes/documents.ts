/**
 * Роуты документов: загрузка, список, детали, скачивание, удаление.
 *
 * Prefix: /documents
 * Все эндпоинты защищены JWT (onRequest: [app.authenticate]).
 * Пользователь видит только свои документы.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../config/env.js';
import {
  ALLOWED_FILE_TYPES,
  isAllowedFileType,
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
} from '../services/document.js';

// ---------------------------------------------------------------------------
// Zod-схемы
// ---------------------------------------------------------------------------

/** UUID-параметр маршрута. */
const documentParamsSchema = z.object({
  id: z.uuid('Некорректный формат UUID'),
});

/** Query-параметры списка документов. */
const listDocumentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Ответ при ошибке. */
const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

/** Краткое представление документа в списке. */
const documentListItemSchema = z.object({
  id: z.string(),
  filename: z.string(),
  fileType: z.string(),
  createdAt: z.date(),
});

/** Полное представление документа. */
const documentDetailSchema = z.object({
  id: z.string(),
  filename: z.string(),
  fileType: z.string(),
  filePath: z.string(),
  contentText: z.string().nullable(),
  createdAt: z.date(),
});

// ---------------------------------------------------------------------------
// MIME-маппинг для Content-Type при скачивании
// ---------------------------------------------------------------------------

const DOWNLOAD_MIME_MAP: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  txt: 'text/plain',
  rtf: 'application/rtf',
};

// ---------------------------------------------------------------------------
// Плагин роутов
// ---------------------------------------------------------------------------

const documentRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // =========================================================================
  // POST /documents/upload — Загрузка файла
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/documents/upload',
    schema: {
      description: 'Загрузить юридический документ (multipart/form-data)',
      tags: ['documents'],
      // Multipart-запрос — body-схема не задаётся, файл читаем через request.file()
      response: {
        201: z.object({
          document: z.object({
            id: z.string(),
            filename: z.string(),
            fileType: z.string(),
            contentText: z.string().nullable(),
            createdAt: z.date(),
          }),
          parseError: z.string().nullable(),
        }),
        400: errorResponseSchema,
        401: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;

      // Читаем файл из multipart-запроса
      const file = await request.file();

      if (!file) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'Файл не передан. Используйте поле "file" в multipart/form-data.',
        });
      }

      // Извлекаем расширение из имени файла (не доверяем Content-Type от клиента)
      const originalFilename = file.filename;
      const extMatch = originalFilename.match(/\.([^.]+)$/);
      const fileType = extMatch?.[1]?.toLowerCase() ?? '';

      if (!isAllowedFileType(fileType)) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: `Неподдерживаемый формат файла: .${fileType}. Допустимые: ${ALLOWED_FILE_TYPES.join(', ')}`,
        });
      }

      // Читаем файл в буфер
      const buffer = await file.toBuffer();

      // Проверяем размер (дублируем проверку на уровне приложения)
      if (buffer.length > env.MAX_UPLOAD_SIZE) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: `Файл слишком большой. Максимальный размер: ${Math.round(env.MAX_UPLOAD_SIZE / 1024 / 1024)} МБ`,
        });
      }

      const result = await uploadDocument({
        prisma: app.prisma,
        minio: app.minio,
        bucket: env.MINIO_BUCKET_DOCUMENTS,
        userId,
        filename: originalFilename,
        buffer,
        fileType,
      });

      const { document, parseError } = result;

      return reply.status(201).send({
        document: {
          id: document.id,
          filename: document.filename,
          fileType: document.fileType,
          // Возвращаем первые 500 символов текста или null
          contentText: document.contentText
            ? document.contentText.slice(0, 500)
            : null,
          createdAt: document.createdAt,
        },
        parseError,
      });
    },
  });

  // =========================================================================
  // GET /documents — Список документов пользователя
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/documents',
    schema: {
      description: 'Список документов текущего пользователя',
      tags: ['documents'],
      querystring: listDocumentsQuerySchema,
      response: {
        200: z.object({
          documents: z.array(documentListItemSchema),
          total: z.number(),
        }),
        401: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { limit, offset } = request.query;

      const result = await listDocuments({
        prisma: app.prisma,
        userId,
        limit,
        offset,
      });

      return reply.status(200).send({
        documents: result.documents.map((d) => ({
          id: d.id,
          filename: d.filename,
          fileType: d.fileType,
          createdAt: d.createdAt,
        })),
        total: result.total,
      });
    },
  });

  // =========================================================================
  // GET /documents/:id — Детали документа
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/documents/:id',
    schema: {
      description: 'Получить полную информацию о документе',
      tags: ['documents'],
      params: documentParamsSchema,
      response: {
        200: z.object({ document: documentDetailSchema }),
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params;

      const document = await getDocument(app.prisma, id, userId);

      if (!document) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Документ не найден',
        });
      }

      return reply.status(200).send({
        document: {
          id: document.id,
          filename: document.filename,
          fileType: document.fileType,
          filePath: document.filePath,
          contentText: document.contentText,
          createdAt: document.createdAt,
        },
      });
    },
  });

  // =========================================================================
  // DELETE /documents/:id — Удалить документ
  // =========================================================================
  app.route({
    method: 'DELETE',
    url: '/documents/:id',
    schema: {
      description: 'Удалить документ из хранилища и БД',
      tags: ['documents'],
      params: documentParamsSchema,
      response: {
        204: z.undefined(),
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params;

      const deleted = await deleteDocument(
        app.prisma,
        app.minio,
        env.MINIO_BUCKET_DOCUMENTS,
        id,
        userId,
      );

      if (!deleted) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Документ не найден',
        });
      }

      return reply.status(204).send();
    },
  });

  // =========================================================================
  // GET /documents/:id/download — Скачать оригинал из MinIO
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/documents/:id/download',
    schema: {
      description: 'Скачать оригинальный файл документа',
      tags: ['documents'],
      params: documentParamsSchema,
      // Без response-схемы — стримим бинарный поток
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params;

      const document = await getDocument(app.prisma, id, userId);

      if (!document) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Документ не найден',
        });
      }

      // Получаем поток из MinIO
      const stream = await app.minio.getObject(
        env.MINIO_BUCKET_DOCUMENTS,
        document.filePath,
      );

      const contentType = DOWNLOAD_MIME_MAP[document.fileType] || 'application/octet-stream';

      // Экранируем имя файла для Content-Disposition (RFC 5987)
      const encodedFilename = encodeURIComponent(document.filename);

      return reply
        .header('Content-Type', contentType)
        .header(
          'Content-Disposition',
          `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        )
        .send(stream);
    },
  });
};

export default documentRoutes;
