/**
 * Роуты нормативных актов: список, поиск, импорт.
 *
 * Prefix: /laws
 * Все эндпоинты защищены JWT. POST /laws/import доступен только ADMIN.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { importLaw, indexLaw, listLaws, searchLaws, searchLawsText } from '../services/law.js';
import { parseDocumentText, ALLOWED_FILE_TYPES, isAllowedFileType } from '../services/document.js';

// ---------------------------------------------------------------------------
// Zod-схемы
// ---------------------------------------------------------------------------

/** Краткое представление закона в списке. */
const lawListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  fullName: z.string(),
  category: z.string(),
  chunksCount: z.number(),
});

/** Ответ со списком законов. */
const lawsListResponseSchema = z.object({
  laws: z.array(lawListItemSchema),
});

/** Результат семантического поиска. */
const searchResultSchema = z.object({
  content: z.string(),
  metadata: z.unknown(),
  similarity: z.number(),
});

/** Ответ с результатами поиска. */
const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
});

/** Query-параметры поиска. */
const searchQuerySchema = z.object({
  query: z.string().min(1, 'Поисковый запрос обязателен'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Тело запроса на импорт закона. */
const importBodySchema = z.object({
  name: z.string().min(1, 'Название обязательно'),
  fullName: z.string().min(1, 'Полное название обязательно'),
  category: z.string().min(1, 'Категория обязательна'),
  content: z.string().min(1, 'Текст закона обязателен'),
});

/** Ответ после импорта. */
const importResponseSchema = z.object({
  law: lawListItemSchema,
  chunksCount: z.number(),
});

/** Ответ при ошибке. */
const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Плагин роутов
// ---------------------------------------------------------------------------

const lawRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // =========================================================================
  // GET /laws — список всех нормативных актов
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/laws',
    schema: {
      description: 'Список всех загруженных нормативных актов',
      tags: ['laws'],
      response: {
        200: lawsListResponseSchema,
        401: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (_request, reply) => {
      const laws = await listLaws(app.prisma);

      return reply.status(200).send({
        laws: laws.map((law) => ({
          id: law.id,
          name: law.name,
          fullName: law.fullName,
          category: law.category,
          chunksCount: law.chunksCount,
        })),
      });
    },
  });

  // =========================================================================
  // GET /laws/search — семантический поиск по чанкам НПА
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/laws/search',
    schema: {
      description: 'Семантический поиск по нормативным актам',
      tags: ['laws'],
      querystring: searchQuerySchema,
      response: {
        200: searchResponseSchema,
        401: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { query, limit } = request.query;

      const results = await searchLaws(app.prisma, query, limit);

      return reply.status(200).send({
        results: results.map((r) => ({
          content: r.content,
          metadata: r.metadata,
          similarity: r.similarity,
        })),
      });
    },
  });

  // =========================================================================
  // GET /laws/search/text — полнотекстовый поиск (pg_trgm, без эмбеддингов)
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/laws/search/text',
    schema: {
      description: 'Полнотекстовый поиск по НПА через pg_trgm (без эмбеддингов). Для точных запросов: "Статья 196", номера документов.',
      tags: ['laws'],
      querystring: searchQuerySchema,
      response: {
        200: searchResponseSchema,
        401: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { query, limit } = request.query;

      const results = await searchLawsText(app.prisma, query, limit);

      return reply.status(200).send({
        results: results.map((r) => ({
          content: r.content,
          metadata: r.metadata,
          similarity: r.similarity,
        })),
      });
    },
  });

  // =========================================================================
  // GET /chunks/:id/neighbors — чанк + соседние (chunkIndex ± range)
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/chunks/:id/neighbors',
    schema: {
      description: 'Возвращает чанк и его соседей по chunkIndex (± range) в рамках одного источника',
      tags: ['laws'],
      params: z.object({
        id: z.string().uuid('Некорректный UUID чанка'),
      }),
      querystring: z.object({
        range: z.coerce.number().int().min(1).max(10).default(2),
      }),
      response: {
        200: z.object({
          chunks: z.array(z.object({
            chunkIndex: z.number(),
            content: z.string(),
          })),
          source: z.object({
            type: z.string(),
            id: z.string(),
            name: z.string(),
          }),
        }),
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params;
      const { range } = request.query;

      // Находим запрошенный чанк
      const chunk = await app.prisma.$queryRaw<
        { sourceType: string; sourceId: string; chunkIndex: number }[]
      >`
        SELECT source_type AS "sourceType", source_id AS "sourceId", chunk_index AS "chunkIndex"
        FROM chunks
        WHERE id = ${id}::uuid
        LIMIT 1
      `;

      if (chunk.length === 0) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Чанк не найден',
        });
      }

      const { sourceType, sourceId, chunkIndex } = chunk[0]!;
      const minIndex = chunkIndex - range;
      const maxIndex = chunkIndex + range;

      // Загружаем соседние чанки в диапазоне [chunkIndex - range, chunkIndex + range]
      const neighbors = await app.prisma.$queryRaw<
        { chunkIndex: number; content: string }[]
      >`
        SELECT chunk_index AS "chunkIndex", content
        FROM chunks
        WHERE source_id = ${sourceId}::uuid
          AND source_type = ${sourceType}
          AND chunk_index >= ${minIndex}
          AND chunk_index <= ${maxIndex}
        ORDER BY chunk_index ASC
      `;

      // Определяем название источника из метаданных или БД
      let sourceName = 'Неизвестный источник';
      if (sourceType === 'law') {
        const law = await app.prisma.law.findUnique({
          where: { id: sourceId },
          select: { name: true },
        });
        if (law) sourceName = law.name;
      }

      return reply.status(200).send({
        chunks: neighbors.map((n) => ({
          chunkIndex: n.chunkIndex,
          content: n.content,
        })),
        source: {
          type: sourceType,
          id: sourceId,
          name: sourceName,
        },
      });
    },
  });

  // =========================================================================
  // POST /laws/import — импорт нормативного акта (только ADMIN)
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/laws/import',
    schema: {
      description: 'Импорт нормативного акта с индексацией (только ADMIN)',
      tags: ['laws'],
      body: importBodySchema,
      response: {
        201: importResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      // TODO: Фаза 4 — ограничить импорт ролью ADMIN.
      // Пока доступно всем авторизованным (юристы загружают сами).

      const { name, fullName, category, content } = request.body;

      // Создаём/обновляем запись
      const law = await importLaw(app.prisma, { name, fullName, category, content });

      // Индексируем для RAG-поиска
      const chunksCount = await indexLaw(app.prisma, law.id);

      return reply.status(201).send({
        law: {
          id: law.id,
          name: law.name,
          fullName: law.fullName,
          category: law.category,
          chunksCount,
        },
        chunksCount,
      });
    },
  });
  // =========================================================================
  // POST /laws/import/file — импорт из файла .docx/.pdf/.txt/.rtf (ADMIN)
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/laws/import/file',
    schema: {
      description: 'Импорт нормативного акта из файла (multipart/form-data, только ADMIN)',
      tags: ['laws'],
      // Multipart — body-схема не задаётся
      response: {
        201: importResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      // TODO: Фаза 4 — ограничить импорт ролью ADMIN.

      // Читаем multipart: файл + поля name, fullName, category
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'Файл не передан. Используйте multipart/form-data с полем "file".',
        });
      }

      const fileType = data.filename.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? '';

      if (!isAllowedFileType(fileType)) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: `Неподдерживаемый формат: .${fileType}. Допустимые: ${ALLOWED_FILE_TYPES.join(', ')}`,
        });
      }

      const buffer = await data.toBuffer();

      // Извлекаем текст из файла
      const content = await parseDocumentText(buffer, fileType);

      // Читаем поля формы из data.fields
      const name = (data.fields.name as { value: string })?.value;
      const fullName = (data.fields.fullName as { value: string })?.value;
      const category = (data.fields.category as { value: string })?.value || 'codex';

      if (!name || !fullName) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'Поля "name" и "fullName" обязательны',
        });
      }

      // Создаём/обновляем запись + индексируем
      const law = await importLaw(app.prisma, { name, fullName, category, content });
      const chunksCount = await indexLaw(app.prisma, law.id);

      return reply.status(201).send({
        law: {
          id: law.id,
          name: law.name,
          fullName: law.fullName,
          category: law.category,
          chunksCount,
        },
        chunksCount,
      });
    },
  });
};

export default lawRoutes;
