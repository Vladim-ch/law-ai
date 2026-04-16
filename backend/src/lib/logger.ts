/**
 * Конфигурация Pino-логгера.
 *
 * Fastify использует Pino по умолчанию — мы передаём сюда готовые опции, а не
 * собранный инстанс, чтобы Fastify мог прокинуть их в свой fastify.log и
 * корректно привязать requestId к дочерним логгерам запроса.
 *
 * Различия по окружению:
 *   * development — человекочитаемый формат через `pino-pretty` (ANSI-цвета,
 *     ISO-таймстамп, короткие имена уровней). Удобно читать в терминале.
 *   * production  — JSON без transport'а (это дефолт Pino): одна строка —
 *     одна запись, легко парсится lrg/loki/clickhouse-экспортёрами.
 *
 * Редакция чувствительных полей (redact) защищает от случайного попадания
 * секретов в логи — особенно на dev-машинах, которые могут шарить лог-файлы.
 */

import type { LoggerOptions } from 'pino';

import { env, isDevelopment } from '../config/env.js';

/**
 * Поля, которые Pino замажет на `[Redacted]` при сериализации.
 * Список составлен исходя из того, что реально может прилетать в логи:
 *   - HTTP-заголовки авторизации при логировании запросов Fastify;
 *   - любые поля `password`, `token`, `secret`, `apiKey` и т.п. в объектах,
 *     которые мы передадим в .info({ ... });
 *   - cookie — чтобы не утекали сессионные куки при дампе req.
 *
 * Пути вида `*.password` работают на любом уровне вложенности.
 */
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.passwordHash',
  'password',
  'passwordHash',
  '*.token',
  'token',
  '*.accessToken',
  'accessToken',
  '*.refreshToken',
  'refreshToken',
  '*.jwt',
  '*.apiKey',
  'apiKey',
  'ANTHROPIC_API_KEY',
  'JWT_SECRET',
];

/**
 * Опции Pino, которые передаются в конструктор Fastify:
 *   fastify({ logger: loggerOptions })
 *
 * Экспортируем именно объект опций, а не готовый логгер, потому что Fastify
 * создаёт собственный корневой логгер и оборачивает его в per-request child'ы.
 */
export const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,

  // В dev — pretty-transport. В prod — stdout JSON (не указываем transport).
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l o',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        },
      }
    : {}),

  redact: {
    paths: redactPaths,
    censor: '[Redacted]',
    remove: false,
  },

  // В prod'е Fastify по умолчанию логирует req/res — оставляем это поведение.
  // Здесь намеренно не переопределяем serializers: дефолтные из Fastify
  // корректно обрабатывают Request/Response.
};
