/**
 * Fastify-плагин для JWT-аутентификации.
 *
 * Оборачивает @fastify/jwt: подключает sign/verify/decode, декорирует инстанс
 * хелпером `authenticate` для использования в onRequest-хуках роутов.
 */

import fastifyJwt from '@fastify/jwt';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { UserRole } from '@prisma/client';

import { env } from '../config/env.js';

/** Структура JWT-payload — минимум данных для авторизации. */
export interface JwtPayload {
  userId: string;
  role: UserRole;
}

// Расширяем типы @fastify/jwt, чтобы request.user имел корректный тип.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

// Расширяем FastifyInstance декоратором authenticate.
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const jwtPlugin: FastifyPluginAsync = async (app) => {
  // Регистрируем @fastify/jwt с секретом и настройками подписи.
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  });

  /**
   * Декоратор authenticate — используется как onRequest-хук.
   * Проверяет наличие и валидность JWT в заголовке Authorization.
   * При ошибке возвращает 401.
   */
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (_err) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Токен не предоставлен или невалиден',
      });
    }
  });

  app.log.info('JWT: плагин аутентификации подключён');
};

export default fp(jwtPlugin, {
  name: 'jwt',
  // JWT не зависит от внешних сервисов, но регистрируем после prisma
  // для предсказуемого порядка инициализации.
});
