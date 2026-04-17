/**
 * HTTP-клиент для взаимодействия с backend API.
 * Пока не используется — backend ещё не имеет чат-эндпоинтов.
 */

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

/**
 * Обёртка над fetch для запросов к backend.
 * Автоматически подставляет базовый URL, Content-Type и обрабатывает ошибки.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => undefined);
    throw new ApiError(response.status, response.statusText, body);
  }

  return response.json() as Promise<T>;
}
