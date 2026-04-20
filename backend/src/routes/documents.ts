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
  analyzeDocumentMapReduce,
  summarizeDocument,
  type AnalysisEvent,
} from '../services/document.js';
import {
  compareDocuments,
  analyzeComparison,
} from '../services/compare.js';

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

// ---------------------------------------------------------------------------
// Zod-схемы: сравнение документов
// ---------------------------------------------------------------------------

/** Тело запроса на сравнение двух документов. */
const compareBodySchema = z.object({
  documentIdA: z.uuid('Некорректный формат UUID документа A'),
  documentIdB: z.uuid('Некорректный формат UUID документа B'),
});

/** Тело запроса на LLM-анализ сравнения. */
const compareAnalyzeBodySchema = z.object({
  documentIdA: z.uuid('Некорректный формат UUID документа A'),
  documentIdB: z.uuid('Некорректный формат UUID документа B'),
  prompt: z.string().max(32_000).optional(),
});

/** Элемент пословного diff. */
const inlineDiffSchema = z.object({
  type: z.enum(['equal', 'added', 'removed']),
  text: z.string(),
});

/** Совпавший абзац. */
const matchedParagraphSchema = z.object({
  indexA: z.number(),
  indexB: z.number(),
  text: z.string(),
  moved: z.boolean(),
});

/** Изменённый абзац. */
const modifiedParagraphSchema = z.object({
  indexA: z.number(),
  indexB: z.number(),
  textA: z.string(),
  textB: z.string(),
  similarity: z.number(),
  inlineDiff: z.array(inlineDiffSchema),
});

/** Статистика сравнения. */
const compareStatsSchema = z.object({
  total: z.number(),
  matched: z.number(),
  modified: z.number(),
  added: z.number(),
  removed: z.number(),
});

/** Полный результат сравнения. */
const compareResultSchema = z.object({
  matched: z.array(matchedParagraphSchema),
  modified: z.array(modifiedParagraphSchema),
  addedInB: z.array(z.string()),
  removedFromA: z.array(z.string()),
  movedCount: z.number(),
  stats: compareStatsSchema,
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
          // Полный текст — фронт использует его для контекста LLM
          contentText: document.contentText,
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
  // =========================================================================
  // POST /documents/:id/analyze — Анализ документа через LLM (SSE-стриминг)
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/documents/:id/analyze',
    schema: {
      description: 'Анализ документа через LLM с SSE-стримингом ответа',
      tags: ['documents'],
      params: documentParamsSchema,
      body: z.object({
        prompt: z.string().max(32_000).optional(),
      }),
      // Без response-схемы — reply.raw обходит сериализацию Fastify
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params;
      const { prompt: userPrompt } = request.body;

      // Хелпер для отправки SSE-событий
      const sendEvent = (data: AnalysisEvent) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        // Получаем документ с проверкой принадлежности пользователю
        const document = await getDocument(app.prisma, id, userId);

        if (!document) {
          return reply.status(404).send({
            error: 'NotFound',
            message: 'Документ не найден',
          });
        }

        // Проверяем наличие извлечённого текста
        if (!document.contentText) {
          return reply.status(400).send({
            error: 'BadRequest',
            message: 'Текст документа не извлечён',
          });
        }

        // Настраиваем SSE-заголовки.
        // CORS-заголовки добавляем вручную, т.к. reply.raw обходит Fastify-плагины.
        const origin = request.headers.origin || '*';
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        });

        // Map-Reduce анализ (автоматически выбирает стратегию по длине текста)
        await analyzeDocumentMapReduce({
          document,
          userPrompt,
          sendEvent,
        });
      } catch (error) {
        // Если заголовки ещё не отправлены — можно вернуть обычную ошибку
        if (!reply.raw.headersSent) {
          const statusCode =
            (error as Error & { statusCode?: number }).statusCode ?? 500;
          const message =
            statusCode >= 500
              ? 'Внутренняя ошибка сервера'
              : (error as Error).message;

          reply.raw.writeHead(statusCode, {
            'Content-Type': 'application/json',
          });
          reply.raw.write(
            JSON.stringify({
              error: statusCode >= 500 ? 'InternalServerError' : 'Error',
              message,
            }),
          );
          reply.raw.end();
          return reply;
        }

        // Заголовки уже отправлены — ошибку можно передать только через SSE
        request.log.error({ err: error }, 'Ошибка во время SSE-стриминга анализа документа');
        sendEvent({
          type: 'error',
          error: 'Произошла ошибка при анализе документа',
        });
      }

      reply.raw.end();
      return reply;
    },
  });

  // =========================================================================
  // POST /documents/:id/summarize — Краткое резюме документа (JSON-ответ)
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/documents/:id/summarize',
    schema: {
      description: 'Получить краткое резюме документа (3-5 предложений)',
      tags: ['documents'],
      params: documentParamsSchema,
      response: {
        200: z.object({ summary: z.string() }),
        400: errorResponseSchema,
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

      if (!document.contentText) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'Текст документа не извлечён',
        });
      }

      const summary = await summarizeDocument({ document });

      return reply.status(200).send({ summary });
    },
  });

  // =========================================================================
  // POST /documents/compare — Структурный diff двух документов
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/documents/compare',
    schema: {
      description: 'Семантическое сравнение двух документов (структурный diff)',
      tags: ['documents'],
      body: compareBodySchema,
      response: {
        200: z.object({ result: compareResultSchema }),
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { documentIdA, documentIdB } = request.body;

      try {
        const result = await compareDocuments(
          app.prisma,
          documentIdA,
          documentIdB,
          userId,
        );

        return reply.status(200).send({ result });
      } catch (error) {
        const rawCode =
          (error as Error & { statusCode?: number }).statusCode ?? 500;

        if (rawCode === 404) {
          return reply.status(404).send({
            error: 'NotFound',
            message: (error as Error).message,
          });
        }

        return reply.status(400).send({
          error: 'BadRequest',
          message: rawCode >= 500 ? 'Внутренняя ошибка сервера' : (error as Error).message,
        });
      }
    },
  });

  // =========================================================================
  // POST /documents/compare/analyze — LLM-анализ отличий (SSE)
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/documents/compare/analyze',
    schema: {
      description: 'LLM-анализ отличий двух документов с SSE-стримингом ответа',
      tags: ['documents'],
      body: compareAnalyzeBodySchema,
      // Без response-схемы — reply.raw обходит сериализацию Fastify
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { documentIdA, documentIdB, prompt } = request.body;

      // Хелпер для отправки SSE-событий
      const sendEvent = (data: Record<string, unknown>) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        // Настраиваем SSE-заголовки.
        // CORS-заголовки добавляем вручную, т.к. reply.raw обходит Fastify-плагины.
        const origin = request.headers.origin || '*';
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        });

        // Стримим LLM-анализ
        const stream = analyzeComparison(
          app.prisma,
          documentIdA,
          documentIdB,
          userId,
          prompt,
        );

        let fullContent = '';

        for await (const token of stream) {
          fullContent += token;
          sendEvent({ type: 'token', content: token });
        }

        sendEvent({ type: 'message_end', content: fullContent });
      } catch (error) {
        // Если заголовки ещё не отправлены — можно вернуть обычную ошибку
        if (!reply.raw.headersSent) {
          const statusCode =
            (error as Error & { statusCode?: number }).statusCode ?? 500;
          const message =
            statusCode >= 500
              ? 'Внутренняя ошибка сервера'
              : (error as Error).message;

          reply.raw.writeHead(statusCode, {
            'Content-Type': 'application/json',
          });
          reply.raw.write(
            JSON.stringify({
              error: statusCode >= 500 ? 'InternalServerError' : 'Error',
              message,
            }),
          );
          reply.raw.end();
          return reply;
        }

        // Заголовки уже отправлены — ошибку можно передать только через SSE
        request.log.error(
          { err: error },
          'Ошибка во время SSE-стриминга анализа сравнения',
        );
        sendEvent({
          type: 'error',
          error: 'Произошла ошибка при анализе сравнения документов',
        });
      }

      reply.raw.end();
      return reply;
    },
  });
};

export default documentRoutes;
