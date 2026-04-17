'use client';

import { create } from 'zustand';

import { conversations as convApi } from '@/lib/api';
import type { Conversation, Message, SSEEvent } from '@/lib/types';

/** Состояние чата */
interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  /** Текущий стримящийся фрагмент ответа ассистента */
  streamingContent: string;
  isLoadingConversations: boolean;

  /** Загрузить список диалогов */
  loadConversations: () => Promise<void>;

  /** Выбрать диалог и загрузить его сообщения */
  selectConversation: (id: string) => Promise<void>;

  /** Создать новый диалог и вернуть его id */
  createConversation: (title?: string) => Promise<string>;

  /** Удалить диалог */
  deleteConversation: (id: string) => Promise<void>;

  /** Отправить сообщение с SSE-стримингом ответа */
  sendMessage: (content: string) => Promise<void>;

  /** Сбросить выбранный диалог */
  clearCurrentConversation: () => void;
}

/**
 * Парсит SSE-данные из текстового чанка.
 * Формат: data: {...}\n\n
 */
function parseSSEChunk(chunk: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const lines = chunk.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data: ')) {
      try {
        const json = JSON.parse(trimmed.slice(6));
        events.push(json as SSEEvent);
      } catch {
        // Пропускаем некорректные строки
      }
    }
  }

  return events;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  isLoadingConversations: false,

  loadConversations: async () => {
    set({ isLoadingConversations: true });
    try {
      const { conversations } = await convApi.list();
      set({ conversations, isLoadingConversations: false });
    } catch {
      set({ isLoadingConversations: false });
    }
  },

  selectConversation: async (id) => {
    set({ currentConversationId: id, messages: [] });
    try {
      const { messages } = await convApi.get(id);
      set({ messages });
    } catch {
      // При ошибке оставляем пустой список
    }
  },

  createConversation: async (title) => {
    const { conversation } = await convApi.create(title);
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      currentConversationId: conversation.id,
      messages: [],
    }));
    return conversation.id;
  },

  deleteConversation: async (id) => {
    await convApi.delete(id);
    set((state) => {
      const conversations = state.conversations.filter((c) => c.id !== id);
      const isCurrentDeleted = state.currentConversationId === id;
      return {
        conversations,
        ...(isCurrentDeleted
          ? { currentConversationId: null, messages: [] }
          : {}),
      };
    });
  },

  clearCurrentConversation: () => {
    set({ currentConversationId: null, messages: [] });
  },

  sendMessage: async (content) => {
    const { currentConversationId } = get();
    if (!currentConversationId) return;

    // 1. Оптимистично добавляем сообщение пользователя
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'USER',
      content,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      messages: [...state.messages, userMessage],
      isStreaming: true,
      streamingContent: '',
    }));

    try {
      // 2. Отправляем запрос и читаем SSE-поток
      const response = await convApi.sendMessage(currentConversationId, content);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      let fullContent = '';
      let assistantMessageId = '';
      // Буфер для неполных SSE-строк
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Обрабатываем только полные SSE-блоки (разделённые \n\n)
        const parts = buffer.split('\n\n');
        // Последний элемент может быть неполным — оставляем в буфере
        buffer = parts.pop() || '';

        for (const part of parts) {
          const events = parseSSEChunk(part);

          for (const event of events) {
            switch (event.type) {
              case 'message_start':
                assistantMessageId = event.messageId;
                break;

              case 'token':
                fullContent += event.content;
                set({ streamingContent: fullContent });
                break;

              case 'message_end': {
                const finalContent = event.content || fullContent;
                const assistantMessage: Message = {
                  id: assistantMessageId || event.messageId,
                  role: 'ASSISTANT',
                  content: finalContent,
                  createdAt: new Date().toISOString(),
                };
                set((state) => ({
                  messages: [...state.messages, assistantMessage],
                  isStreaming: false,
                  streamingContent: '',
                }));
                break;
              }

              case 'error':
                set({ isStreaming: false, streamingContent: '' });
                console.error('SSE error:', event.error);
                break;
            }
          }
        }
      }

      // Если поток закончился без message_end — завершаем
      if (get().isStreaming && fullContent) {
        const assistantMessage: Message = {
          id: assistantMessageId || `assistant-${Date.now()}`,
          role: 'ASSISTANT',
          content: fullContent,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          messages: [...state.messages, assistantMessage],
          isStreaming: false,
          streamingContent: '',
        }));
      }

      // Обновляем список диалогов (title мог измениться)
      get().loadConversations();
    } catch (error) {
      set({ isStreaming: false, streamingContent: '' });
      console.error('Ошибка отправки сообщения:', error);
    }
  },
}));
