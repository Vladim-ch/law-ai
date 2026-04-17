/**
 * Fastify-плагин для LLM-клиента (OpenAI SDK → Ollama).
 *
 * Декорирует Fastify-инстанс свойствами:
 *   - `app.llm` — инстанс OpenAI-клиента для прямого доступа к API;
 *   - `app.chat` — не-стриминговая обёртка;
 *   - `app.streamChat` — async-генератор для стриминга.
 *
 * При старте выполняет опциональный health-check: запрашивает список моделей
 * у LLM-провайдера. Если провайдер недоступен — логирует предупреждение
 * (не fatal), т.к. Ollama может ещё загружаться или скачивать модель.
 */

import type { FastifyPluginAsync } from 'fastify';
import type OpenAI from 'openai';
import fp from 'fastify-plugin';

import { llm, chat, streamChat, type ChatOptions } from '../lib/llm.js';

// ---------------------------------------------------------------------------
// Расширяем типы FastifyInstance
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyInstance {
    /** OpenAI SDK клиент, настроенный на LLM-провайдер. */
    llm: OpenAI;

    /** Не-стриминговый запрос к LLM. Возвращает полный текст ответа. */
    chat: (
      messages: OpenAI.ChatCompletionMessageParam[],
      options?: ChatOptions,
    ) => Promise<string>;

    /** Async-генератор для посимвольного стриминга ответа LLM. */
    streamChat: (
      messages: OpenAI.ChatCompletionMessageParam[],
      options?: ChatOptions,
    ) => AsyncGenerator<string>;
  }
}

// ---------------------------------------------------------------------------
// Плагин
// ---------------------------------------------------------------------------

const llmPlugin: FastifyPluginAsync = async (app) => {
  // Декорируем инстанс Fastify.
  app.decorate('llm', llm);
  app.decorate('chat', chat);
  app.decorate('streamChat', streamChat);

  // Опциональный health-check: проверяем доступность LLM-провайдера.
  // Не блокируем старт — Ollama может ещё инициализироваться.
  try {
    const models = await llm.models.list();
    const modelIds: string[] = [];
    for await (const model of models) {
      modelIds.push(model.id);
    }
    app.log.info(
      { availableModels: modelIds },
      'LLM: подключение к провайдеру установлено',
    );
  } catch (error) {
    app.log.warn(
      { err: error },
      'LLM: провайдер недоступен при старте (Ollama может быть ещё не готов). ' +
        'Запросы к LLM будут работать, когда провайдер станет доступен.',
    );
  }
};

export default fp(llmPlugin, {
  name: 'llm',
  // Плагин не зависит от других — можно регистрировать в любом порядке.
});
