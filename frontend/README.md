# Lawer Frontend

Клиентская часть AI-ассистента юридического отдела.

## Стек

- **Next.js 14+** (App Router, standalone output)
- **React 18+** с TypeScript (strict mode)
- **Tailwind CSS 3** — утилитарные стили, тёмная тема
- **Zustand** — управление состоянием
- **Lucide React** — иконки

## Команды

```bash
# Установка зависимостей
npm install

# Запуск dev-сервера (http://localhost:3000)
npm run dev

# Проверка типов
npm run typecheck

# Линтинг
npm run lint

# Форматирование кода
npm run format

# Сборка для продакшена
npm run build

# Запуск продакшен-сервера
npm start
```

## Структура

```
frontend/
├── app/                  # Next.js App Router
│   ├── layout.tsx        # Корневой layout (sidebar + main)
│   ├── page.tsx          # Главная страница
│   └── globals.css       # Глобальные стили + Tailwind
├── components/
│   ├── layout/           # Компоненты каркаса (Sidebar, Header)
│   └── ui/               # Переиспользуемые UI-компоненты (Button)
├── lib/
│   └── api.ts            # HTTP-клиент (заготовка)
├── stores/
│   └── app.ts            # Zustand store
└── ...конфиги
```

## Переменные окружения

Используются из корневого `.env` (см. `.env.example`):

| Переменная | Описание |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL backend API (по умолчанию `http://localhost:4000`) |
| `NEXT_PUBLIC_APP_NAME` | Название приложения |

## Техническое задание

Полное ТЗ: [`/TZ.md`](../TZ.md) в корне проекта.
