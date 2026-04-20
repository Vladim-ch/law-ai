/**
 * Чтение и валидация переменных окружения.
 *
 * Источник: корневой `.env` проекта (см. `/home/vladim_ch/law-ai/.env.example`).
 * Загрузку `.env` делает сам Node через флаг `--env-file=../.env` (см. scripts
 * в package.json): `tsx --env-file=../.env ...` и `node --env-file=../.env ...`.
 * Поэтому здесь мы просто читаем `process.env` и валидируем через Zod.
 *
 * При отсутствии или некорректном значении критичной переменной приложение
 * упадёт с понятной ошибкой ещё на старте — fail fast лучше, чем латентный
 * баг в рантайме.
 */

import { z } from 'zod';

// --- Схема переменных окружения ----------------------------------------------

// Имена строго согласованы с корневым .env.example. Не переименовываем.
const envSchema = z.object({
  // --- Общие ---
  // Пока не используется напрямую в коде, но валидируем, чтобы гарантировать
  // согласованность с docker-compose (единая TZ для всего стека).
  TZ: z.string().min(1).default('Asia/Irkutsk'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // --- Backend ---
  // `coerce` автоматически конвертирует строку из process.env в число.
  BACKEND_PORT: z.coerce.number().int().positive().max(65535).default(4000),
  BACKEND_HOST: z.string().min(1).default('0.0.0.0'),

  // --- PostgreSQL ---
  // Prisma принимает только готовый URL, составляющие (POSTGRES_USER и т.п.)
  // нужны docker-compose, но backend'у достаточно DATABASE_URL.
  // В Zod 4 валидаторы URL/email/uuid вынесены в top-level: z.url() вместо
  // устаревшего z.string().url().
  DATABASE_URL: z.url(),

  // --- Redis (BullMQ) ---
  REDIS_URL: z.url(),

  // --- MinIO ---
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().positive().max(65535).default(9000),
  MINIO_ROOT_USER: z.string().min(1),
  MINIO_ROOT_PASSWORD: z.string().min(1),
  MINIO_BUCKET_DOCUMENTS: z.string().min(1),
  // В .env значение — строка "false" или "true". z.coerce.boolean() здесь
  // не подходит (любая непустая строка станет true), поэтому парсим вручную.
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  // --- JWT ---
  // Минимум 32 символа — разумный нижний порог для секрета подписи.
  // В проде генерируется командой из .env.example.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET должен быть не короче 32 символов'),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),

  // --- LLM (Ollama / OpenAI-совместимый API) ---
  // Базовый URL LLM-сервера. Для Ollama: http://ollama:11434/v1
  // Для OpenAI: https://api.openai.com/v1
  LLM_BASE_URL: z.url(),
  // Имя модели в формате провайдера (например, qwen2.5:7b для Ollama).
  LLM_MODEL: z.string().min(1),
  // API-ключ. Ollama не требует ключ, но OpenAI SDK ожидает непустое значение.
  LLM_API_KEY: z.string().min(1).default('ollama'),

  // --- Эмбеддинги (RAG) ---
  // Модель эмбеддингов для семантического поиска. По умолчанию nomic-embed-text
  // (768 размерность, работает на CPU, хорошо с русским текстом).
  EMBEDDING_MODEL: z.string().min(1).default('nomic-embed-text'),
  // Размерность вектора. Должна совпадать с моделью и определением vector() в БД.
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),

  // --- Логирование ---
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // --- Загрузка файлов ---
  // Байты. По ТЗ §3.2 — до 50 МБ (52428800).
  MAX_UPLOAD_SIZE: z.coerce.number().int().positive().default(52_428_800),
});

export type Env = z.infer<typeof envSchema>;

// --- Парсинг и экспорт -------------------------------------------------------

/**
 * Парсит `process.env`. При ошибке валидации выбрасывает исключение с
 * человекочитаемым списком проблем (какие переменные отсутствуют / невалидны),
 * чтобы вывод в stderr сразу подсказывал, что именно чинить в .env.
 */
function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Некорректные переменные окружения (проверь .env):\n${issues}`,
    );
  }

  return parsed.data;
}

/**
 * Готовый, провалидированный объект переменных окружения.
 * Импортируется во всё приложение. Парсим ОДИН раз при загрузке модуля —
 * повторные обращения не должны пересчитывать схему.
 */
export const env: Env = parseEnv();

/**
 * Удобные булевы флаги — помогают избежать рассыпания сравнений NODE_ENV
 * по коду (DRY).
 */
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
