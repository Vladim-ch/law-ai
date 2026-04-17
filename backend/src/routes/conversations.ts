/**
 * Роуты диалогов: CRUD + отправка сообщений с SSE-стримингом LLM.
 *
 * Prefix: /conversations
 * Все эндпоинты защищены JWT (onRequest: [app.authenticate]).
 * Пользователь видит только свои диалоги.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  createConversation,
  listConversations,
  getConversationWithMessages,
  sendMessage,
  deleteConversation,
} from '../services/conversation.js';

// ---------------------------------------------------------------------------
// Zod-схемы
// ---------------------------------------------------------------------------

/** UUID-параметр маршрута. */
const conversationParamsSchema = z.object({
  id: z.uuid('Некорректный формат UUID'),
});

/** Тело запроса на создание диалога. */
const createConversationBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
});

/** Query-параметры списка диалогов. */
const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Краткое представление диалога в ответе. */
const conversationResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Сообщение в ответе. */
const messageResponseSchema = z.object({
  id: z.string(),
  role: z.enum(['USER', 'ASSISTANT', 'SYSTEM']),
  content: z.string(),
  createdAt: z.date(),
});

/** Тело запроса на отправку сообщения. */
const sendMessageBodySchema = z.object({
  content: z.string().min(1, 'Сообщение не может быть пустым').max(32_000, 'Сообщение слишком длинное'),
  /** ID документа для загрузки в контекст LLM. Текст подгружается из БД, не передаётся клиентом. */
  documentId: z.uuid().optional(),
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

const conversationRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // =========================================================================
  // POST /conversations — Создать новый диалог
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/conversations',
    schema: {
      description: 'Создать новый диалог',
      tags: ['conversations'],
      body: createConversationBodySchema,
      response: {
        201: z.object({ conversation: conversationResponseSchema }),
        401: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { title } = request.body;

      const conversation = await createConversation(app.prisma, { userId, title });

      return reply.status(201).send({
        conversation: {
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        },
      });
    },
  });

  // =========================================================================
  // GET /conversations — Список диалогов пользователя
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/conversations',
    schema: {
      description: 'Список диалогов текущего пользователя',
      tags: ['conversations'],
      querystring: listConversationsQuerySchema,
      response: {
        200: z.object({
          conversations: z.array(conversationResponseSchema),
          total: z.number(),
        }),
        401: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { limit, offset } = request.query;

      const result = await listConversations(app.prisma, { userId, limit, offset });

      return reply.status(200).send({
        conversations: result.conversations.map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
        total: result.total,
      });
    },
  });

  // =========================================================================
  // GET /conversations/:id — Получить диалог с сообщениями
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/conversations/:id',
    schema: {
      description: 'Получить диалог с историей сообщений',
      tags: ['conversations'],
      params: conversationParamsSchema,
      response: {
        200: z.object({
          conversation: conversationResponseSchema,
          messages: z.array(messageResponseSchema),
        }),
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params;

      const result = await getConversationWithMessages(app.prisma, id, userId);

      // Возвращаем 404 (не 403) — не раскрываем существование чужих диалогов
      if (!result) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Диалог не найден',
        });
      }

      return reply.status(200).send({
        conversation: {
          id: result.conversation.id,
          title: result.conversation.title,
          createdAt: result.conversation.createdAt,
          updatedAt: result.conversation.updatedAt,
        },
        messages: result.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      });
    },
  });

  // =========================================================================
  // POST /conversations/:id/messages — Отправить сообщение (SSE-стриминг)
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/conversations/:id/messages',
    schema: {
      description: 'Отправить сообщение и получить ответ LLM через SSE-стриминг',
      tags: ['conversations'],
      params: conversationParamsSchema,
      body: sendMessageBodySchema,
      // Без response-схемы — reply.raw обходит сериализацию Fastify
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params;
      const { content, documentId } = request.body;

      // Хелпер для отправки SSE-событий
      const sendEvent = (data: Record<string, unknown>) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const { userMessage, stream, saveAssistantMessage } = await sendMessage(
          app.prisma,
          id,
          userId,
          content,
          documentId,
        );

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

        // Начало стриминга — отправляем ID сохранённого сообщения пользователя
        sendEvent({ type: 'message_start', messageId: userMessage.id });

        // Собираем полный текст ответа параллельно со стримингом
        let fullContent = '';

        for await (const token of stream) {
          fullContent += token;
          sendEvent({ type: 'token', content: token });
        }

        // Сохраняем ответ ассистента в БД
        const assistantMessage = await saveAssistantMessage(fullContent);

        // Завершающее событие с полным текстом и ID ответа ассистента
        sendEvent({
          type: 'message_end',
          messageId: assistantMessage.id,
          content: fullContent,
        });
      } catch (error) {
        // Если заголовки ещё не отправлены — можно вернуть обычную ошибку
        if (!reply.raw.headersSent) {
          const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
          const message =
            statusCode >= 500
              ? 'Внутренняя ошибка сервера'
              : (error as Error).message;

          reply.raw.writeHead(statusCode, { 'Content-Type': 'application/json' });
          reply.raw.write(JSON.stringify({
            error: statusCode >= 500 ? 'InternalServerError' : 'Error',
            message,
          }));
          reply.raw.end();
          return reply;
        }

        // Заголовки уже отправлены — ошибку можно передать только через SSE
        request.log.error({ err: error }, 'Ошибка во время SSE-стриминга');
        sendEvent({
          type: 'error',
          error: 'Произошла ошибка при генерации ответа',
        });
      }

      reply.raw.end();
      return reply;
    },
  });

  // =========================================================================
  // DELETE /conversations/:id — Удалить диалог
  // =========================================================================
  app.route({
    method: 'DELETE',
    url: '/conversations/:id',
    schema: {
      description: 'Удалить диалог и все его сообщения',
      tags: ['conversations'],
      params: conversationParamsSchema,
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

      const deleted = await deleteConversation(app.prisma, id, userId);

      if (!deleted) {
        return reply.status(404).send({
          error: 'NotFound',
          message: 'Диалог не найден',
        });
      }

      return reply.status(204).send();
    },
  });
};

export default conversationRoutes;
