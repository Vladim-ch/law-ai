/**
 * Сервис диалогов — бизнес-логика создания, получения, удаления диалогов
 * и отправки сообщений с LLM-стримингом.
 *
 * Изолирует Prisma-запросы и формирование контекста LLM от HTTP-слоя.
 */

import type { PrismaClient, Conversation, Message } from '@prisma/client';
import type OpenAI from 'openai';
import type { InputJsonValue } from '@prisma/client/runtime/library';

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

/** Лимит символов текста документа, вставляемого в LLM-контекст. */
const DOCUMENT_CONTEXT_CHAR_LIMIT = 50_000;

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
 *
 * @param documentId — если передан, текст документа подгружается из БД
 *   и вставляется в контекст LLM как system-сообщение. В БД сохраняется
 *   только пользовательский запрос (без текста документа).
 */
export async function sendMessage(
  prisma: PrismaClient,
  conversationId: string,
  userId: string,
  content: string,
  documentId?: string,
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

  // Если передан documentId — загружаем документ и проверяем владельца
  let documentContext: OpenAI.ChatCompletionMessageParam | null = null;
  let attachments: InputJsonValue | undefined;

  if (documentId) {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
    });

    if (!doc) {
      const err = new Error('Документ не найден');
      (err as Error & { statusCode: number }).statusCode = 404;
      throw err;
    }

    if (doc.contentText) {
      documentContext = {
        role: 'system',
        content: `Контекст: загружен документ "${doc.filename}". Текст документа:\n---\n${doc.contentText.slice(0, DOCUMENT_CONTEXT_CHAR_LIMIT)}\n---`,
      };
    }

    attachments = {
      documentId: doc.id,
      filename: doc.filename,
      fileType: doc.fileType,
    } as unknown as InputJsonValue;
  }

  // Сохраняем сообщение пользователя (без текста документа — только запрос)
  const userMessage = await prisma.message.create({
    data: {
      conversationId,
      role: 'USER',
      content,
      ...(attachments ? { attachments } : {}),
    },
  });

  // Загружаем всю историю диалога для контекста LLM
  const previousMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });

  // Формируем массив сообщений для LLM:
  // системный промпт → история → [контекст документа] → текущее сообщение
  const llmMessages: OpenAI.ChatCompletionMessageParam[] = [
    getSystemMessage(),
    ...previousMessages.slice(0, -1).map(toOpenAIMessage),
  ];

  // Вставляем контекст документа перед текущим user-сообщением
  if (documentContext) {
    llmMessages.push(documentContext);
  }

  // Добавляем текущее сообщение пользователя
  llmMessages.push(toOpenAIMessage(userMessage));

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
