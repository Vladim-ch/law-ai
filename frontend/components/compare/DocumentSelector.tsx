'use client';

import { useState, useRef } from 'react';
import { Upload, ChevronDown, FileText, Check, Loader2 } from 'lucide-react';

import { documents as docsApi, ALLOWED_EXTENSIONS } from '@/lib/api';
import type { DocumentInfo } from '@/lib/types';

interface DocumentSelectorProps {
  /** Метка: "Документ A" / "Документ B" */
  label: string;
  /** Список документов пользователя */
  documentsList: DocumentInfo[];
  /** Выбранный документ */
  selectedDocument: DocumentInfo | null;
  /** Коллбэк при выборе/загрузке документа */
  onSelect: (doc: DocumentInfo) => void;
  /** Коллбэк для обновления списка документов после загрузки нового */
  onDocumentUploaded: () => void;
}

/**
 * Компонент выбора одного документа для сравнения.
 * Позволяет выбрать из существующих или загрузить новый.
 */
export function DocumentSelector({
  label,
  documentsList,
  selectedDocument,
  onSelect,
  onDocumentUploaded,
}: DocumentSelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Загрузить новый файл и автовыбрать его */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const { document: doc } = await docsApi.upload(file);
      // Создаём DocumentInfo из ответа
      const docInfo: DocumentInfo = {
        id: doc.id,
        filename: doc.filename,
        fileType: doc.fileType,
        createdAt: doc.createdAt,
      };
      onSelect(docInfo);
      onDocumentUploaded();
    } catch (err) {
      console.error('Ошибка загрузки документа:', err);
      setUploadError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setIsUploading(false);
      // Сбрасываем input, чтобы можно было загрузить тот же файл повторно
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-surface-elevated bg-surface-secondary p-4">
      <span className="mb-3 text-sm font-medium text-gray-300">{label}</span>

      {/* Dropdown выбора из существующих */}
      <div className="relative mb-3">
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex w-full items-center justify-between rounded-lg border border-surface-elevated bg-surface px-3 py-2.5 text-sm text-gray-200 transition-colors hover:border-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <span className={selectedDocument ? 'text-gray-200' : 'text-gray-500'}>
            {selectedDocument ? selectedDocument.filename : 'Выбрать файл'}
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isDropdownOpen && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-elevated bg-surface shadow-lg">
            {documentsList.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-500">
                Нет загруженных документов
              </div>
            ) : (
              documentsList.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => {
                    onSelect(doc);
                    setIsDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-surface-elevated"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                  <span className="min-w-0 flex-1 truncate">{doc.filename}</span>
                  {selectedDocument?.id === doc.id && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-brand-400" />
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Разделитель */}
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-surface-elevated" />
        <span className="text-xs text-gray-500">или</span>
        <div className="h-px flex-1 bg-surface-elevated" />
      </div>

      {/* Кнопка загрузки */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-surface-elevated px-3 py-2.5 text-sm text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-300 disabled:opacity-50"
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {isUploading ? 'Загрузка...' : 'Загрузить новый'}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS}
        onChange={handleFileUpload}
        className="hidden"
        aria-label={`Загрузить файл для ${label}`}
      />

      {/* Ошибка загрузки */}
      {uploadError && (
        <p className="mt-2 text-xs text-red-400">{uploadError}</p>
      )}

      {/* Выбранный документ */}
      {selectedDocument && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">
          <Check className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{selectedDocument.filename}</span>
        </div>
      )}
    </div>
  );
}
