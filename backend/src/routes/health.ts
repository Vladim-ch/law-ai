/**
 * Health-эндпоинт для readiness-проверок (Docker healthcheck, k8s probe, LB).
 *
 * Проверяет доступность всех внешних зависимостей: PostgreSQL, Redis, MinIO.
 * Проверки выполняются параллельно с таймаутом 3 секунды на каждую.
 *
 * Логика статусов:
 *   - "ok"       — все зависимости доступны
 *   - "degraded" — часть зависимостей недоступна (сервер жив, но ограничен)
 *   - "error"    — все зависимости недоступны
 *
 * HTTP-код: 200 для ok/degraded, 503 для error.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../config/env.js';

/** Таймаут на каждую отдельную проверку (мс). */
const CHECK_TIMEOUT_MS = 3_000;

/** Схема результата одной проверки. */
const checkResultSchema = z.object({
  status: z.enum(['ok', 'error']),
  latencyMs: z.number().nonnegative(),
  error: z.string().optional(),
});

/** Схема полного ответа /health. */
const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.iso.datetime(),
  uptime: z.number().nonnegative(),
  checks: z.object({
    postgres: checkResultSchema,
    redis: checkResultSchema,
    minio: checkResultSchema,
  }),
});

type CheckResult = z.infer<typeof checkResultSchema>;

/**
 * Оборачивает проверку в таймаут. Если проверка не укладывается в лимит —
 * возвращаем ошибку, а не зависаем навечно.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error(`Таймаут: проверка не завершилась за ${timeoutMs}мс`)),
        timeoutMs,
      );
    }),
  ]);
}

/**
 * Выполняет проверку и замеряет latency. При ошибке ловит и возвращает
 * результат со статусом "error".
 */
async function runCheck(fn: () => Promise<void>): Promise<CheckResult> {
  const start = performance.now();
  try {
    await withTimeout(fn(), CHECK_TIMEOUT_MS);
    return {
      status: 'ok',
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/health',
    schema: {
      description: 'Readiness-проверка backend и всех внешних зависимостей',
      tags: ['system'],
      response: {
        200: healthResponseSchema,
        503: healthResponseSchema,
      },
    },
    handler: async (_request, reply) => {
      // Запускаем все проверки параллельно.
      const [postgres, redis, minio] = await Promise.all([
        // PostgreSQL — простейший запрос через Prisma.
        runCheck(async () => {
          await fastify.prisma.$queryRaw`SELECT 1`;
        }),

        // Redis — ping/pong.
        runCheck(async () => {
          const pong = await fastify.redis.ping();
          if (pong !== 'PONG') {
            throw new Error(`Неожиданный ответ Redis: "${pong}"`);
          }
        }),

        // MinIO — проверка существования бакета.
        runCheck(async () => {
          await fastify.minio.bucketExists(env.MINIO_BUCKET_DOCUMENTS);
        }),
      ]);

      const checks = { postgres, redis, minio };
      const results = Object.values(checks);

      // Определяем общий статус.
      const failedCount = results.filter((r) => r.status === 'error').length;
      let status: 'ok' | 'degraded' | 'error';
      if (failedCount === 0) {
        status = 'ok';
      } else if (failedCount === results.length) {
        status = 'error';
      } else {
        status = 'degraded';
      }

      const body = {
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks,
      };

      // 503 только если все зависимости недоступны.
      const httpCode = status === 'error' ? 503 : 200;
      return reply.status(httpCode).send(body);
    },
  });
};

export default healthRoute;
