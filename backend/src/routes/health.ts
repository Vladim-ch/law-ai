/**
 * Health-эндпоинт для liveness-проверок (Docker healthcheck, k8s probe, LB).
 *
 * На этом этапе — только самопроверка процесса: если обработчик отвечает —
 * значит, event loop жив и Fastify принимает запросы. Без внешних зависимостей
 * по умолчанию, чтобы падение БД/Redis/MinIO не помечало сам backend как
 * нездоровый (для этого будет отдельный readiness-эндпоинт в Задаче 5).
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

/**
 * Схема ответа — используется и как контракт API, и как source-of-truth для
 * типизации через ZodTypeProvider. При рассинхроне типов и валидации упадём
 * на typecheck, а не в рантайме.
 */
const healthResponseSchema = z.object({
  status: z.literal('ok'),
  // ISO-8601 строка для единообразия с остальным API (JSON транспортирует
  // Date как строку; явный ISO избавляет клиента от парсинга).
  // В Zod 4 iso-валидаторы вынесены в неймспейс z.iso.* — используем его.
  timestamp: z.iso.datetime(),
  // Время работы процесса в секундах (process.uptime() уже возвращает секунды).
  uptime: z.number().nonnegative(),
});

const healthRoute: FastifyPluginAsync = async (fastify) => {
  // withTypeProvider<ZodTypeProvider>() даёт вывод типов reply по zod-схеме.
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/health',
    schema: {
      description: 'Liveness-проверка backend-процесса',
      tags: ['system'],
      response: {
        200: healthResponseSchema,
      },
    },
    handler: async () => {
      return {
        status: 'ok' as const,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    },
  });
};

export default healthRoute;
