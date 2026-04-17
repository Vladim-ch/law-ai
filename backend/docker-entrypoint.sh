#!/bin/sh
set -e

echo "Применение миграций Prisma..."
npx prisma migrate deploy --schema=prisma/schema.prisma

echo "Запуск backend..."
exec node dist/index.js
