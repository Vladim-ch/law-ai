# =============================================================================
# Lawer Backend — multi-stage Dockerfile
# =============================================================================
# Три стадии: deps (зависимости) → build (компиляция) → runtime (чистый образ).
# Prisma-клиент генерируется на стадии build и копируется в runtime.
# Prisma CLI включён в runtime для автоматического применения миграций при старте.
# =============================================================================

# ---------------------------------------------------------------------------
# Стадия 1: deps — установка зависимостей
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

# openssl — требуется Prisma Engine для работы с БД.
# libc6-compat — обеспечивает совместимость glibc-библиотек в Alpine.
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Копируем только манифесты — кэш npm ci переиспользуется, пока lock-файл
# не изменился (самый стабильный слой).
COPY package.json package-lock.json ./

# --ignore-scripts — пропускаем postinstall-хуки (prisma generate запустим
# отдельно на стадии build, когда будет schema.prisma).
RUN npm ci --ignore-scripts

# ---------------------------------------------------------------------------
# Стадия 2: build — генерация Prisma-клиента и компиляция TypeScript
# ---------------------------------------------------------------------------
FROM deps AS build

# Prisma generate требует schema.prisma для создания типизированного клиента.
# Миграции копируются для автоматического применения через migrate deploy при старте.
COPY prisma/ prisma/
RUN npx prisma generate

# Копируем исходники и конфиг TypeScript.
COPY src/ src/
COPY tsconfig.json tsconfig.json

# tsc компилирует ESM-модули в dist/.
RUN npm run build

# ---------------------------------------------------------------------------
# Стадия 3: runtime — минимальный продакшен-образ
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# openssl — требуется Prisma Engine в рантайме.
# wget — используется для healthcheck (curl в alpine нет по умолчанию).
RUN apk add --no-cache openssl wget poppler-utils

WORKDIR /app

# Копируем только то, что нужно для запуска:
# - dist/          — скомпилированный JS
# - node_modules/  — production-зависимости (включая @prisma/client)
# - prisma/        — schema.prisma (нужна Prisma Engine при старте)
# - package.json   — метаданные (type: module, engines и т.д.)
COPY --from=build /app/dist/ dist/
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/prisma/ prisma/
COPY --from=build /app/package.json package.json

# Копируем сгенерированный Prisma-клиент из build-стадии.
COPY --from=build /app/node_modules/.prisma/ node_modules/.prisma/

# Entrypoint-скрипт: применяет Prisma-миграции перед запуском приложения.
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production

# Порт по умолчанию 4000, но реальное значение приходит через env из compose.
EXPOSE 4000

# Переключаемся на непривилегированного пользователя (встроен в node:*-alpine).
USER node

# Healthcheck использует переменную BACKEND_PORT из окружения.
# Shell-form позволяет подставить $BACKEND_PORT в рантайме.
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=15s \
  CMD wget --spider -q http://localhost:${BACKEND_PORT:-4000}/health || exit 1

# Переменные окружения передаются через docker-compose environment: —
# флаг --env-file НЕ используется, т.к. .env внутри контейнера не существует.
# Entrypoint применяет Prisma-миграции (migrate deploy), затем запускает сервер.
ENTRYPOINT ["./docker-entrypoint.sh"]
