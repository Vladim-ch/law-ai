# =============================================================================
# Lawer Frontend — multi-stage Dockerfile
# =============================================================================
# Три стадии: deps (зависимости) → build (сборка Next.js) → runtime (standalone).
# Next.js с output: 'standalone' создаёт минимальный server.js + только
# необходимые node_modules в .next/standalone/, что даёт компактный образ.
# =============================================================================

# ---------------------------------------------------------------------------
# Стадия 1: deps — установка зависимостей
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

# libc6-compat — обеспечивает совместимость glibc-библиотек в Alpine.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Копируем только манифесты — кэш npm ci переиспользуется, пока lock-файл
# не изменился (самый стабильный слой).
COPY package.json package-lock.json ./

RUN npm ci

# ---------------------------------------------------------------------------
# Стадия 2: build — сборка Next.js (standalone)
# ---------------------------------------------------------------------------
FROM deps AS build

# NEXT_PUBLIC_* переменные вшиваются в JS-bundle на этапе сборки.
# ARG позволяет переопределить значения через docker compose build --build-arg.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_APP_NAME=Lawer

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}

# Копируем весь проект — Tailwind нужен доступ к компонентам для purge,
# next build читает app/, components/, tailwind.config.ts и т.д.
COPY . .

RUN npm run build

# ---------------------------------------------------------------------------
# Стадия 3: runtime — минимальный продакшен-образ
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# wget — используется для healthcheck (curl в alpine нет по умолчанию).
RUN apk add --no-cache wget

WORKDIR /app

ENV NODE_ENV=production

# Копируем standalone-сервер (server.js + минимальный node_modules).
COPY --from=build /app/.next/standalone/ ./

# Статические assets — Next.js standalone не включает их автоматически.
COPY --from=build /app/.next/static/ ./.next/static/

# Публичные файлы (favicon, robots.txt и т.п.).
COPY --from=build /app/public/ ./public/

# Next.js standalone по умолчанию слушает на localhost.
# HOSTNAME=0.0.0.0 необходим для корректной работы в Docker-сети.
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

EXPOSE 3000

# Переключаемся на непривилегированного пользователя (встроен в node:*-alpine).
USER node

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=20s \
  CMD wget --spider -q http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
