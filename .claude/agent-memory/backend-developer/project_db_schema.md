---
name: Database schema initialized
description: Prisma schema with 7 models (User, Conversation, Message, Document, Template, Task, KnowledgeBase) created and first migration applied
type: project
---

Prisma schema заполнена 7 моделями по ТЗ §5, первая миграция `20260417004848_init` создана и применена.

**Why:** Это фундамент модели данных для всех последующих задач — аутентификация, чат, документы, шаблоны, задачи, база знаний.

**How to apply:** При добавлении новых полей или моделей — создавать инкрементальные миграции через `prisma migrate dev --name <description>`. Поля vector(1536) используют Unsupported — работа с ними через $queryRaw/$executeRaw.
