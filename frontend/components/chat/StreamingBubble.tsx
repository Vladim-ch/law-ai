'use client';

import { Scale } from 'lucide-react';

import { MarkdownRenderer } from './MarkdownRenderer';

interface StreamingBubbleProps {
  content: string;
}

/**
 * Пузырёк стримящегося ответа ассистента.
 * Показывает контент по мере поступления с мигающим курсором.
 */
export function StreamingBubble({ content }: StreamingBubbleProps) {
  return (
    <div className="flex gap-3">
      {/* Аватар */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated">
        <Scale className="h-4 w-4 text-gray-400" />
      </div>

      {/* Содержимое */}
      <div className="max-w-[75%] text-left">
        <div className="inline-block rounded-2xl rounded-tl-sm bg-surface-tertiary px-4 py-3 text-gray-300">
          {content ? (
            <div className="text-sm">
              <MarkdownRenderer content={content} />
              {/* Мигающий курсор */}
              <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-brand-400" />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:300ms]" />
              </div>
              <span>ИИ думает...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
