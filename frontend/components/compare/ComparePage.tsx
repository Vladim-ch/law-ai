'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, Loader2, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { documents as docsApi } from '@/lib/api';
import type { DocumentInfo, CompareResult as CompareResultType } from '@/lib/types';

import { DocumentSelector } from './DocumentSelector';
import { CompareResult } from './CompareResult';

/**
 * Страница «Сравнение документов».
 * Два состояния: выбор документов и отображение результата.
 */
export function ComparePage() {
  // Список документов пользователя
  const [documentsList, setDocumentsList] = useState<DocumentInfo[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);

  // Выбранные документы
  const [docA, setDocA] = useState<DocumentInfo | null>(null);
  const [docB, setDocB] = useState<DocumentInfo | null>(null);

  // Состояние сравнения
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResultType | null>(null);

  /** Загрузить список документов */
  const loadDocuments = useCallback(async () => {
    setIsLoadingDocs(true);
    try {
      const { documents } = await docsApi.list();
      setDocumentsList(documents);
    } catch (err) {
      console.error('Ошибка загрузки списка документов:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  /** Запустить сравнение */
  const handleCompare = async () => {
    if (!docA || !docB) return;

    setIsComparing(true);
    setCompareError(null);

    try {
      const { result } = await docsApi.compare(docA.id, docB.id);
      setCompareResult(result);
    } catch (err) {
      console.error('Ошибка сравнения:', err);
      setCompareError(
        err instanceof Error ? err.message : 'Ошибка при сравнении документов. Попробуйте ещё раз.',
      );
    } finally {
      setIsComparing(false);
    }
  };

  /** Сбросить результат и вернуться к выбору */
  const handleReset = () => {
    setCompareResult(null);
    setCompareError(null);
  };

  // Если есть результат — показываем его
  if (compareResult) {
    return (
      <CompareResult
        result={compareResult}
        filenameA={docA?.filename || 'Документ A'}
        filenameB={docB?.filename || 'Документ B'}
        onReset={handleReset}
      />
    );
  }

  // Состояние выбора документов
  const canCompare = docA !== null && docB !== null && docA.id !== docB.id && !isComparing;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Заголовок */}
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="h-7 w-7 text-brand-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Сравнение документов</h1>
            <p className="mt-1 text-sm text-gray-400">
              Загрузите или выберите два документа для сравнения
            </p>
          </div>
        </div>

        {/* Два блока выбора документов */}
        {isLoadingDocs ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row">
            <DocumentSelector
              label="Документ A"
              documentsList={documentsList}
              selectedDocument={docA}
              onSelect={setDocA}
              onDocumentUploaded={loadDocuments}
            />
            <DocumentSelector
              label="Документ B"
              documentsList={documentsList}
              selectedDocument={docB}
              onSelect={setDocB}
              onDocumentUploaded={loadDocuments}
            />
          </div>
        )}

        {/* Предупреждение: одинаковые документы */}
        {docA && docB && docA.id === docB.id && (
          <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Выберите разные документы для сравнения
          </div>
        )}

        {/* Ошибка */}
        {compareError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {compareError}
          </div>
        )}

        {/* Кнопка сравнения */}
        <Button
          onClick={handleCompare}
          disabled={!canCompare}
          size="lg"
          className="w-full justify-center gap-2"
        >
          {isComparing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowLeftRight className="h-4 w-4" />
          )}
          {isComparing ? 'Сравнение...' : 'Сравнить документы'}
        </Button>
      </div>
    </div>
  );
}
