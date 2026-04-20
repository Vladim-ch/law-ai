/**
 * Роуты шаблонов юридических документов.
 *
 * Prefix: /templates
 * Все эндпоинты защищены JWT (onRequest: [app.authenticate]).
 *
 * Эндпоинты:
 *   GET    /templates            — список шаблонов
 *   GET    /templates/:id        — детали шаблона
 *   POST   /templates            — создать шаблон (ADMIN/LAWYER)
 *   DELETE /templates/:id        — удалить шаблон (создатель/ADMIN)
 *   POST   /templates/:id/generate      — заполнить шаблон → текст
 *   POST   /templates/:id/generate/docx — заполнить шаблон → .docx
 *   POST   /templates/:id/generate/ai   — LLM-доработка (SSE)
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  listTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  fillTemplate,
  validateRequiredParams,
  mergeWithDefaults,
  generateDocx,
  generateWithLLM,
  extractTemplateFromDocument,
  extractTemplateFromFile,
  type TemplateParameter,
} from '../services/template.js';
import { chat } from '../lib/llm.js';
import { isAllowedFileType, ALLOWED_FILE_TYPES } from '../services/document.js';

// ---------------------------------------------------------------------------
// Zod-схемы
// ---------------------------------------------------------------------------

/** UUID-параметр маршрута. */
const templateParamsSchema = z.object({
  id: z.uuid('Некорректный формат UUID'),
});

/** Query-параметры списка шаблонов. */
const listQuerySchema = z.object({
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Ответ при ошибке. */
const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

/** Тело запроса для заполнения шаблона. */
const generateBodySchema = z.object({
  params: z.record(z.string(), z.string()),
});

/** Тело запроса для LLM-доработки. */
const generateAiBodySchema = z.object({
  params: z.record(z.string(), z.string()),
  prompt: z.string().max(32_000).optional(),
});

/** Описание параметра шаблона. */
const templateParameterSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['string', 'date', 'text']),
  required: z.boolean(),
  default: z.string().optional(),
});

/** Тело запроса для создания шаблона. */
const createTemplateBodySchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(100),
  templateBody: z.string().min(1),
  parameters: z.array(templateParameterSchema),
});

// ---------------------------------------------------------------------------
// Плагин роутов
// ---------------------------------------------------------------------------

const templateRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // =========================================================================
  // GET /templates — Список шаблонов
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/templates',
    schema: {
      description: 'Список доступных шаблонов документов',
      tags: ['templates'],
      querystring: listQuerySchema,
      response: {
        200: z.object({
          templates: z.array(z.object({
            id: z.string(),
            name: z.string(),
            category: z.string(),
            parameters: z.any(),
            createdAt: z.date(),
          })),
          total: z.number(),
        }),
        401: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { category, limit, offset } = request.query;

      const result = await listTemplates(app.prisma, { category, limit, offset });

      return reply.status(200).send({
        templates: result.templates.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          parameters: t.parameters,
          createdAt: t.createdAt,
        })),
        total: result.total,
      });
    },
  });

  // =========================================================================
  // GET /templates/:id — Детали шаблона
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/templates/:id',
    schema: {
      description: 'Получить полную информацию о шаблоне',
      tags: ['templates'],
      params: templateParamsSchema,
      response: {
        200: z.object({
          template: z.object({
            id: z.string(),
            name: z.string(),
            category: z.string(),
            templateBody: z.string(),
            parameters: z.any(),
            createdAt: z.date(),
          }),
        }),
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params;

      const template = await getTemplate(app.prisma, id);

      if (!template) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Шаблон не найден',
        });
      }

      return reply.status(200).send({
        template: {
          id: template.id,
          name: template.name,
          category: template.category,
          templateBody: template.templateBody,
          parameters: template.parameters,
          createdAt: template.createdAt,
        },
      });
    },
  });

  // =========================================================================
  // POST /templates/:id/generate — Заполнить шаблон (текст)
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/templates/:id/generate',
    schema: {
      description: 'Заполнить шаблон параметрами и получить текст',
      tags: ['templates'],
      params: templateParamsSchema,
      body: generateBodySchema,
      response: {
        200: z.object({
          filledText: z.string(),
          missingParams: z.array(z.string()),
        }),
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params;
      const { params: userParams } = request.body;

      const template = await getTemplate(app.prisma, id);

      if (!template) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Шаблон не найден',
        });
      }

      const templateParams = template.parameters as unknown as TemplateParameter[];
      const missingParams = validateRequiredParams(templateParams, userParams);

      // Подставляем default-значения
      const merged = mergeWithDefaults(templateParams, userParams);
      const filledText = fillTemplate(template.templateBody, merged);

      return reply.status(200).send({ filledText, missingParams });
    },
  });

  // =========================================================================
  // POST /templates/:id/generate/docx — Заполнить шаблон и скачать .docx
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/templates/:id/generate/docx',
    schema: {
      description: 'Заполнить шаблон и скачать как .docx',
      tags: ['templates'],
      params: templateParamsSchema,
      body: generateBodySchema,
      // Без response-схемы — стримим бинарный файл
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params;
      const { params: userParams } = request.body;

      const template = await getTemplate(app.prisma, id);

      if (!template) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Шаблон не найден',
        });
      }

      const templateParams = template.parameters as unknown as TemplateParameter[];
      const missingParams = validateRequiredParams(templateParams, userParams);

      if (missingParams.length > 0) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: `Не заполнены обязательные параметры: ${missingParams.join(', ')}`,
        });
      }

      const merged = mergeWithDefaults(templateParams, userParams);
      const filledText = fillTemplate(template.templateBody, merged);

      const buffer = await generateDocx(filledText, template.name);

      // Формируем имя файла: название шаблона + дата
      const dateStr = new Date().toISOString().slice(0, 10);
      const safeTemplateName = template.name.replace(/[^a-zA-Zа-яА-ЯёЁ0-9 _-]/g, '');
      const filename = `${safeTemplateName}_${dateStr}.docx`;
      const encodedFilename = encodeURIComponent(filename);

      return reply
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
        .header(
          'Content-Disposition',
          `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        )
        .header('Content-Length', buffer.length)
        .send(buffer);
    },
  });

  // =========================================================================
  // POST /templates/:id/generate/ai — LLM-доработка (SSE-стриминг)
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/templates/:id/generate/ai',
    schema: {
      description: 'Заполнить шаблон и доработать через LLM (SSE-стриминг)',
      tags: ['templates'],
      params: templateParamsSchema,
      body: generateAiBodySchema,
      // Без response-схемы — reply.raw обходит сериализацию Fastify
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params;
      const { params: userParams, prompt: userPrompt } = request.body;

      try {
        const template = await getTemplate(app.prisma, id);

        if (!template) {
          return reply.status(404).send({
            error: 'NotFound',
            message: 'Шаблон не найден',
          });
        }

        const templateParams = template.parameters as unknown as TemplateParameter[];
        const missingParams = validateRequiredParams(templateParams, userParams);

        if (missingParams.length > 0) {
          return reply.status(400).send({
            error: 'BadRequest',
            message: `Не заполнены обязательные параметры: ${missingParams.join(', ')}`,
          });
        }

        const merged = mergeWithDefaults(templateParams, userParams);
        const filledText = fillTemplate(template.templateBody, merged);

        // SSE-заголовки. CORS добавляем вручную, т.к. reply.raw обходит Fastify-плагины.
        const origin = request.headers.origin || '*';
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        });

        const stream = generateWithLLM(filledText, userPrompt);
        let fullContent = '';

        for await (const token of stream) {
          fullContent += token;
          reply.raw.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
        }

        // Финальное событие
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'message_end', content: fullContent })}\n\n`,
        );
      } catch (error) {
        // Если заголовки ещё не отправлены — обычная ошибка
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

        // Заголовки отправлены — ошибка через SSE
        request.log.error({ err: error }, 'Ошибка SSE-стриминга генерации по шаблону');
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'error', error: 'Произошла ошибка при генерации документа' })}\n\n`,
        );
      }

      reply.raw.end();
      return reply;
    },
  });

  // =========================================================================
  // POST /templates/from-document — Извлечь шаблон из загруженного документа
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/templates/from-document',
    schema: {
      description: 'Извлечь шаблон из загруженного документа через LLM (не сохраняет)',
      tags: ['templates'],
      body: z.object({
        documentId: z.uuid('Некорректный формат UUID'),
      }),
      response: {
        200: z.object({
          parameters: z.array(z.object({
            key: z.string(),
            label: z.string(),
            type: z.enum(['string', 'date', 'text']),
            value: z.string(),
            required: z.boolean(),
          })),
          templateBody: z.string(),
          originalText: z.string(),
        }),
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { documentId } = request.body;

      try {
        const result = await extractTemplateFromDocument(
          app.prisma,
          chat,
          documentId,
          userId,
        );

        return reply.status(200).send({
          parameters: result.parameters,
          templateBody: result.templateBody,
          originalText: result.originalText,
        });
      } catch (error) {
        const err = error as Error & { statusCode?: number };
        request.log.error({ err: error }, 'Ошибка извлечения шаблона из документа');

        if (err.statusCode === 404) {
          return reply.status(404).send({
            error: 'NotFound',
            message: err.message,
          });
        }

        if (err.statusCode === 400) {
          return reply.status(400).send({
            error: 'BadRequest',
            message: err.message,
          });
        }

        return reply.status(500).send({
          error: 'InternalServerError',
          message: 'Не удалось извлечь шаблон из документа',
        });
      }
    },
  });

  // =========================================================================
  // POST /templates/from-file — Извлечь шаблон из загружаемого файла
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/templates/from-file',
    schema: {
      description: 'Извлечь шаблон из файла через LLM (multipart/form-data, не сохраняет)',
      tags: ['templates'],
      // Multipart — body-схема не задаётся
      response: {
        200: z.object({
          parameters: z.array(z.object({
            key: z.string(),
            label: z.string(),
            type: z.enum(['string', 'date', 'text']),
            value: z.string(),
            required: z.boolean(),
          })),
          templateBody: z.string(),
          originalText: z.string(),
        }),
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const file = await request.file();

      if (!file) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: 'Файл не передан. Используйте поле "file" в multipart/form-data.',
        });
      }

      // Извлекаем расширение из имени файла
      const originalFilename = file.filename;
      const extMatch = originalFilename.match(/\.([^.]+)$/);
      const fileType = extMatch?.[1]?.toLowerCase() ?? '';

      if (!isAllowedFileType(fileType)) {
        return reply.status(400).send({
          error: 'BadRequest',
          message: `Неподдерживаемый формат файла: .${fileType}. Допустимые: ${ALLOWED_FILE_TYPES.join(', ')}`,
        });
      }

      const buffer = await file.toBuffer();

      try {
        const result = await extractTemplateFromFile(
          chat,
          buffer,
          fileType,
          originalFilename,
        );

        return reply.status(200).send({
          parameters: result.parameters,
          templateBody: result.templateBody,
          originalText: result.originalText,
        });
      } catch (error) {
        const err = error as Error & { statusCode?: number };
        request.log.error({ err: error }, 'Ошибка извлечения шаблона из файла');

        if (err.statusCode === 400) {
          return reply.status(400).send({
            error: 'BadRequest',
            message: err.message,
          });
        }

        return reply.status(500).send({
          error: 'InternalServerError',
          message: 'Не удалось извлечь шаблон из файла',
        });
      }
    },
  });

  // =========================================================================
  // POST /templates — Создать новый шаблон (ADMIN / LAWYER)
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/templates',
    schema: {
      description: 'Создать пользовательский шаблон документа',
      tags: ['templates'],
      body: createTemplateBodySchema,
      response: {
        201: z.object({
          template: z.object({
            id: z.string(),
            name: z.string(),
            category: z.string(),
            createdAt: z.date(),
          }),
        }),
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId, role } = request.user;

      // Только ADMIN или LAWYER могут создавать шаблоны
      if (role !== 'ADMIN' && role !== 'LAWYER') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Создание шаблонов доступно только администраторам и юристам',
        });
      }

      const { name, category, templateBody, parameters } = request.body;

      const template = await createTemplate(app.prisma, {
        name,
        category,
        templateBody,
        parameters,
        createdById: userId,
      });

      return reply.status(201).send({
        template: {
          id: template.id,
          name: template.name,
          category: template.category,
          createdAt: template.createdAt,
        },
      });
    },
  });

  // =========================================================================
  // DELETE /templates/:id — Удалить шаблон
  // =========================================================================
  app.route({
    method: 'DELETE',
    url: '/templates/:id',
    schema: {
      description: 'Удалить шаблон (только создатель или ADMIN)',
      tags: ['templates'],
      params: templateParamsSchema,
      response: {
        204: z.undefined(),
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId, role } = request.user;
      const { id } = request.params;

      const deleted = await deleteTemplate(app.prisma, id, userId, role);

      if (!deleted) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Шаблон не найден или нет прав на удаление',
        });
      }

      return reply.status(204).send();
    },
  });
};

export default templateRoutes;
