'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Scale, MessageSquarePlus, FileDown, Loader2 } from 'lucide-react';

import { useChatStore } from '@/stores/chat';
import { conversations as conversationsApi, downloadBlob } from '@/lib/api';
import { MessageBubble } from './MessageBubble';
import { StreamingBubble } from './StreamingBubble';
import { MessageInput } from './MessageInput';

/**
 * Основное окно чата.
 * Показывает список сообщений, стримящийся ответ и поле ввода.
 * Если нет выбранного диалога — приветственный экран.
 */
export function ChatWindow() {
  const {
    currentConversationId,
    conversations,
    messages,
    isStreaming,
    streamingContent,
    sendMessage,
    isUploading,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Автоскролл при новых сообщениях и стриминге
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Текущий диалог для отображения заголовка
  const currentConversation = conversations.find(
    (c) => c.id === currentConversationId,
  );

  /** Экспорт текущего диалога в .docx */
  const handleExportDocx = useCallback(async () => {
    if (!currentConversationId || isExporting) return;
    setIsExporting(true);
    try {
      const blob = await conversationsApi.exportDocx(currentConversationId);
      const date = currentConversation
        ? new Date(currentConversation.createdAt).toLocaleDateString('ru-RU')
        : new Date().toLocaleDateString('ru-RU');
      downloadBlob(blob, `Диалог_${date}.docx`);
    } catch (err) {
      console.error('Ошибка экспорта диалога:', err);
    } finally {
      setIsExporting(false);
    }
  }, [currentConversationId, currentConversation, isExporting]);

  // Если нет выбранного диалога — приветственный экран
  if (!currentConversationId) {
    return <WelcomeScreen />;
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Заголовок чата с кнопкой экспорта */}
      <div className="flex items-center justify-between border-b border-surface-elevated px-4 py-3">
        <h2 className="min-w-0 truncate text-sm font-medium text-gray-300">
          {currentConversation?.title || 'Новый диалог'}
        </h2>
        <button
          onClick={handleExportDocx}
          disabled={isExporting || messages.length === 0}
          className="ml-3 flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-elevated hover:text-gray-200 disabled:pointer-events-none disabled:opacity-40"
          title="Экспорт в Word"
          aria-label="Экспорт в Word"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          <span>{isExporting ? 'Экспорт...' : 'Word'}</span>
        </button>
      </div>

      {/* Список сообщений */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-gray-500">
              <Scale className="mb-3 h-10 w-10 text-gray-600" />
              <p className="text-sm">Начните диалог — задайте вопрос</p>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {/* Стримящийся ответ */}
          {isStreaming && <StreamingBubble content={streamingContent} />}

          {/* Якорь для автоскролла */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Поле ввода */}
      <MessageInput
        onSend={sendMessage}
        disabled={isStreaming}
        isUploading={isUploading}
      />
    </div>
  );
}

/** Приветственный экран (когда нет выбранного диалога) */
function WelcomeScreen() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/20">
          <Scale className="h-8 w-8 text-brand-400" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-gray-100">Lawer</h1>
        <p className="mb-8 text-gray-400">AI-ассистент юридического отдела</p>

        <div className="mb-8 grid gap-3 text-left text-sm">
          <FeatureHint text="Анализ юридических документов и выявление рисков" />
          <FeatureHint text="Генерация договоров по шаблонам" />
          <FeatureHint text="Ответы на вопросы с ссылками на НПА РФ" />
          <FeatureHint text="Управление задачами и дедлайнами" />
        </div>

        <div className="flex items-center justify-center gap-2 text-gray-500">
          <MessageSquarePlus className="h-4 w-4" />
          <span className="text-sm">Начните новый диалог</span>
        </div>
      </div>
    </div>
  );
}

function FeatureHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-surface-elevated bg-surface-secondary px-4 py-3 text-gray-300">
      {text}
    </div>
  );
}
