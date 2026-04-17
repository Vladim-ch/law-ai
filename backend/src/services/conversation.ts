/**
 * Сервис диалогов — бизнес-логика создания, получения, удаления диалогов
 * и отправки сообщений с LLM-стримингом.
 *
 * Изолирует Prisma-запросы и формирование контекста LLM от HTTP-слоя.
 */

import type { PrismaClient, Conversation, Message } from '@prisma/client';
import type OpenAI from 'openai';

import { getSystemMessage } from '../lib/system-prompt.js';
import { streamChat } from '../lib/llm.js';

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

/** Данные для создания нового диалога. */
export interface CreateConversationData {
  userId: string;
  title?: string;
}

/** Параметры списка диалогов. */
export interface ListConversationsParams {
  userId: string;
  limit: number;
  offset: number;
}

/** Результат отправки сообщения — стриминг + сохранение. */
export interface SendMessageResult {
  userMessage: Message;
  stream: AsyncGenerator<string>;
  /** Вызвать после завершения стриминга для сохранения ответа ассистента. */
  saveAssistantMessage: (fullContent: string) => Promise<Message>;
}

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

/**
 * Маппинг Prisma Message → формат OpenAI Chat Completions API.
 * Преобразует роли из enum Prisma в строковые литералы OpenAI.
 */
function toOpenAIMessage(msg: Message): OpenAI.ChatCompletionMessageParam {
  const roleMap: Record<string, 'user' | 'assistant' | 'system'> = {
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system',
  };

  return {
    role: roleMap[msg.role] ?? 'user',
    content: msg.content,
  };
}

/**
 * Генерирует заголовок диалога по умолчанию, если пользователь не указал.
 */
function generateDefaultTitle(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `Диалог от ${dateStr}`;
}

// ---------------------------------------------------------------------------
// Сервис
// ---------------------------------------------------------------------------

/**
 * Создаёт новый диалог для пользователя.
 */
export async function createConversation(
  prisma: PrismaClient,
  data: CreateConversationData,
): Promise<Conversation> {
  const title = data.title?.trim() || generateDefaultTitle();

  return prisma.conversation.create({
    data: {
      userId: data.userId,
      title,
    },
  });
}

/**
 * Возвращает список диалогов пользователя с пагинацией.
 * Сортировка: по updatedAt DESC (свежие первые).
 */
export async function listConversations(
  prisma: PrismaClient,
  params: ListConversationsParams,
): Promise<{ conversations: Conversation[]; total: number }> {
  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where: { userId: params.userId },
      orderBy: { updatedAt: 'desc' },
      take: params.limit,
      skip: params.offset,
      select: {
        id: true,
        userId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.conversation.count({
      where: { userId: params.userId },
    }),
  ]);

  return { conversations: conversations as Conversation[], total };
}

/**
 * Получает диалог по ID. Возвращает null, если диалог не найден
 * или не принадлежит указанному пользователю.
 */
export async function getConversation(
  prisma: PrismaClient,
  conversationId: string,
  userId: string,
): Promise<Conversation | null> {
  return prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
}

/**
 * Получает диалог с сообщениями. Сообщения отсортированы хронологически.
 * Возвращает null, если диалог не найден или не принадлежит пользователю.
 */
export async function getConversationWithMessages(
  prisma: PrismaClient,
  conversationId: string,
  userId: string,
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });

  if (!conversation) return null;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      conversationId: true,
      role: true,
      content: true,
      attachments: true,
      createdAt: true,
    },
  });

  return { conversation, messages: messages as Message[] };
}

/**
 * Отправляет сообщение пользователя и подготавливает LLM-стрим.
 *
 * Возвращает объект с:
 *   - userMessage — сохранённое сообщение пользователя
 *   - stream — async-генератор с токенами от LLM
 *   - saveAssistantMessage — функция для сохранения полного ответа после стриминга
 *
 * Разделение на подготовку стрима и сохранение ответа позволяет
 * обработчику роута управлять SSE-потоком между этими шагами.
 */
export async function sendMessage(
  prisma: PrismaClient,
  conversationId: string,
  userId: string,
  content: string,
): Promise<SendMessageResult> {
  // Проверяем принадлежность диалога пользователю
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });

  if (!conversation) {
    const err = new Error('Диалог не найден');
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }

  // Сохраняем сообщение пользователя
  const userMessage = await prisma.message.create({
    data: {
      conversationId,
      role: 'USER',
      content,
    },
  });

  // Загружаем всю историю диалога для контекста LLM
  const previousMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });

  // Формируем массив сообщений для LLM:
  // системный промпт → история диалога (включая только что созданное сообщение)
  const llmMessages: OpenAI.ChatCompletionMessageParam[] = [
    getSystemMessage(),
    ...previousMessages.map(toOpenAIMessage),
  ];

  // Создаём async-генератор стриминга
  const stream = streamChat(llmMessages);

  // Функция сохранения ответа ассистента — вызывается после окончания стриминга
  const saveAssistantMessage = async (fullContent: string): Promise<Message> => {
    const [assistantMessage] = await Promise.all([
      prisma.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: fullContent,
        },
      }),
      // Обновляем updatedAt у диалога
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return assistantMessage;
  };

  return { userMessage, stream, saveAssistantMessage };
}

/**
 * Удаляет диалог и все его сообщения.
 * Возвращает false, если диалог не найден или не принадлежит пользователю.
 */
export async function deleteConversation(
  prisma: PrismaClient,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });

  if (!conversation) return false;

  // Удаляем сначала сообщения (FK constraint), потом сам диалог
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { conversationId } }),
    prisma.conversation.delete({ where: { id: conversationId } }),
  ]);

  return true;
}
