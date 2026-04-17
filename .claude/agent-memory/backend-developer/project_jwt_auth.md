---
name: JWT auth implemented
description: JWT authentication layer — plugin, auth service with bcrypt, register/login/me endpoints
type: project
---

JWT-аутентификация реализована 2026-04-16:
- `plugins/jwt.ts` — @fastify/jwt обёртка, декоратор `app.authenticate`
- `services/auth.ts` — hashPassword, verifyPassword (bcrypt, 12 rounds), createUser, authenticateUser
- `routes/auth.ts` — POST /auth/register, POST /auth/login, GET /auth/me

**Why:** первый шаг к ролевой модели доступа (ТЗ §3.1). JWT payload: `{ userId, role }`.

**How to apply:** все защищённые роуты используют `onRequest: [app.authenticate]`. Тип `request.user` — `{ userId: string, role: UserRole }`. Новые зависимости: `@fastify/jwt`, `bcrypt`, `@types/bcrypt`.
