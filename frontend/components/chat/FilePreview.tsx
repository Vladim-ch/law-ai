'use client';

import { FileText, FileType, X, Loader2 } from 'lucide-react';

/** Форматирует размер файла в человекочитаемый вид */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** Иконка в зависимости от типа файла */
function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const Icon = ext === 'pdf' ? FileType : FileText;
  return <Icon className="h-5 w-5 shrink-0 text-brand-400" />;
}

interface FilePreviewProps {
  file: File;
  onRemove: () => void;
  isUploading?: boolean;
}

/**
 * Плашка предпросмотра прикреплённого файла.
 * Показывает имя, размер и кнопку удаления.
 */
export function FilePreview({ file, onRemove, isUploading }: FilePreviewProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-surface-elevated bg-surface-tertiary px-3 py-2">
      <FileIcon filename={file.name} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-200">
          {file.name}
        </p>
        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
      </div>

      {isUploading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-400" />
      ) : (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Удалить файл"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-surface-elevated hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
