/**
 * LLM-клиент на базе OpenAI SDK.
 *
 * OpenAI SDK используется как универсальный клиент для любого
 * OpenAI-совместимого API (Ollama, vLLM, LM Studio и т.д.).
 * При смене LLM-провайдера достаточно изменить LLM_BASE_URL и LLM_API_KEY в .env.
 *
 * Экспортирует:
 *   - `llm` — инстанс OpenAI-клиента (для прямого доступа к API);
 *   - `chat()` — обёртка для синхронного (не-стримингового) запроса;
 *   - `streamChat()` — async-генератор для посимвольного стриминга ответа.
 */

import OpenAI from 'openai';

import { env } from '../config/env.js';

// ---------------------------------------------------------------------------
// Клиент
// ---------------------------------------------------------------------------

/** OpenAI SDK, настроенный на Ollama (или любой OpenAI-совместимый API). */
export const llm = new OpenAI({
  baseURL: env.LLM_BASE_URL,
  apiKey: env.LLM_API_KEY,
});

// ---------------------------------------------------------------------------
// Параметры генерации по умолчанию
// ---------------------------------------------------------------------------

/**
 * temperature: 0.3 — юридические ответы должны быть точными и
 * детерминированными; креативность здесь вредна.
 *
 * max_tokens: 4096 — юридические тексты (правовые заключения, анализ
 * договоров) бывают объёмными; 4K токенов — разумный запас без
 * злоупотребления ресурсами.
 */
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 4096;

// ---------------------------------------------------------------------------
// Опции
// ---------------------------------------------------------------------------

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// Стриминговый запрос
// ---------------------------------------------------------------------------

/**
 * Async-генератор: отправляет запрос к LLM и по мере получения токенов
 * yield'ит строковые фрагменты ответа. Подходит для SSE-стриминга клиенту.
 */
export async function* streamChat(
  messages: OpenAI.ChatCompletionMessageParam[],
  options?: ChatOptions,
): AsyncGenerator<string> {
  const stream = await llm.chat.completions.create({
    model: env.LLM_MODEL,
    messages,
    stream: true,
    temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
    max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}

// ---------------------------------------------------------------------------
// Синхронный (не-стриминговый) запрос
// ---------------------------------------------------------------------------

/**
 * Отправляет запрос к LLM и возвращает полный текст ответа.
 * Удобно для внутренних задач (генерация резюме, классификация),
 * где стриминг не нужен.
 */
export async function chat(
  messages: OpenAI.ChatCompletionMessageParam[],
  options?: ChatOptions,
): Promise<string> {
  const response = await llm.chat.completions.create({
    model: env.LLM_MODEL,
    messages,
    temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
    max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
  });

  return response.choices[0]?.message?.content ?? '';
}
