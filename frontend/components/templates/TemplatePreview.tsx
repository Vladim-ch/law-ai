'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface TemplatePreviewProps {
  filledText: string;
  onClose: () => void;
}

/** Модальное окно с превью заполненного шаблона */
export function TemplatePreview({ filledText, onClose }: TemplatePreviewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-surface-elevated bg-surface-secondary shadow-2xl">
        {/* Заголовок */}
        <div className="flex items-center justify-between border-b border-surface-elevated px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-200">Предпросмотр документа</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-surface-elevated hover:text-gray-300"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Тело документа */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="whitespace-pre-wrap rounded-lg border border-surface-elevated bg-surface p-5 font-sans text-sm leading-relaxed text-gray-300">
            {filledText}
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex justify-end border-t border-surface-elevated px-6 py-3">
          <Button variant="secondary" size="md" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}
