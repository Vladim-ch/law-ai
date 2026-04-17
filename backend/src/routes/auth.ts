/**
 * Роуты аутентификации: регистрация, вход, получение текущего пользователя.
 *
 * Prefix: /auth
 * Все эндпоинты типизированы через fastify-type-provider-zod (Zod 4).
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { createUser, authenticateUser } from '../services/auth.js';

// ---------------------------------------------------------------------------
// Zod-схемы
// ---------------------------------------------------------------------------

/** Схема пользователя в ответе — без passwordHash. */
const userResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['ADMIN', 'LAWYER', 'VIEWER']),
  createdAt: z.date(),
});

/** Ответ с токеном и данными пользователя. */
const authResponseSchema = z.object({
  token: z.string(),
  user: userResponseSchema,
});

/** Тело запроса на регистрацию. */
const registerBodySchema = z.object({
  email: z.email('Некорректный формат email'),
  name: z.string().min(1, 'Имя обязательно'),
  password: z.string().min(8, 'Пароль должен содержать минимум 8 символов'),
});

/** Тело запроса на вход. */
const loginBodySchema = z.object({
  email: z.email('Некорректный формат email'),
  password: z.string().min(1, 'Пароль обязателен'),
});

/** Ответ с данными текущего пользователя. */
const meResponseSchema = z.object({
  user: userResponseSchema,
});

/** Ответ при ошибке. */
const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Хелпер — формирование безопасного объекта пользователя (без passwordHash)
// ---------------------------------------------------------------------------

function sanitizeUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'ADMIN' | 'LAWYER' | 'VIEWER',
    createdAt: user.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Плагин роутов
// ---------------------------------------------------------------------------

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // =========================================================================
  // POST /auth/register — регистрация нового пользователя
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/auth/register',
    schema: {
      description: 'Регистрация нового пользователя',
      tags: ['auth'],
      body: registerBodySchema,
      response: {
        201: authResponseSchema,
        409: errorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const { email, name, password } = request.body;

      const user = await createUser(app.prisma, { email, name, password });

      // JWT-payload — минимум данных для авторизации.
      const token = app.jwt.sign({ userId: user.id, role: user.role });

      return reply.status(201).send({
        token,
        user: sanitizeUser(user),
      });
    },
  });

  // =========================================================================
  // POST /auth/login — аутентификация (вход)
  // =========================================================================
  app.route({
    method: 'POST',
    url: '/auth/login',
    schema: {
      description: 'Аутентификация по email и паролю',
      tags: ['auth'],
      body: loginBodySchema,
      response: {
        200: authResponseSchema,
        401: errorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const { email, password } = request.body;

      const user = await authenticateUser(app.prisma, email, password);

      const token = app.jwt.sign({ userId: user.id, role: user.role });

      return reply.status(200).send({
        token,
        user: sanitizeUser(user),
      });
    },
  });

  // =========================================================================
  // GET /auth/me — данные текущего пользователя (требует JWT)
  // =========================================================================
  app.route({
    method: 'GET',
    url: '/auth/me',
    schema: {
      description: 'Получение данных текущего аутентифицированного пользователя',
      tags: ['auth'],
      response: {
        200: meResponseSchema,
        401: errorResponseSchema,
      },
    },
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;

      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      // Пользователь мог быть удалён после выдачи токена.
      if (!user) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Пользователь не найден',
        });
      }

      return reply.status(200).send({
        user: sanitizeUser(user),
      });
    },
  });
};

export default authRoutes;
