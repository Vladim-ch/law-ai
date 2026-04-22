'use client';

import { Scale, User } from 'lucide-react';

import type { Message } from '@/lib/types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MessageBubbleProps {
  message: Message;
}

/** Форматирует дату сообщения в HH:MM */
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Пузырёк одного сообщения.
 * USER — справа, простой текст.
 * ASSISTANT — слева, Markdown-рендеринг.
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'USER';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Аватар */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-brand-600/20' : 'bg-surface-elevated'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-brand-400" />
        ) : (
          <Scale className="h-4 w-4 text-gray-400" />
        )}
      </div>

      {/* Содержимое */}
      <div className={`min-w-0 max-w-[75%] ${isUser ? 'text-right' : 'text-left'}`}>
        <div
          className={`inline-block max-w-full overflow-hidden rounded-2xl px-4 py-3 ${
            isUser
              ? 'rounded-tr-sm bg-brand-600/20 text-gray-200'
              : 'rounded-tl-sm bg-surface-tertiary text-gray-300'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          ) : (
            <div className="text-sm">
              <MarkdownRenderer content={message.content} />
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-600">{formatTime(message.createdAt)}</p>
      </div>
    </div>
  );
}
