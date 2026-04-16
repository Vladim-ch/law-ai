# Lawer — Backend

Серверная часть AI-ассистента юридического отдела. Реализация — **Node.js 20+ / TypeScript**.

Стек (подробнее в [ТЗ](../TZ.md), §4.3 и §7):

- **Fastify 5** — HTTP-фреймворк
- **Zod** — валидация входных данных и схем API (через `@fastify/type-provider-zod`)
- **Pino** — структурированное логирование (в dev — `pino-pretty`)
- **Prisma 5** — ORM для PostgreSQL 16 + pgvector
- **BullMQ + Redis** — фоновые задачи (появится позже)
- **MinIO** — объектное хранилище документов (появится позже)

## Структура каталогов

```
backend/
├── prisma/
│   └── schema.prisma          # datasource + generator (модели добавятся отдельно)
├── src/
│   ├── config/
│   │   └── env.ts             # Zod-валидация переменных окружения
│   ├── lib/
│   │   └── logger.ts          # Опции Pino для Fastify (pretty в dev, JSON в prod)
│   ├── routes/
│   │   └── health.ts          # GET /health — liveness
│   ├── server.ts              # buildServer() — фабрика Fastify
│   └── index.ts               # Точка входа: bootstrap + graceful shutdown
├── eslint.config.js           # ESLint 9 flat-config
├── .prettierrc.json
├── tsconfig.json
└── package.json
```

## Переменные окружения

Backend читает переменные из **корневого** `/home/vladim_ch/law-ai/.env` — локальный `.env` в `backend/` не нужен. Список см. в [/.env.example](../.env.example). Скрипты `dev` и `start` передают путь к `.env` через флаг Node 20.6+ `--env-file=../.env`.

## Команды

```bash
# Установка зависимостей (внутри backend/)
npm install

# Разработка — tsx с hot-reload, читает ../.env
npm run dev

# Проверка типов без компиляции
npm run typecheck

# Сборка в dist/
npm run build

# Запуск скомпилированной версии
npm run start

# Линт и форматирование
npm run lint
npm run format

# Prisma (клиент пока не генерируем — нужна БД; моделей ещё нет)
npm run prisma:validate
```

## Проверка работы

1. В корне проекта скопируй `.env.example` в `.env` и при желании скорректируй значения.
2. Установи зависимости: `cd backend && npm install`.
3. Запусти: `npm run dev`.
4. Открой `http://localhost:4000/health` — ожидаем `{ "status": "ok", "timestamp": "...", "uptime": ... }`.

Инфраструктурные сервисы (`docker compose up -d`) для `/health` **не нужны** — эндпоинт проверяет только сам процесс. Для следующих задач (Postgres/Redis/MinIO) потребуется `docker compose up -d` в корне.

## Что ещё не реализовано

- Модели Prisma и миграции БД (User, Conversation, Message, Document, Template, Task, KnowledgeBase — см. ТЗ §5).
- Dockerfile для backend — Задача 4 (`docker-deploy`).
- Расширенный `/health` с проверками Postgres/Redis/MinIO — Задача 5.
- Аутентификация (JWT), SSE-стриминг, интеграция с Claude API, MCP-клиенты — отдельные задачи.
