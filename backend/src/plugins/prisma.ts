/**
 * Fastify-плагин для Prisma (PostgreSQL).
 *
 * Создаёт PrismaClient, декорирует Fastify-инстанс свойством `prisma` и
 * корректно отключается при завершении приложения через хук `onClose`.
 */

import { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { env } from '../config/env.js';
import { seedDefaultTemplates } from '../services/template.js';

/** Расширяем типы FastifyInstance для доступа к `app.prisma`. */
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = async (app) => {
  const prisma = new PrismaClient({
    datasourceUrl: env.DATABASE_URL,
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : [
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ],
  });

  // Проверяем соединение при старте — fail fast, если БД недоступна.
  await prisma.$connect();
  app.log.info('Prisma: подключение к PostgreSQL установлено');

  app.decorate('prisma', prisma);

  // Seed предустановленных шаблонов документов
  try {
    const { found, created } = await seedDefaultTemplates(prisma);
    app.log.info(`Шаблоны: найдено ${found}, создано ${created}`);
  } catch (error) {
    app.log.warn({ err: error }, 'Не удалось выполнить seed шаблонов (пользователи ещё не созданы?)');
  }

  // Корректное закрытие соединения при shutdown.
  app.addHook('onClose', async () => {
    app.log.info('Prisma: отключение от PostgreSQL');
    await prisma.$disconnect();
  });
};

export default fp(prismaPlugin, {
  name: 'prisma',
  // Плагин не зависит от других — можно регистрировать первым.
});
