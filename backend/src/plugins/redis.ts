/**
 * Fastify-плагин для Redis (ioredis).
 *
 * Создаёт ioredis-клиент, декорирует Fastify-инстанс свойством `redis` и
 * корректно завершает соединение через хук `onClose`.
 *
 * Выбран ioredis (а не `redis` пакет), потому что:
 *   - BullMQ (очереди задач) требует именно ioredis;
 *   - Единый Redis-клиент для кэша и очередей — меньше зависимостей.
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import Redis from 'ioredis';

import { env } from '../config/env.js';

/** Расширяем типы FastifyInstance для доступа к `app.redis`. */
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPlugin: FastifyPluginAsync = async (app) => {
  const redis = new Redis(env.REDIS_URL, {
    // Не пытаемся реконнектиться бесконечно при старте — fail fast.
    maxRetriesPerRequest: 3,
    // Ленивая подписка — ioredis подключается при первой команде.
    lazyConnect: true,
  });

  // Явно инициируем подключение, чтобы при старте убедиться, что Redis доступен.
  await redis.connect();
  app.log.info('Redis: подключение установлено');

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    app.log.info('Redis: отключение');
    await redis.quit();
  });
};

export default fp(redisPlugin, {
  name: 'redis',
});
