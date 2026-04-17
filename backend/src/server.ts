/**
 * Фабрика Fastify-сервера.
 *
 * Разделение на `buildServer()` и `src/index.ts` сделано намеренно:
 *   * `index.ts` отвечает за bootstrap (listen, сигналы завершения);
 *   * `buildServer()` возвращает готовый, НО НЕ запущенный инстанс — такой
 *     инстанс удобно инжектить в интеграционные тесты (fastify.inject(...))
 *     без реального порта. Это понадобится агенту qa-engineer.
 */

import Fastify, { type FastifyError } from 'fastify';
// Пакет `@fastify/type-provider-zod` переехал под именем `fastify-type-provider-zod`.
// Версия 6.x поддерживает Zod 4 и Fastify 5 — именно этот тандем мы используем.
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import cors from '@fastify/cors';

import { loggerOptions } from './lib/logger.js';
import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import minioPlugin from './plugins/minio.js';
import jwtPlugin from './plugins/jwt.js';
import llmPlugin from './plugins/llm.js';
import healthRoute from './routes/health.js';
import authRoutes from './routes/auth.js';
import conversationRoutes from './routes/conversations.js';

/**
 * Тип возвращаемого инстанса: Fastify с подключённым ZodTypeProvider.
 * Явный тип нужен, чтобы TypeScript знал про типизацию route() в тестах,
 * импортирующих `buildServer`.
 */
export type AppInstance = ReturnType<typeof createFastifyApp>;

function createFastifyApp() {
  return Fastify({
    logger: loggerOptions,

    // Доверяем заголовкам X-Forwarded-* от reverse proxy (nginx/traefik).
    // В dev proxy нет — заголовок просто не выставляется, и это ок.
    trustProxy: true,

    // Не отключаем автологирование req/res — это полезный дефолт Fastify.
    disableRequestLogging: false,

    // requestIdHeader=false => Fastify сам генерирует requestId через genReqId.
    // Этот id автоматически попадает в child-логгер каждого запроса и в ответ
    // через X-Request-Id (см. ниже onSend-хук).
    requestIdHeader: false,
    genReqId: (req) => {
      // Если клиент сам прислал X-Request-Id — уважаем его (distributed tracing).
      const headerId = req.headers['x-request-id'];
      if (typeof headerId === 'string' && headerId.length > 0 && headerId.length <= 128) {
        return headerId;
      }
      // Иначе генерируем локальный идентификатор — достаточный для корреляции
      // логов в рамках одной ноды.
      return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    },
  }).withTypeProvider<ZodTypeProvider>();
}

/**
 * Собирает и настраивает Fastify-инстанс.
 *
 * Возвращаемый тип — уже с подставленным ZodTypeProvider, чтобы потребители
 * (тесты, расширения) получали типизированные обёртки route() из коробки.
 */
export async function buildServer(): Promise<AppInstance> {
  const app = createFastifyApp();

  // --- Zod compilers ---------------------------------------------------------
  // Подключаем валидатор и сериализатор от fastify-type-provider-zod.
  // Без этой пары Zod-схемы в route() не будут ни валидироваться, ни
  // сужать типы reply.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // --- Глобальные хуки -------------------------------------------------------

  // Прокидываем request-id в заголовок ответа — помогает связывать жалобу
  // пользователя ("вот ошибка") с конкретной записью в логах.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // --- Обработчик ошибок -----------------------------------------------------
  // Централизованный error handler: пишем в лог с контекстом, клиенту
  // возвращаем безопасное сообщение. Детали 500-х не утекают наружу.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error, reqId: request.id }, 'Unhandled error in request');

    // Валидационные ошибки Fastify имеют statusCode 400 и validation-массив.
    if (error.validation) {
      return reply.status(400).send({
        error: 'ValidationError',
        message: error.message,
        details: error.validation,
        requestId: request.id,
      });
    }

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    // Для 5xx не светим внутренности — только requestId, чтобы по нему можно
    // было найти подробности в логах.
    if (statusCode >= 500) {
      return reply.status(statusCode).send({
        error: 'InternalServerError',
        message: 'Внутренняя ошибка сервера',
        requestId: request.id,
      });
    }

    return reply.status(statusCode).send({
      error: error.name || 'Error',
      message: error.message,
      requestId: request.id,
    });
  });

  // 404 — возвращаем в том же формате, что и остальные ошибки.
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: 'NotFound',
      message: `Route ${request.method} ${request.url} not found`,
      requestId: request.id,
    });
  });

  // --- CORS ------------------------------------------------------------------
  // Разрешаем cross-origin запросы от фронтенда (другой порт = другой origin).
  // В dev: origin: true (любой origin). В проде — ограничить конкретным доменом.
  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // --- Плагины внешних зависимостей -------------------------------------------
  // Регистрируем до роутов, чтобы декораторы (prisma, redis, minio) были
  // доступны в обработчиках запросов.
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(minioPlugin);
  await app.register(jwtPlugin);
  await app.register(llmPlugin);

  // --- Роуты -----------------------------------------------------------------
  // Health — без префикса, чтобы балансировщики могли дергать ровно /health.
  await app.register(healthRoute);

  // Auth — регистрация, вход, /auth/me.
  await app.register(authRoutes);

  // Conversations — диалоги с AI-ассистентом, SSE-стриминг.
  await app.register(conversationRoutes);

  return app;
}
