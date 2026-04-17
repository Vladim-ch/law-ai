/**
 * HTTP-клиент для взаимодействия с backend API.
 * Обёртка над fetch с авторизацией, обработкой ошибок и SSE-стримингом.
 */

import type { User, Conversation, Message, Document, DocumentInfo } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Ошибка API с кодом ответа и телом */
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown,
  ) {
    super(`API ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

/** Получить токен из localStorage (только в браузере) */
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

/**
 * Обёртка над fetch для запросов к backend.
 * Автоматически подставляет базовый URL, Authorization и Content-Type.
 * При 401 — разлогинивает пользователя.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const token = getToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Content-Type только для запросов с телом (POST, PUT, PATCH).
  // DELETE без тела + Content-Type: application/json вызывает 400 в Fastify.
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // При 401 — очищаем токен
    if (response.status === 401) {
      localStorage.removeItem('token');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => undefined);
    }

    const message =
      (body && typeof body === 'object' && 'message' in body
        ? (body as { message: string }).message
        : response.statusText) || response.statusText;

    throw new ApiError(response.status, message, body);
  }

  // Для 204 (No Content) — не парсим тело
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/** Методы авторизации */
export const auth = {
  /** Регистрация нового пользователя */
  register: (email: string, name: string, password: string) =>
    apiFetch<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    }),

  /** Вход по email и паролю */
  login: (email: string, password: string) =>
    apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /** Получить текущего пользователя по токену */
  me: () => apiFetch<{ user: User }>('/auth/me'),
};

/** Методы для работы с диалогами */
export const conversations = {
  /** Создать новый диалог */
  create: (title?: string) =>
    apiFetch<{ conversation: Conversation }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  /** Получить список диалогов */
  list: (limit = 50, offset = 0) =>
    apiFetch<{ conversations: Conversation[]; total: number }>(
      `/conversations?limit=${limit}&offset=${offset}`,
    ),

  /** Получить один диалог с сообщениями */
  get: (id: string) =>
    apiFetch<{ conversation: Conversation; messages: Message[] }>(`/conversations/${id}`),

  /** Удалить диалог */
  delete: (id: string) =>
    apiFetch<void>(`/conversations/${id}`, { method: 'DELETE' }),

  /**
   * Отправить сообщение и получить SSE-поток ответа.
   * Возвращает Response, чтобы вызывающий код мог читать ReadableStream.
   */
  sendMessage: async (id: string, content: string, documentId?: string): Promise<Response> => {
    const token = getToken();
    const url = `${API_BASE_URL}/conversations/${id}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content, ...(documentId ? { documentId } : {}) }),
    });

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      throw new ApiError(response.status, response.statusText, body);
    }

    return response;
  },
};

/** Допустимые MIME-типы для загрузки документов */
export const ALLOWED_FILE_TYPES: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/rtf': '.rtf',
  'text/rtf': '.rtf',
};

/** Допустимые расширения файлов */
export const ALLOWED_EXTENSIONS = '.docx,.pdf,.txt,.rtf';

/** Максимальный размер файла — 50 МБ */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Методы для работы с документами */
export const documents = {
  /** Загрузить документ (multipart/form-data) */
  upload: async (file: File): Promise<{ document: Document; parseError?: string }> => {
    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: 'POST',
      headers: {
        // Content-Type не ставим — browser сам добавит multipart с boundary
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token');
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => undefined);
      }

      const message =
        (body && typeof body === 'object' && 'message' in body
          ? (body as { message: string }).message
          : response.statusText) || response.statusText;

      throw new ApiError(response.status, message, body);
    }

    return response.json();
  },

  /** Получить список документов */
  list: (limit = 50, offset = 0) =>
    apiFetch<{ documents: DocumentInfo[]; total: number }>(
      `/documents?limit=${limit}&offset=${offset}`,
    ),

  /** Получить документ по id */
  get: (id: string) => apiFetch<{ document: Document }>(`/documents/${id}`),

  /** Удалить документ */
  delete: (id: string) => apiFetch<void>(`/documents/${id}`, { method: 'DELETE' }),

  /** URL для скачивания документа */
  downloadUrl: (id: string) => `${API_BASE_URL}/documents/${id}/download`,
};
