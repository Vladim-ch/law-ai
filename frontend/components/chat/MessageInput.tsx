'use client';

import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { Send, Paperclip } from 'lucide-react';

import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from '@/lib/api';
import { FilePreview } from './FilePreview';

interface MessageInputProps {
  onSend: (content: string, file?: File) => void;
  disabled?: boolean;
  /** Файл загружается на сервер */
  isUploading?: boolean;
}

/**
 * Поле ввода сообщения с возможностью прикрепления документа.
 * Textarea с авто-ростом, Enter для отправки, Shift+Enter для переноса строки.
 */
export function MessageInput({ onSend, disabled, isUploading }: MessageInputProps) {
  const [value, setValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Авто-подстройка высоты textarea */
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  /** Валидация выбранного файла */
  const validateFile = useCallback((file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `Файл слишком большой (макс. 50 МБ)`;
    }

    // Проверяем по MIME-типу или расширению
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    const allowedExts = Object.values(ALLOWED_FILE_TYPES);
    const isMimeAllowed = file.type in ALLOWED_FILE_TYPES;
    const isExtAllowed = allowedExts.includes(ext);

    if (!isMimeAllowed && !isExtAllowed) {
      return `Неподдерживаемый формат. Допустимы: ${ALLOWED_EXTENSIONS}`;
    }

    return null;
  }, []);

  /** Обработка выбора файла */
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const error = validateFile(file);
      if (error) {
        setFileError(error);
        setAttachedFile(null);
      } else {
        setFileError(null);
        setAttachedFile(file);
      }

      // Сбрасываем input, чтобы можно было выбрать тот же файл повторно
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [validateFile],
  );

  /** Удалить прикреплённый файл */
  const handleRemoveFile = useCallback(() => {
    setAttachedFile(null);
    setFileError(null);
  }, []);

  /** Отправка сообщения */
  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    // Можно отправить без текста, если есть файл
    if ((!trimmed && !attachedFile) || disabled || isUploading) return;

    onSend(trimmed, attachedFile ?? undefined);
    setValue('');
    setAttachedFile(null);
    setFileError(null);

    // Сбрасываем высоту
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, attachedFile, disabled, isUploading, onSend]);

  /** Обработка нажатия клавиш */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const canSend = (value.trim() || attachedFile) && !disabled && !isUploading;

  return (
    <div className="border-t border-surface-elevated bg-surface-secondary p-4">
      <div className="mx-auto max-w-3xl">
        {/* Ошибка валидации файла */}
        {fileError && (
          <div className="mb-2 rounded-lg bg-red-900/30 px-3 py-2 text-xs text-red-400">
            {fileError}
          </div>
        )}

        {/* Preview прикреплённого файла */}
        {attachedFile && (
          <div className="mb-2">
            <FilePreview
              file={attachedFile}
              onRemove={handleRemoveFile}
              isUploading={isUploading}
            />
          </div>
        )}

        {/* Поле ввода и кнопки */}
        <div className="flex items-end gap-3">
          {/* Кнопка прикрепления файла */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            aria-label="Прикрепить документ"
            title="Прикрепить документ"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-surface-elevated bg-surface-tertiary text-gray-400 transition-colors hover:border-brand-500 hover:text-brand-400 disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          {/* Скрытый input для выбора файла */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS}
            onChange={handleFileSelect}
            className="hidden"
          />

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              attachedFile
                ? 'Добавьте комментарий или нажмите отправить...'
                : 'Задайте юридический вопрос...'
            }
            disabled={disabled || isUploading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-surface-elevated bg-surface-tertiary px-4 py-3 text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors focus:border-brand-500 disabled:opacity-50"
          />

          <button
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Отправить"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition-colors hover:bg-brand-500 active:bg-brand-700 disabled:opacity-50 disabled:hover:bg-brand-600"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
