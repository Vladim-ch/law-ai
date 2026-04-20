'use client';

import { useState, useCallback } from 'react';
import { ArrowLeft, Eye, Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { TemplatePreview } from './TemplatePreview';
import { templates as templatesApi } from '@/lib/api';
import type { Template } from '@/lib/types';

interface TemplateFormProps {
  template: Template;
  onBack: () => void;
}

/** Форма заполнения параметров шаблона + превью + скачивание .docx */
export function TemplateForm({ template, onBack }: TemplateFormProps) {
  // Инициализируем значения параметров дефолтами
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of template.parameters) {
      init[p.key] = p.default ?? '';
    }
    return init;
  });

  const [previewText, setPreviewText] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Обновить значение параметра */
  const handleChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** Проверить, заполнены ли все обязательные поля */
  const validateRequired = useCallback((): boolean => {
    for (const p of template.parameters) {
      if (p.required && !values[p.key]?.trim()) {
        setError(`Заполните обязательное поле: ${p.label}`);
        return false;
      }
    }
    setError(null);
    return true;
  }, [template.parameters, values]);

  /** Предпросмотр — генерация заполненного текста */
  const handlePreview = async () => {
    if (!validateRequired()) return;

    setIsGenerating(true);
    setError(null);
    try {
      const { filledText, missingParams } = await templatesApi.generate(template.id, values);

      if (missingParams && missingParams.length > 0) {
        setError(`Не заполнены параметры: ${missingParams.join(', ')}`);
      }

      setPreviewText(filledText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка генерации превью');
    } finally {
      setIsGenerating(false);
    }
  };

  /** Скачать .docx */
  const handleDownload = async () => {
    if (!validateRequired()) return;

    setIsDownloading(true);
    setError(null);
    try {
      const blob = await templatesApi.downloadDocx(template.id, values);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name}_${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка скачивания документа');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Кнопка назад */}
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад к шаблонам
      </button>

      {/* Заголовок */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-100">{template.name}</h2>
        <span className="mt-1 inline-block rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-gray-400">
          {template.category}
        </span>
      </div>

      {/* Ошибка */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Форма параметров */}
      <div className="space-y-4">
        {template.parameters.map((param) => (
          <div key={param.key}>
            <label
              htmlFor={`param-${param.key}`}
              className="mb-1.5 block text-sm font-medium text-gray-300"
            >
              {param.label}
              {param.required && <span className="ml-0.5 text-red-400">*</span>}
            </label>

            {param.type === 'text' ? (
              <textarea
                id={`param-${param.key}`}
                value={values[param.key] ?? ''}
                onChange={(e) => handleChange(param.key, e.target.value)}
                placeholder={param.label}
                rows={4}
                className="w-full rounded-lg border border-surface-elevated bg-surface px-3 py-2 text-sm text-gray-200 placeholder-gray-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            ) : (
              <input
                id={`param-${param.key}`}
                type={param.type === 'date' ? 'date' : 'text'}
                value={values[param.key] ?? ''}
                onChange={(e) => handleChange(param.key, e.target.value)}
                placeholder={param.type === 'date' ? '' : param.label}
                className="w-full rounded-lg border border-surface-elevated bg-surface px-3 py-2 text-sm text-gray-200 placeholder-gray-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            )}
          </div>
        ))}
      </div>

      {/* Кнопки действий */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          variant="secondary"
          size="md"
          className="gap-2"
          onClick={handlePreview}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          Предпросмотр
        </Button>

        <Button
          variant="primary"
          size="md"
          className="gap-2"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Скачать .docx
        </Button>
      </div>

      {/* Модальное окно превью */}
      {previewText !== null && (
        <TemplatePreview
          filledText={previewText}
          onClose={() => setPreviewText(null)}
        />
      )}
    </div>
  );
}
